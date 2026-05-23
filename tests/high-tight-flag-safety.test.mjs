import assert from 'node:assert/strict';
import { analyzeHighTightFlag } from '../lib/finance/engines/vcp/high-tight-flag.ts';

function generateTooFreshBase() {
  const data = [];
  const baseDate = new Date('2026-01-02');
  let price = 40;

  for (let day = 0; day < 58; day++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    price *= 1.03;
    data.push({
      date: date.toISOString().slice(0, 10),
      open: price * 0.99,
      high: price * 1.01,
      low: price * 0.98,
      close: price,
      volume: 2_000_000,
    });
  }

  for (let day = 58; day < 60; day++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + day);
    price *= 1.01;
    data.push({
      date: date.toISOString().slice(0, 10),
      open: price * 0.99,
      high: price * 1.2,
      low: price * 0.98,
      close: price,
      volume: 900_000,
    });
  }

  return data;
}

{
  const data = generateTooFreshBase();
  const result = analyzeHighTightFlag(data, data.at(-1).close);

  assert.ok(result, 'HTF analysis should return a diagnostic object');
  assert.equal(result.passed, false);
  assert.equal(result.baseDays, 1);
  assert.equal(result.stopReliability, 'INSUFFICIENT_BASE');
  assert.equal(result.stopPrice, null);
  assert.deepEqual(result.stopPlan, []);
}

console.log('high tight flag safety tests passed');
