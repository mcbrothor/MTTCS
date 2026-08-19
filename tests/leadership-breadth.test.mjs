import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateLeadershipBreadth, classifyBreadthPeakout, classifyLeadershipBreadth } from '../lib/master-filter/leadership-breadth.ts';

test('breadth state boundaries and peak-out overrides are stable', () => {
  assert.equal(classifyLeadershipBreadth(70, 0, 0, 'NONE'), 'STRONG');
  assert.equal(classifyLeadershipBreadth(70, -1, 0, 'NONE'), 'HIGH_ALERT');
  assert.equal(classifyLeadershipBreadth(60, -1, -1, 'NONE'), 'NORMAL');
  assert.equal(classifyLeadershipBreadth(50, -1, 0, 'NONE'), 'CAUTION');
  assert.equal(classifyLeadershipBreadth(35, 1, -1, 'NONE'), 'RISK');
  assert.equal(classifyLeadershipBreadth(20, -1, -1, 'NONE'), 'SELLOFF');
  assert.equal(classifyLeadershipBreadth(90, 5, 5, 'STRONG_WARNING'), 'RISK');
});

test('breadth peak-out uses exact -10 and -20 divergence boundaries', () => {
  assert.equal(classifyBreadthPeakout({ indexNearHigh20: true, drawdownFromBreadthHigh20: -10, slope5: -0.1, slope10: 1 }), 'WARNING');
  assert.equal(classifyBreadthPeakout({ indexNearHigh20: true, drawdownFromBreadthHigh20: -20, slope5: -0.1, slope10: -0.1 }), 'STRONG_WARNING');
  assert.equal(classifyBreadthPeakout({ indexNearHigh20: false, drawdownFromBreadthHigh20: -30, slope5: -1, slope10: -1 }), 'NONE');
});

test('breadth combines 20/35/25/20 percent weights', () => {
  const bars = Array.from({ length: 220 }, (_, index) => ({
    date: `2025-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100 + index,
    volume: 1000,
  }));
  const result = calculateLeadershipBreadth({
    market: 'US',
    universe: 'TEST',
    constituents: [{ ticker: 'AAA', bars }, { ticker: 'BBB', bars }],
    indexBars: bars,
    provider: 'GOLDEN',
  });
  assert.equal(result.score, 100);
  assert.equal(result.components.aboveMa20Pct, 100);
  assert.equal(result.quality, 'FULL');
});
