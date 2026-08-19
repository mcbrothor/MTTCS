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

test('sentiment blocks when options or bond inputs are missing', () => {
  const data = rows();
  data.at(-1).putCall = null;
  data.at(-1).bond10 = null;
  const result = calculateMarketSentiment({ rows: data, provider: 'PARTIAL' });
  assert.equal(result.quality, 'BLOCKED');
  assert.equal(result.label, 'BLOCKED');
  assert.ok(result.missingInputs.includes('Put/Call'));
  assert.ok(result.missingInputs.includes('10년-5년 국채선물'));
});
