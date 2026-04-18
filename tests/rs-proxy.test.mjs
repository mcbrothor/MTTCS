import assert from 'node:assert/strict';
import {
  calculateRsLineSignals,
  calculateTennisBallAction,
  calculateWeightedMomentum,
} from '../lib/finance/rs-proxy.ts';

console.log('=== RS Proxy Tests ===\n');

function makeBars(values, start = '2025-01-01') {
  const base = new Date(start);
  return values.map((close, index) => {
    const date = new Date(base);
    date.setDate(date.getDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      open: close,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 1000000,
    };
  });
}

{
  const data = makeBars(Array.from({ length: 260 }, (_, index) => 100 + index));
  const momentum = calculateWeightedMomentum(data);
  assert.ok(momentum.return3m > 0);
  assert.ok(momentum.return12m > 0);
  assert.ok(momentum.weightedMomentumScore > 0);
  console.log('Weighted 3/6/9/12-month momentum is calculated');
}

{
  const stock = makeBars(Array.from({ length: 260 }, (_, index) => 100 + index * 2));
  const benchmark = makeBars(Array.from({ length: 260 }, (_, index) => 100 + index));
  const signal = calculateRsLineSignals(stock, benchmark);
  assert.equal(signal.rsLineNewHigh, true);
  assert.equal(signal.rsLineNearHigh, true);
  console.log('RS line new-high and near-high flags use matched dates');
}

{
  const stock = makeBars([100, 101, 102, 101, 103, 103.5, 104]);
  const benchmark = makeBars([100, 98.5, 99, 97, 98, 96, 97]);
  const action = calculateTennisBallAction(stock, benchmark);
  assert.ok(action.tennisBallCount >= 2);
  assert.equal(action.tennisBallScore, Math.min(100, action.tennisBallCount * 20));
  console.log('Tennis-ball action counts benchmark -1% days with stock defense');
}

console.log('\n=== All RS Proxy Tests Passed ===');
