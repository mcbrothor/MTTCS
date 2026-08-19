import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTurnoverIntensity } from '../lib/finance/engines/turnover-intensity.ts';

function bars(count, lastVolume = 1000) {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100 + index,
    volume: index === count - 1 ? lastVolume : 1000,
  }));
}

test('turnover signal blocks with less than 60 days', () => {
  assert.equal(calculateTurnoverIntensity({ ticker: 'AAA', bars: bars(59), provider: 'TEST' }).quality, 'BLOCKED');
});

test('turnover signal exposes raw and three signal lines', () => {
  const result = calculateTurnoverIntensity({ ticker: 'AAA', bars: bars(70, 5000), provider: 'TEST' });
  assert.ok(result.raw > 60);
  assert.equal(typeof result.sma3, 'number');
  assert.equal(typeof result.ema5, 'number');
  assert.equal(typeof result.ema7, 'number');
  assert.equal(result.quality, 'DEGRADED');
});
