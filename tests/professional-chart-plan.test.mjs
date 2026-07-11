import assert from 'node:assert/strict';
import { buildProfessionalChartPlan } from '../lib/finance/engines/professional-chart-plan.ts';

const priceData = Array.from({ length: 260 }, (_, index) => {
  const close = index === 259 ? 139 : 100 + index * 0.14;
  return { date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`, open: close - 0.5, high: close + 1, low: close - 1, close, volume: index === 259 ? 2_000_000 : 1_000_000 };
});
const base = {
  priceData,
  chartPatterns: [{ type: 'VCP', status: 'CONFIRMED' }],
  vcpAnalysis: { pivotPrice: 138, invalidationPrice: 132, breakoutVolumeStatus: 'confirmed' },
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
console.log('professional chart plan tests passed');
