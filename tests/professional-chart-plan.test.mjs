import assert from 'node:assert/strict';
import { buildProfessionalChartPlan } from '../lib/finance/engines/professional-chart-plan.ts';
import { calculateMinerviniRiskPlan } from '../lib/finance/core/position-sizing.ts';

function day(index) {
  const date = new Date('2025-01-02T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

const priceData = Array.from({ length: 260 }, (_, index) => {
  const close = index === 259 ? 139 : 100 + index * 0.14;
  return { date: day(index), open: close - 0.5, high: close + 1, low: close - 1, close, volume: index === 259 ? 2_000_000 : 1_000_000 };
});
const base = {
  priceData,
  chartPatterns: [{ type: 'VCP', status: 'CONFIRMED' }],
  vcpAnalysis: {
    pivotPrice: 138,
    invalidationPrice: 132,
    breakoutVolumeStatus: 'confirmed',
    entrySource: 'VCP_PIVOT',
    referenceHighPrice: 140,
    highTightFlag: null,
  },
  riskPlan: { entryPrice: 138, stopLossPrice: 132, selectedStopPrice: 132, targetPrice: 156, rewardRiskRatio: 3, atr: 3, riskGate: { status: 'PASS' } },
  warnings: [],
};

const actionable = buildProfessionalChartPlan(base);
assert.equal(actionable.verdict, 'BUY');
assert.equal(actionable.setupGrade, 'A');
assert.equal(actionable.readiness, 'ACTIONABLE');
assert.match(actionable.executionRule, /138/);
assert.equal(actionable.dailyTrend, 'UPTREND');
assert.equal(actionable.weeklyTrend, 'UPTREND');
assert.equal(actionable.timeframeAlignment, 'BULLISH_ALIGNED');
assert.equal(actionable.confluenceScore, 100);
assert.equal(actionable.keyResistance, 140);
assert.ok(actionable.keySupport > 0);
assert.equal(actionable.scenarios.length, 3);
assert.match(actionable.scenarios[0].label, /거래량 돌파/);
assert.match(actionable.scenarios[2].condition, /가설을 폐기/);

const blocked = buildProfessionalChartPlan({ ...base, riskPlan: { ...base.riskPlan, riskGate: { status: 'BLOCK' } } });
assert.equal(blocked.verdict, 'AVOID');
assert.equal(blocked.readiness, 'INVALID');

const zeroEquity = buildProfessionalChartPlan({
  ...base,
  riskPlan: calculateMinerviniRiskPlan(0, 138, 3, 0.01, 132, priceData),
});
assert.notEqual(zeroEquity.readiness, 'INVALID');
assert.equal(zeroEquity.stopPrice, 132);

const recentHighFallback = buildProfessionalChartPlan({
  ...base,
  vcpAnalysis: {
    ...base.vcpAnalysis,
    pivotPrice: null,
    recommendedEntry: 200,
    entrySource: 'RECENT_HIGH_FALLBACK',
    referenceHighPrice: 200,
    breakoutVolumeStatus: 'pending',
  },
  riskPlan: {
    ...base.riskPlan,
    entryPrice: 200,
    selectedStopPrice: 184,
    stopLossPrice: 184,
  },
});
assert.equal(recentHighFallback.entryMode, 'WAIT_FOR_BASE');
assert.equal(recentHighFallback.entryPrice, null);
assert.equal(recentHighFallback.triggerPrice, null);
assert.equal(recentHighFallback.referenceResistance, 200);
assert.equal(recentHighFallback.readiness, 'EARLY');
assert.equal(recentHighFallback.confluenceScore, 75);
assert.equal(recentHighFallback.keyResistance, 200);
assert.match(recentHighFallback.executionRule, /핵심 저항 200은 매수가가 아닙니다/);
console.log('professional chart plan tests passed');
