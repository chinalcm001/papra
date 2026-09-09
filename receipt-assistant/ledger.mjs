import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

const CATEGORY_RULES = [
  ['食品杂货', ['mercadona', 'consum', 'carrefour', 'lidl', 'aldi', '超市', '买菜', '蔬菜', '水果', '牛奶', '食品']],
  ['餐饮', ['餐厅', '吃饭', '午饭', '晚饭', '早餐', '咖啡', '外卖', '餐饮', '麦当劳', 'kfc', 'burger king']],
  ['家居', ['ikea', 'leroy merlin', 'bauhaus', 'jysk', '家具', '家居', '沙发', '锅', '灯具', '装修']],
  ['交通', ['公交', '地铁', '打车', '出租车', '停车', '高速', '过路费', 'uber', 'cabify']],
  ['汽车', ['加油', '汽油', '柴油', 'diesel', 'gasolina', '修车', '汽车', '轮胎', '机油']],
  ['医疗', ['药房', '药店', '医院', '医生', '看病', '医疗', 'farmacia']],
  ['教育', ['学校', '学费', '书本', '文具', '课程', '补习', '孩子']],
  ['宠物', ['宠物', '狗粮', '兽医', 'cookie', 'zooplus']],
  ['水电网', ['电费', '水费', '燃气', '网费', '电话费', 'vodafone', 'movistar', 'iberdrola']],
  ['娱乐', ['电影', '游戏', 'steam', '娱乐', '订阅', 'netflix', 'spotify']],
  ['旅行', ['机票', '酒店', 'booking', '旅行', '旅游', '火车票']],
  ['购物', ['衣服', '鞋', '化妆品', '护肤', 'amazon', '购物']],
];

const MERCHANT_ALIASES = [
  ['Mercadona', ['mercadona']], ['Consum', ['consum']], ['Carrefour', ['carrefour', '家乐福']],
  ['Lidl', ['lidl']], ['Aldi', ['aldi']], ['IKEA', ['ikea', '宜家']], ['MediaMarkt', ['mediamarkt', '媒体市场']],
  ['Leroy Merlin', ['leroy merlin', '乐华梅兰']], ['Amazon', ['amazon', '亚马逊']], ['El Corte Inglés', ['el corte inglés', '英格列斯百货']],
  ['Decathlon', ['decathlon', '迪卡侬']], ['Bauhaus', ['bauhaus']], ['JYSK', ['jysk']],
];

function pad2(n) { return String(n).padStart(2, '0'); }
export function toDateString(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }
function localDate(now = new Date()) { return new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function startOfNextMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 1); }
function startOfYear(date) { return new Date(date.getFullYear(), 0, 1); }
function startOfNextYear(date) { return new Date(date.getFullYear() + 1, 0, 1); }

