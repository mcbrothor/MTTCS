import assert from 'node:assert/strict';
import { buildProfessionalChartPlan } from '../lib/finance/engines/professional-chart-plan.ts';
import { calculateMinerviniRiskPlan } from '../lib/finance/core/position-sizing.ts';

const priceData = Array.from({ length: 260 }, (_, index) => {
  const close = index === 259 ? 139 : 100 + index * 0.14;
  return { date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`, open: close - 0.5, high: close + 1, low: close - 1, close, volume: index === 259 ? 2_000_000 : 1_000_000 };
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
  riskPlan: { entryPrice: 138, stopLossPrice: 132, selectedStopPrice: 132, targetPrice: 156, rewardRiskRatio: 3, riskGate: { status: 'PASS' } },
  warnings: [],
};

const actionable = buildProfessionalChartPlan(base);
assert.equal(actionable.verdict, 'BUY');
assert.equal(actionable.setupGrade, 'A');
assert.equal(actionable.readiness, 'ACTIONABLE');
assert.match(actionable.executionRule, /138/);

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
assert.match(recentHighFallback.executionRule, /저항선일 뿐 매수가가 아닙니다/);
console.log('professional chart plan tests passed');
