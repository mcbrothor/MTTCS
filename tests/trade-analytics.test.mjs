import assert from 'node:assert/strict';
import {
  calculateTradeExpectancy,
  calculateMaeMfe,
  computeRMultipleDistribution,
} from '../lib/finance/core/trade-analytics.ts';

// Test 1: Expectancy 계산 검증 (승률 50%, 평균 수익 2.5R, 평균 손실 1.0R -> 기대값 0.75R)
{
  const mockTrades = [
    { ticker: 'AAPL', entryPrice: 100, exitPrice: 120, initialStopPrice: 92, pnl: 2000 }, // +2.5R
    { ticker: 'NVDA', entryPrice: 100, exitPrice: 120, initialStopPrice: 92, pnl: 2000 }, // +2.5R
    { ticker: 'TSLA', entryPrice: 100, exitPrice: 92, initialStopPrice: 92, pnl: -800 },   // -1.0R
    { ticker: 'MSFT', entryPrice: 100, exitPrice: 92, initialStopPrice: 92, pnl: -800 },   // -1.0R
  ];

  const result = calculateTradeExpectancy(mockTrades);
  assert.equal(result.totalTrades, 4);
  assert.equal(result.winRate, 0.5);
  assert.equal(result.avgWinR, 2.5);
  assert.equal(result.avgLossR, 1.0);
  assert.equal(result.expectancyR, 0.75);
  assert.equal(result.profitFactor, 2.5);
  assert.equal(result.grade, 'EXCELLENT');
}

// Test 2: MAE / MFE 계산 검증
{
  const trade = {
    ticker: 'AAPL',
    entryPrice: 100,
    exitPrice: 116, // +2R 실현
    initialStopPrice: 92, // 1R = 8
    lowestPriceWhileOpen: 98, // -2달러 하락 (MAE = 0.25R, 2%)
    highestPriceWhileOpen: 124, // +24달러 상승 (MFE = 3.0R, 24%)
    direction: 'LONG',
  };

  const result = calculateMaeMfe(trade);
  assert.equal(result.maePercent, 2);
  assert.equal(result.maeR, 0.25);
  assert.equal(result.mfePercent, 24);
  assert.equal(result.mfeR, 3);
  assert.equal(result.efficiencyRatio, 0.67); // 2R / 3R = 0.67
  assert.equal(result.stopLossAdequacy, 'SAFE');
}

// Test 3: R-Multiple 분포 히스토그램 검증
{
  const trades = [
    { ticker: 'A', entryPrice: 100, exitPrice: 130, initialStopPrice: 90 }, // +3.0R
    { ticker: 'B', entryPrice: 100, exitPrice: 115, initialStopPrice: 90 }, // +1.5R
    { ticker: 'C', entryPrice: 100, exitPrice: 90, initialStopPrice: 90 },  // -1.0R
  ];

  const distribution = computeRMultipleDistribution(trades);
  assert.equal(distribution.length, 6);
  const highGainBucket = distribution.find((b) => b.rangeLabel === '> +3.0R');
  const midGainBucket = distribution.find((b) => b.rangeLabel === '+1.0R ~ +2.0R');
  assert.equal(highGainBucket.count, 1);
  assert.equal(midGainBucket.count, 1);
}

console.log('trade analytics tests passed');