export function parseAmountToCents(text) {
  const input = String(text ?? '');
  const patterns = [
    /(?:€\s*)?(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:€|欧元|欧|eur)/i,
    /(?:花了|消费|支出|收入|工资|退款|记账|买了|买的)\s*(\d{1,7}(?:[.,]\d{1,2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (!match) continue;
    const value = Number(match[1].replace(',', '.'));
    if (Number.isFinite(value) && value >= 0) return Math.round(value * 100);
  }
  return null;
}

export function inferCategory(text) {
  const lower = String(text ?? '').toLowerCase();
  for (const [category, words] of CATEGORY_RULES) if (words.some((word) => lower.includes(word))) return category;
  return '其他';
}

export function inferMerchant(text) {
  const lower = String(text ?? '').toLowerCase();
  for (const [merchant, aliases] of MERCHANT_ALIASES) if (aliases.some((alias) => lower.includes(alias))) return merchant;
  const match = String(text ?? '').match(/(?:在|去)([A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 .&'’-]{1,30}?)(?:买|消费|花|吃|加油)/i);
  return match?.[1]?.trim() || '';
}

export function inferTransactionDate(text, now = new Date()) {
  const input = String(text ?? '');
  const base = localDate(now);
  if (input.includes('前天')) return toDateString(addDays(base, -2));
  if (input.includes('昨天')) return toDateString(addDays(base, -1));
  if (input.includes('今天')) return toDateString(base);
  let match = input.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (match) return `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`;
  match = input.match(/(?<!\d)(\d{1,2})月(\d{1,2})日/);
  if (match) return `${now.getFullYear()}-${pad2(match[1])}-${pad2(match[2])}`;
  return toDateString(base);
}

export function parseTransactionText(text, { now = new Date(), currency = 'EUR' } = {}) {
  const input = String(text ?? '').trim();
  const amountCents = parseAmountToCents(input);
  const income = /(收入|工资|奖金|收到|入账|退款|返现)/.test(input) && !/(支出|花了|消费)/.test(input);
  const merchant = inferMerchant(input);
  const category = income ? '收入' : inferCategory(input);
  const note = input
    .replace(/(?:€\s*)?\d{1,7}(?:[.,]\d{1,2})?\s*(?:€|欧元|欧|eur)?/ig, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 240);
  return {
    kind: income ? 'income' : 'expense', amountCents, currency, merchant, category,
    note, transactionDate: inferTransactionDate(input, now), rawInput: input,
  };
}

export function inferDateRange(text, now = new Date()) {
  const input = String(text ?? '');
  const base = localDate(now);
  if (input.includes('上个月')) {
    const from = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    return { from: toDateString(from), toExclusive: toDateString(startOfMonth(base)), label: '上个月' };
  }
  if (input.includes('这个月') || input.includes('本月')) {
    return { from: toDateString(startOfMonth(base)), toExclusive: toDateString(startOfNextMonth(base)), label: '本月' };
  }
  if (input.includes('去年')) {
    const from = new Date(base.getFullYear() - 1, 0, 1);
    return { from: toDateString(from), toExclusive: `${base.getFullYear()}-01-01`, label: '去年' };
  }
  if (input.includes('今年') || input.includes('本年')) {
    return { from: toDateString(startOfYear(base)), toExclusive: toDateString(startOfNextYear(base)), label: '今年' };
  }
  const monthMatch = input.match(/(?:(20\d{2})年)?(\d{1,2})月/);
  if (monthMatch) {
    const year = Number(monthMatch[1] || base.getFullYear());
    const month = Number(monthMatch[2]) - 1;
    const from = new Date(year, month, 1);
    return { from: toDateString(from), toExclusive: toDateString(new Date(year, month + 1, 1)), label: `${year}年${month + 1}月` };
  }
  return { from: '0000-01-01', toExclusive: '9999-12-31', label: '全部时间' };
}

export function inferSummaryFilters(text, now = new Date()) {
  const range = inferDateRange(text, now);
  const lower = String(text ?? '').toLowerCase();
  const category = CATEGORY_RULES.find(([, words]) => words.some((word) => lower.includes(word)))?.[0] || null;
  const merchant = inferMerchant(text) || null;
  return { ...range, category, merchant };
}

export function classifyAssistantIntent(text) {
  const input = String(text ?? '').trim();
  const amount = parseAmountToCents(input);
  if (amount !== null && /(记账|花了|消费|支出|买了|买的|收入|工资|退款|付了|付款)/.test(input)) return 'add_transaction';
  if (/(最近|近来).{0,6}(\d+)?\s*笔|明细|账单记录|消费记录|支出记录/.test(input)) return 'list_transactions';
  if (/(多少|合计|总共|总计|汇总|总结|统计|花费|支出).*(月|年|餐饮|超市|买菜|家居|交通|汽车|医疗|教育|宠物|商店|mercadona|lidl|carrefour|ikea)?/i.test(input)) return 'ledger_summary';
  if (/(小票|收据|票据|发票|保修|售后|凭证)/.test(input) || /(找|查|搜索).*(买|商品|mediamarkt|ikea|lidl|carrefour)/i.test(input)) return 'receipt_search';
  if (amount !== null) return 'add_transaction';
  return 'help';
}

export function createLedger({ dbPath = './data/ledger.sqlite', defaultCurrency = 'EUR' } = {}) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK(kind IN ('expense','income')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'EUR',
      merchant TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '其他',
      note TEXT NOT NULL DEFAULT '',
      transaction_date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'text',
      raw_input TEXT NOT NULL DEFAULT '',
      receipt_document_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(merchant);
  `);

  const insert = db.prepare(`INSERT INTO transactions
    (kind, amount_cents, currency, merchant, category, note, transaction_date, source, raw_input, receipt_document_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  function addTransaction(tx) {
    if (!Number.isInteger(tx.amountCents) || tx.amountCents < 0) throw new Error('金额无效');
    const result = insert.run(tx.kind || 'expense', tx.amountCents, tx.currency || defaultCurrency, tx.merchant || '', tx.category || '其他', tx.note || '', tx.transactionDate || toDateString(new Date()), tx.source || 'text', tx.rawInput || '', tx.receiptDocumentId || null);
    return getTransaction(Number(result.lastInsertRowid));
  }
  function getTransaction(id) {
    return mapRow(db.prepare('SELECT * FROM transactions WHERE id = ?').get(id));
  }
  function listTransactions({ limit = 20, from = '0000-01-01', toExclusive = '9999-12-31' } = {}) {
    const rows = db.prepare(`SELECT * FROM transactions WHERE transaction_date >= ? AND transaction_date < ? ORDER BY transaction_date DESC, id DESC LIMIT ?`).all(from, toExclusive, Math.min(Math.max(Number(limit) || 20, 1), 100));
    return rows.map(mapRow);
  }
  function summarize(filters = {}) {
    const { from = '0000-01-01', toExclusive = '9999-12-31', category = null, merchant = null } = filters;
    const where = ['transaction_date >= ?', 'transaction_date < ?'];
    const params = [from, toExclusive];
    if (category) { where.push('category = ?'); params.push(category); }
    if (merchant) { where.push('merchant = ?'); params.push(merchant); }
    const clause = where.join(' AND ');
    const totals = db.prepare(`SELECT kind, COALESCE(SUM(amount_cents),0) total, COUNT(*) count FROM transactions WHERE ${clause} GROUP BY kind`).all(...params);
    const categories = db.prepare(`SELECT category, COALESCE(SUM(amount_cents),0) total, COUNT(*) count FROM transactions WHERE kind='expense' AND ${clause} GROUP BY category ORDER BY total DESC LIMIT 10`).all(...params);
    const merchants = db.prepare(`SELECT merchant, COALESCE(SUM(amount_cents),0) total, COUNT(*) count FROM transactions WHERE kind='expense' AND merchant <> '' AND ${clause} GROUP BY merchant ORDER BY total DESC LIMIT 10`).all(...params);
    const expense = totals.find((x) => x.kind === 'expense');
    const income = totals.find((x) => x.kind === 'income');
    return {
      expenseCents: Number(expense?.total || 0), incomeCents: Number(income?.total || 0),
      expenseCount: Number(expense?.count || 0), incomeCount: Number(income?.count || 0),
      balanceCents: Number(income?.total || 0) - Number(expense?.total || 0),
      categories: categories.map((x) => ({ category: x.category, amountCents: Number(x.total), count: Number(x.count) })),
      merchants: merchants.map((x) => ({ merchant: x.merchant, amountCents: Number(x.total), count: Number(x.count) })),
    };
  }
  return { addTransaction, getTransaction, listTransactions, summarize, close: () => db.close() };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id), kind: row.kind, amountCents: Number(row.amount_cents), currency: row.currency,
    merchant: row.merchant, category: row.category, note: row.note, transactionDate: row.transaction_date,
    source: row.source, rawInput: row.raw_input, receiptDocumentId: row.receipt_document_id, createdAt: row.created_at,
  };
}
