import assert from 'node:assert/strict';
import {
  analyzeSepa,
  calculateATR,
  calculateEntryPrice,
  calculatePositionSize,
  calculatePyramidPlan,
} from '../lib/finance/calculations.ts';

function makeUptrendBars(length = 260) {
  return Array.from({ length }, (_, index) => {
    const close = 50 + index * 0.5;
    return {
      date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000,
    };
  });
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

run('calculates 20 day ATR from true ranges', () => {
  const data = makeUptrendBars(30);
  assert.equal(calculateATR(data), 2);
});

run('calculates 20 day breakout entry price', () => {
  const data = makeUptrendBars(30);
  assert.equal(calculateEntryPrice(data), 65.5);
});

run('calculates 1 percent risk position size', () => {
  const result = calculatePositionSize(50_000, 100, 2);
  assert.equal(result.maxRisk, 500);
  assert.equal(result.stopLossPrice, 96);
  assert.equal(result.riskPerShare, 4);
  assert.equal(result.shares, 125);
});

run('builds three leg pyramid plan', () => {
  const plan = calculatePyramidPlan(50_000, 100, 2);
  assert.equal(plan.totalShares, 125);
  assert.deepEqual(
    [plan.entryTargets.e1.price, plan.entryTargets.e2.price, plan.entryTargets.e3.price],
    [100, 101, 102]
  );
  assert.equal(plan.trailingStops.initial, 96);
});

run('marks unavailable fundamental and RS fields as unknown', () => {
  const evidence = analyzeSepa(makeUptrendBars());
  assert.ok(evidence.summary.unknown >= 2);
  assert.equal(evidence.criteria.find((item) => item.id === 'rs_rating')?.status, 'unknown');
  assert.equal(evidence.criteria.find((item) => item.id === 'fundamentals')?.status, 'unknown');
});
