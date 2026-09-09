import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandReceiptSearchQuery } from './search-query.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const PAPRA_URL = (process.env.PAPRA_URL || '').replace(/\/$/, '');
const PAPRA_API_TOKEN = process.env.PAPRA_API_TOKEN || '';
const PAPRA_ORGANIZATION_ID = process.env.PAPRA_ORGANIZATION_ID || '';
const PAGE_SIZE = Math.min(Math.max(Number(process.env.PAPRA_PAGE_SIZE || 20), 1), 100);
const DEMO_MODE = /^true$/i.test(process.env.PAPRA_DEMO || '');

const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

const DEMO_DOCUMENTS = [
  {
    id: 'demo-rowenta',
    organizationId: 'demo-org',
    name: 'MediaMarkt_2025-11-12_ticket.jpg',
    mimeType: 'image/jpeg',
    createdAt: '2025-11-12T18:14:00.000Z',
    documentDate: '2025-11-12T00:00:00.000Z',
    content: 'MEDIAMARKT ROWENTA X-FORCE ASPIRADOR SIN CABLE TOTAL 399,00 EUR TICKET 12/11/2025',
    notes: '演示数据：Rowenta 吸尘器小票',
    tags: [{ id: 'tag-warranty', name: '保修', color: '#6b7280' }],
  },
  {
    id: 'demo-ikea',
    organizationId: 'demo-org',
    name: 'IKEA_sofa_receipt.pdf',
    mimeType: 'application/pdf',
    createdAt: '2026-03-03T12:00:00.000Z',
    documentDate: '2026-03-03T00:00:00.000Z',
    content: 'IKEA VALENCIA SOFÁ TOTAL 799,00 EUR FACTURA',
    notes: '演示数据：IKEA 沙发小票',
    tags: [],
  },
];

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function text(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, { 'content-type': contentType });
  res.end(body);
}

function getPapraConfigError() {
  if (DEMO_MODE) return null;
  if (!PAPRA_URL) return '缺少 PAPRA_URL';
  if (!PAPRA_API_TOKEN) return '缺少 PAPRA_API_TOKEN';
  if (!PAPRA_ORGANIZATION_ID) return '缺少 PAPRA_ORGANIZATION_ID';
  return null;
}

function normalizeDocument(doc) {
  return {
    id: doc.id,
    organizationId: doc.organizationId,
    name: doc.name,
    mimeType: doc.mimeType,
    createdAt: doc.createdAt,
    documentDate: doc.documentDate,
    notes: doc.notes || '',
    tags: Array.isArray(doc.tags) ? doc.tags.map((tag) => ({ id: tag.id, name: tag.name })) : [],
    contentSnippet: String(doc.content || '').replace(/\s+/g, ' ').trim().slice(0, 260),
  };
}

async function searchPapra(query) {
  const expanded = expandReceiptSearchQuery(query);

  if (DEMO_MODE) {
    const haystackTerms = expanded.displayTerms.map((term) => term.toLowerCase());
    const documents = DEMO_DOCUMENTS.filter((doc) => {
      if (haystackTerms.length === 0) return true;
      const haystack = `${doc.name} ${doc.content} ${doc.notes}`.toLowerCase();
      return haystackTerms.some((term) => haystack.includes(term));
    });

    return {
      expanded,
      documents: documents.map(normalizeDocument),
      documentsCount: documents.length,
      demo: true,
      papraBaseUrl: '',
      organizationId: 'demo-org',
    };
  }

  const configError = getPapraConfigError();
  if (configError) throw new Error(configError);

  const url = new URL(`/api/organizations/${encodeURIComponent(PAPRA_ORGANIZATION_ID)}/documents`, PAPRA_URL);
  url.searchParams.set('searchQuery', expanded.searchQuery);
  url.searchParams.set('pageIndex', '0');
  url.searchParams.set('pageSize', String(PAGE_SIZE));
  url.searchParams.set('sortField', 'createdAt');
  url.searchParams.set('sortOrder', 'desc');

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${PAPRA_API_TOKEN}`,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Papra API 返回 ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  return {
    expanded,
    documents: (payload.documents || []).map(normalizeDocument),
    documentsCount: Number(payload.documentsCount || 0),
    demo: false,
    papraBaseUrl: PAPRA_URL,
    organizationId: PAPRA_ORGANIZATION_ID,
  };
}

async function proxyDocumentFile(documentId, res) {
  if (DEMO_MODE) {
    return text(res, 200, '演示模式没有真实小票文件。配置 Papra 后这里会打开原始图片或 PDF。');
  }

  const configError = getPapraConfigError();
  if (configError) return json(res, 503, { error: configError });

  const url = new URL(
    `/api/organizations/${encodeURIComponent(PAPRA_ORGANIZATION_ID)}/documents/${encodeURIComponent(documentId)}/file`,
    PAPRA_URL,
  );

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${PAPRA_API_TOKEN}` },
  });

  if (!response.ok) {
    const body = await response.text();
    return json(res, response.status, { error: body || '无法读取原始文件' });
  }

  const headers = {
    'content-type': response.headers.get('content-type') || 'application/octet-stream',
    'cache-control': 'private, max-age=60',
  };
  const contentDisposition = response.headers.get('content-disposition');
  if (contentDisposition) headers['content-disposition'] = contentDisposition;

  res.writeHead(200, headers);
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

async function serveStatic(pathname, res) {
  const entry = STATIC_FILES.get(pathname);
  if (!entry) return false;
  const [fileName, contentType] = entry;
  const body = await readFile(join(__dirname, 'public', fileName));
  res.writeHead(200, {
    'content-type': contentType,
    'cache-control': 'no-cache',
  });
  res.end(body);
  return true;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/api/health') {
        return json(res, 200, {
          ok: !getPapraConfigError(),
          demo: DEMO_MODE,
          configured: !getPapraConfigError(),
          message: getPapraConfigError() || 'ok',
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return json(res, 400, { error: '请输入要查找的商品、小票或商店' });
        const result = await searchPapra(q);
        return json(res, 200, result);
      }

      const fileMatch = req.method === 'GET' && url.pathname.match(/^\/api\/documents\/([^/]+)\/file$/);
      if (fileMatch) {
        return proxyDocumentFile(decodeURIComponent(fileMatch[1]), res);
      }

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
    console.log(`Papra Receipt Assistant listening on http://0.0.0.0:${PORT}`);
    console.log(DEMO_MODE ? 'Demo mode enabled' : `Papra: ${PAPRA_URL || '(not configured)'}`);
  });
}
