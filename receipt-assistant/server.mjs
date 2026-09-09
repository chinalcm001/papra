import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandReceiptSearchQuery } from './search-query.mjs';
import { classifyAssistantIntent, createLedger, inferDateRange, inferSummaryFilters, parseTransactionText } from './ledger.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const PAPRA_URL = (process.env.PAPRA_URL || '').replace(/\/$/, '');
const PAPRA_API_TOKEN = process.env.PAPRA_API_TOKEN || '';
const PAPRA_ORGANIZATION_ID = process.env.PAPRA_ORGANIZATION_ID || '';
const PAGE_SIZE = Math.min(Math.max(Number(process.env.PAPRA_PAGE_SIZE || 20), 1), 100);
const DEMO_MODE = /^true$/i.test(process.env.PAPRA_DEMO || '');
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'EUR';
const LEDGER_DB_PATH = process.env.LEDGER_DB_PATH || join(__dirname, 'data', 'ledger.sqlite');
const ledger = createLedger({ dbPath: LEDGER_DB_PATH, defaultCurrency: DEFAULT_CURRENCY });

const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

const DEMO_DOCUMENTS = [
  { id: 'demo-rowenta', organizationId: 'demo-org', name: 'MediaMarkt_2025-11-12_ticket.jpg', mimeType: 'image/jpeg', createdAt: '2025-11-12T18:14:00.000Z', documentDate: '2025-11-12T00:00:00.000Z', content: 'MEDIAMARKT ROWENTA X-FORCE ASPIRADOR SIN CABLE TOTAL 399,00 EUR TICKET 12/11/2025', notes: '演示数据：Rowenta 吸尘器小票', tags: [{ id: 'tag-warranty', name: '保修' }] },
  { id: 'demo-ikea', organizationId: 'demo-org', name: 'IKEA_sofa_receipt.pdf', mimeType: 'application/pdf', createdAt: '2026-03-03T12:00:00.000Z', documentDate: '2026-03-03T00:00:00.000Z', content: 'IKEA VALENCIA SOFÁ TOTAL 799,00 EUR FACTURA', notes: '演示数据：IKEA 沙发小票', tags: [] },
];

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}
function text(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'content-type': contentType });
  res.end(body);
}
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  if (raw.length > 100_000) throw new Error('请求内容过大');
  return JSON.parse(raw);
}
function getPapraConfigError() {
  if (DEMO_MODE) return null;
  if (!PAPRA_URL) return '缺少 PAPRA_URL';
  if (!PAPRA_API_TOKEN) return 'Papra API Token 尚未配置';
  if (!PAPRA_ORGANIZATION_ID) return 'Papra Organization ID 尚未配置';
  return null;
}
function normalizeDocument(doc) {
  return {
    id: doc.id, organizationId: doc.organizationId, name: doc.name, mimeType: doc.mimeType,
    createdAt: doc.createdAt, documentDate: doc.documentDate, notes: doc.notes || '',
    tags: Array.isArray(doc.tags) ? doc.tags.map((tag) => ({ id: tag.id, name: tag.name })) : [],
    contentSnippet: String(doc.content || '').replace(/\s+/g, ' ').trim().slice(0, 260),
  };
}

