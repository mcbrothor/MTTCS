import assert from 'node:assert/strict';
import {
  calculateAdrPct,
  calculateChangePercent,
  calculatePriceMetrics,
} from '../lib/finance/core/price-metrics.ts';

function bar(close, overrides = {}) {
  return {
    date: '2026-01-01',
    open: close,
    high: close + 2,
    low: close - 2,
    close,
    volume: 1_000_000,
    ...overrides,
  };
}

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run('calculates daily change percent from the latest two closes', () => {
  assert.equal(calculateChangePercent([bar(100), bar(105)]), 5);
  assert.equal(calculateChangePercent([bar(200), bar(190)]), -5);
});

run('returns null for change percent without a valid previous close', () => {
  assert.equal(calculateChangePercent([bar(100)]), null);
  assert.equal(calculateChangePercent([bar(0), bar(100)]), null);
});

run('calculates ADR percent from average range over average midpoint', () => {
  const bars = Array.from({ length: 5 }, () => bar(100, { high: 110, low: 90 }));
  assert.equal(calculateAdrPct(bars), 20);
});

run('uses only the configured trailing ADR period', () => {
  const oldBars = Array.from({ length: 3 }, () => bar(100, { high: 150, low: 50 }));
  const recentBars = Array.from({ length: 5 }, () => bar(100, { high: 105, low: 95 }));
  assert.equal(calculateAdrPct([...oldBars, ...recentBars], 5), 10);
});

run('returns both backend scanner price metrics together', () => {
  const metrics = calculatePriceMetrics([
    bar(98),
    bar(100, { high: 110, low: 90 }),
    bar(105, { high: 115, low: 95 }),
    bar(110, { high: 120, low: 100 }),
    bar(115, { high: 125, low: 105 }),
    bar(120, { high: 130, low: 110 }),
  ]);

  assert.deepEqual(metrics, { changePercent: 4.35, adrPct: 16.05 });
});
