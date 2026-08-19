import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMarketSentiment } from '../lib/market-sentiment/model.ts';

function rows(count = 260) {
  return Array.from({ length: count }, (_, index) => ({
    date: `2025-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`,
    indexClose: 2000 + index,
    putCall: 1.2 - index / 1000,
    vkospi: 25 - index / 100,
    bond10: 110 + index / 100,
    bond5: 109 + index / 200,
  }));
}

test('sentiment uses complete inputs and produces MACD metadata', () => {
  const result = calculateMarketSentiment({ rows: rows(), provider: 'GOLDEN' });
  assert.equal(result.quality, 'FULL');
  assert.equal(typeof result.score, 'number');
  assert.equal(typeof result.macd.histogram, 'number');
  assert.deepEqual(result.missingInputs, []);
});

test('sentiment excludes missing options and bond inputs without neutral imputation', () => {
  const data = rows();
  for (const row of data) {
    row.putCall = null;
    row.vkospi = null;
    row.bond10 = null;
    row.bond5 = null;
  }
  const result = calculateMarketSentiment({ rows: data, provider: 'PARTIAL' });
  assert.equal(result.quality, 'DEGRADED');
  assert.equal(typeof result.score, 'number');
  assert.ok(result.missingInputs.includes('Put/Call'));
  assert.ok(result.missingInputs.includes('VKOSPI'));
  assert.ok(result.missingInputs.includes('10년-5년 국채선물'));
  assert.equal(result.components.putCall, null);
  assert.match(result.warnings.join(' '), /중립값으로 대체하지 않고/);
});

test('sentiment still blocks when index history is insufficient', () => {
  const result = calculateMarketSentiment({ rows: rows(80), provider: 'SHORT' });
  assert.equal(result.quality, 'BLOCKED');
  assert.equal(result.label, 'BLOCKED');
});
