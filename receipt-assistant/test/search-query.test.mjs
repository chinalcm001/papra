import test from 'node:test';
import assert from 'node:assert/strict';
import { expandReceiptSearchQuery } from '../search-query.mjs';

const NOW = new Date('2026-09-09T12:00:00Z');

test('expands a Chinese product term while preserving brand and retailer', () => {
  const result = expandReceiptSearchQuery('帮我找去年在 MediaMarkt 买的 Rowenta 吸尘器小票', { now: NOW });
  assert.match(result.searchQuery, /MediaMarkt/);
  assert.match(result.searchQuery, /Rowenta/);
  assert.match(result.searchQuery, /aspirador/);
  assert.match(result.searchQuery, /2025/);
  assert.equal(result.usedTranslation, true);
});

test('translates Chinese retailer aliases', () => {
  const result = expandReceiptSearchQuery('宜家买的沙发', { now: NOW });
  assert.match(result.searchQuery, /IKEA/);
  assert.match(result.searchQuery, /sofá/);
});

test('keeps explicit year and model tokens', () => {
  const result = expandReceiptSearchQuery('2024 Dyson V12 吸尘器', { now: NOW });
  assert.match(result.searchQuery, /2024/);
  assert.match(result.searchQuery, /Dyson/);
  assert.match(result.searchQuery, /V12/);
  assert.match(result.searchQuery, /aspiradora/);
});

test('falls back to cleaned original text when no mapping exists', () => {
  const result = expandReceiptSearchQuery('帮我找一下 Mercadona', { now: NOW });
  assert.equal(result.searchQuery, 'Mercadona');
});

test('handles empty input', () => {
  const result = expandReceiptSearchQuery('   ', { now: NOW });
  assert.equal(result.searchQuery, '');
});
