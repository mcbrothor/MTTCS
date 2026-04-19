import assert from 'node:assert/strict';
import {
  calculateRSRating,
  calculateRsLineSignals,
  calculateTennisBallAction,
  calculateWeightedMomentum,
  evaluateMacroTrend,
  getIBDProxyScore,
  getMansfieldRS,
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
  const score = getIBDProxyScore({
    currentPrice: 160,
    price3mAgo: 120,
    price6mAgo: 100,
    price9mAgo: 90,
    price12mAgo: 80,
  });
  assert.equal(score.dataQuality, 'FULL');
  assert.equal(score.q1Return, 0.333333);
  assert.ok(score.ibdProxyScore > 0);
  console.log('IBD Proxy uses independent quarterly returns with Q1 double weight');
}

{
  const partial = getIBDProxyScore({ currentPrice: 130, price3mAgo: 100 });
  assert.equal(partial.dataQuality, 'PARTIAL');
  assert.equal(partial.availableWeight, 2);
  assert.ok(partial.ibdProxyScore > 0);

  const na = getIBDProxyScore({ currentPrice: 130 });
  assert.equal(na.dataQuality, 'NA');
  assert.equal(na.ibdProxyScore, null);
  console.log('IBD Proxy handles partial and missing price history without throwing');
}

{
  const data = makeBars(Array.from({ length: 260 }, (_, index) => 100 + index));
  const momentum = calculateWeightedMomentum(data);
  assert.ok(momentum.return3m > 0);
  assert.ok(momentum.return12m > 0);
  assert.ok(momentum.ibdProxyScore > 0);
  assert.equal(momentum.weightedMomentumScore, momentum.ibdProxyScore);
  console.log('Legacy weightedMomentumScore now aliases IBD Proxy score');
}

{
  assert.equal(calculateRSRating(1, 500), 99);
  assert.equal(calculateRSRating(500, 500), 1);
  assert.equal(calculateRSRating(1, 1), 50);
  console.log('Standard-universe rank converts to 1-99 RS Rating');
}

{
  const mansfield = getMansfieldRS(
    { currentPrice: 150, price12mAgo: 100 },
    { currentPrice: 120, price12mAgo: 100 }
  );
  assert.equal(mansfield.mansfieldRsFlag, true);
  assert.ok(mansfield.mansfieldRsScore > 0);
  console.log('Mansfield RS flags 52-week benchmark outperformance');
}

{
  assert.equal(evaluateMacroTrend(110, 100, 90).actionLevel, 'FULL');
  assert.equal(evaluateMacroTrend(95, 100, 90).actionLevel, 'REDUCED');
  assert.equal(evaluateMacroTrend(85, 100, 90).actionLevel, 'HALT');
  console.log('Macro trend filter maps 50/200MA states to FULL/REDUCED/HALT');
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
