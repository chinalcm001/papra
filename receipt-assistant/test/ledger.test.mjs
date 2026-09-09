import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAssistantIntent, inferDateRange, parseAmountToCents, parseTransactionText } from '../ledger.mjs';

const now = new Date(2026, 8, 9, 12, 0, 0);

test('parses euro amount with decimal comma', () => assert.equal(parseAmountToCents('Lidl 买菜 46,80欧'), 4680));
test('parses expense and merchant/category', () => {
  const tx = parseTransactionText('昨天在 Mercadona 买菜 35.60欧', { now });
  assert.equal(tx.amountCents, 3560);
  assert.equal(tx.merchant, 'Mercadona');
  assert.equal(tx.category, '食品杂货');
  assert.equal(tx.transactionDate, '2026-09-08');
});
test('parses income', () => assert.equal(parseTransactionText('今天工资收入 2800欧', { now }).kind, 'income'));
test('infers current month', () => assert.deepEqual(inferDateRange('这个月花了多少', now), { from: '2026-09-01', toExclusive: '2026-10-01', label: '本月' }));
test('classifies receipt search', () => assert.equal(classifyAssistantIntent('找一下去年买的吸尘器小票'), 'receipt_search'));
test('classifies ledger add', () => assert.equal(classifyAssistantIntent('记账 Lidl 买菜 23.4欧'), 'add_transaction'));
test('classifies summary', () => assert.equal(classifyAssistantIntent('这个月超市花了多少'), 'ledger_summary'));