async function searchPapra(query) {
  const expanded = expandReceiptSearchQuery(query);
  if (DEMO_MODE) {
    const terms = expanded.displayTerms.map((term) => term.toLowerCase());
    const documents = DEMO_DOCUMENTS.filter((doc) => {
      const haystack = `${doc.name} ${doc.content} ${doc.notes}`.toLowerCase();
      return terms.length === 0 || terms.some((term) => haystack.includes(term));
    });
    return { expanded, documents: documents.map(normalizeDocument), documentsCount: documents.length, demo: true, papraBaseUrl: '', organizationId: 'demo-org' };
  }
  const configError = getPapraConfigError();
  if (configError) throw new Error(configError);
  const url = new URL(`/api/organizations/${encodeURIComponent(PAPRA_ORGANIZATION_ID)}/documents`, PAPRA_URL);
  url.searchParams.set('searchQuery', expanded.searchQuery);
  url.searchParams.set('pageIndex', '0');
  url.searchParams.set('pageSize', String(PAGE_SIZE));
  url.searchParams.set('sortField', 'createdAt');
  url.searchParams.set('sortOrder', 'desc');
  const response = await fetch(url, { headers: { authorization: `Bearer ${PAPRA_API_TOKEN}`, accept: 'application/json' } });
  if (!response.ok) throw new Error(`Papra API 返回 ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  return { expanded, documents: (payload.documents || []).map(normalizeDocument), documentsCount: Number(payload.documentsCount || 0), demo: false, papraBaseUrl: PAPRA_URL, organizationId: PAPRA_ORGANIZATION_ID };
}

function parseRecentLimit(value) {
  const match = String(value).match(/(?:最近|近来)\s*(\d{1,2})\s*笔/);
  return match ? Math.min(Number(match[1]), 100) : 10;
}
function money(cents, currency = DEFAULT_CURRENCY) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(cents / 100);
}

async function handleChat(input, source = 'text') {
  const intent = classifyAssistantIntent(input);
  if (intent === 'add_transaction') {
    const transaction = parseTransactionText(input, { currency: DEFAULT_CURRENCY });
    if (transaction.amountCents === null) return { intent, type: 'message', message: '我理解你想记账，但没有识别到金额。可以说：昨天 Mercadona 买菜 35.60欧。' };
    return { intent, type: 'confirm_transaction', transaction: { ...transaction, source }, message: `准备记录一笔${transaction.kind === 'income' ? '收入' : '支出'} ${money(transaction.amountCents, transaction.currency)}，请确认。` };
  }
  if (intent === 'ledger_summary') {
    const filters = inferSummaryFilters(input);
    const summary = ledger.summarize(filters);
    return { intent, type: 'summary', filters, summary, message: `${filters.label}${filters.category ? ` · ${filters.category}` : ''}${filters.merchant ? ` · ${filters.merchant}` : ''}：支出 ${money(summary.expenseCents)}，收入 ${money(summary.incomeCents)}。` };
  }
  if (intent === 'list_transactions') {
    const range = inferDateRange(input);
    const transactions = ledger.listTransactions({ limit: parseRecentLimit(input), from: range.from, toExclusive: range.toExclusive });
    return { intent, type: 'transactions', range, transactions, message: `找到 ${transactions.length} 笔记录。` };
  }
  if (intent === 'receipt_search') {
    try {
      const receipts = await searchPapra(input);
      return { intent, type: 'receipts', ...receipts, message: `找到 ${receipts.documentsCount} 张相关票据。` };
    } catch (error) {
      return { intent, type: 'message', message: `记账功能可用，但小票搜索暂不可用：${error.message}` };
    }
  }
  return { intent: 'help', type: 'message', message: '你可以说：①“昨天 Mercadona 买菜 35.60欧”；②“这个月超市花了多少”；③“最近10笔”；④“找去年 MediaMarkt 的吸尘器小票”。' };
}

async function proxyDocumentFile(documentId, res) {
  if (DEMO_MODE) return text(res, 200, '演示模式没有真实小票文件。配置 Papra 后这里会打开原始图片或 PDF。');
  const configError = getPapraConfigError();
  if (configError) return json(res, 503, { error: configError });
  const url = new URL(`/api/organizations/${encodeURIComponent(PAPRA_ORGANIZATION_ID)}/documents/${encodeURIComponent(documentId)}/file`, PAPRA_URL);
  const response = await fetch(url, { headers: { authorization: `Bearer ${PAPRA_API_TOKEN}` } });
  if (!response.ok) return json(res, response.status, { error: (await response.text()) || '无法读取原始文件' });
  const headers = { 'content-type': response.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'private, max-age=60' };
  const disposition = response.headers.get('content-disposition');
  if (disposition) headers['content-disposition'] = disposition;
  res.writeHead(200, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function serveStatic(pathname, res) {
  const entry = STATIC_FILES.get(pathname);
  if (!entry) return false;
  const [fileName, contentType] = entry;
  const body = await readFile(join(__dirname, 'public', fileName));
  res.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-cache' });
  res.end(body);
  return true;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, ledger: true, papraConfigured: !getPapraConfigError(), papraMessage: getPapraConfigError() || 'ok', demo: DEMO_MODE });
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const body = await readJsonBody(req);
        const input = String(body.message || '').trim();
        if (!input) return json(res, 400, { error: '请输入内容' });
        return json(res, 200, await handleChat(input, body.source === 'voice' ? 'voice' : 'text'));
      }
      if (req.method === 'POST' && url.pathname === '/api/ledger/transactions') {
        const body = await readJsonBody(req);
        const saved = ledger.addTransaction({ ...body, currency: body.currency || DEFAULT_CURRENCY });
        return json(res, 201, { transaction: saved, message: `已记录 ${money(saved.amountCents, saved.currency)}` });
      }
      if (req.method === 'GET' && url.pathname === '/api/ledger/transactions') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 100);
        return json(res, 200, { transactions: ledger.listTransactions({ limit }) });
      }
      if (req.method === 'GET' && url.pathname === '/api/ledger/summary') {
        const q = url.searchParams.get('q') || '本月';
        const filters = inferSummaryFilters(q);
        return json(res, 200, { filters, summary: ledger.summarize(filters) });
      }
      if (req.method === 'GET' && url.pathname === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return json(res, 400, { error: '请输入查询内容' });
        return json(res, 200, await searchPapra(q));
      }
      const fileMatch = req.method === 'GET' && url.pathname.match(/^\/api\/documents\/([^/]+)\/file$/);
      if (fileMatch) return proxyDocumentFile(decodeURIComponent(fileMatch[1]), res);
      if (req.method === 'GET' && (await serveStatic(url.pathname, res))) return;
      return json(res, 404, { error: 'Not found' });
    } catch (error) {
      console.error(error);
      return json(res, 500, { error: error instanceof Error ? error.message : 'Unexpected error' });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createServer();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Papra Ledger Assistant listening on http://0.0.0.0:${PORT}`);
    console.log(`Ledger DB: ${LEDGER_DB_PATH}`);
    console.log(DEMO_MODE ? 'Papra demo mode enabled' : `Papra: ${PAPRA_URL || '(not configured)'}`);
  });
}
