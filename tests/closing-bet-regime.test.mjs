import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { calculateClosingRegimeBenchmark } = jiti('../lib/closing-bet/regime.ts');
const bar = (time, volume, turnover, prices = {}) => ({
  date: '2026-09-23', time, open: 100, high: 101, low: 99, close: 100, volume, turnover, ...prices,
});

test('estimates a single low-share opening turnover gap instead of blocking the market regime', () => {
  const result = calculateClosingRegimeBenchmark([
    bar('09:00:00', 100, null),
    bar('14:30:00', 5_000, 500_000, { open: 100 }),
    bar('15:17:00', 5_000, 510_000, { close: 102, high: 102 }),
  ], '14:30:00');
  assert.ok(result);
  assert.equal(result.estimatedTurnoverBars, 1);
  assert.ok(Math.abs(result.lateReturnPct - 2) < Number.EPSILON * 10);
  assert.ok(result.vwap > 100 && result.vwap < 102);
});

test('keeps the regime unknown when turnover gaps are material or the late reference is absent', () => {
  assert.equal(calculateClosingRegimeBenchmark([
    bar('09:00:00', 500, null),
    bar('14:30:00', 5_000, 500_000),
    bar('15:17:00', 5_000, 510_000),
  ], '14:30:00'), null);
  assert.equal(calculateClosingRegimeBenchmark([
    bar('09:00:00', 10, null),
    bar('15:17:00', 5_000, 510_000),
  ], '14:30:00'), null);
});

console.log('closing-bet-regime: guarded benchmark fallback checks passed');
