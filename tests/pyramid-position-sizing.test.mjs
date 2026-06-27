import assert from 'node:assert/strict';
import { calculateMinerviniRiskPlan, calculateOnlPyramidPlan } from '../lib/finance/core/position-sizing.ts';

const plan = calculateOnlPyramidPlan(9_000_000, 100, 0.01);

assert.ok(plan);
assert.equal(plan.policy.maxRiskAmount, 90_000);
assert.equal(plan.policy.completedPositionAmount, 1_800_000);
assert.equal(plan.legs[0].plannedAmount, 900_000);
assert.equal(plan.legs[1].plannedAmount, 540_000);
assert.equal(plan.legs[2].plannedAmount, 360_000);
assert.equal(plan.legs[0].price, 100);
assert.equal(plan.legs[1].price, 102.5);
assert.equal(plan.legs[2].price, 105.06);
assert.equal(plan.legs[0].openRisk, 45_000);
assert.ok(plan.legs[1].openRisk <= 90_000);
assert.equal(Math.round(plan.minimumStopAfterEntry3 * 100) / 100, 96.64);
assert.equal(plan.recommendedStopAfterEntry3, 100);
assert.equal(plan.policy.maxConcurrentPositions, 4);
assert.equal(plan.policy.maxCompletedExposurePct, 0.8);

const riskPlan = calculateMinerviniRiskPlan(9_000_000, 100, 2, 0.01, null, [], {
  requestedRiskStrategy: 'ONL_PYRAMID',
  market: 'KR',
});

assert.equal(riskPlan.strategy, 'ONL_PYRAMID');
assert.equal(riskPlan.maxLossPct, 0.05);
assert.equal(riskPlan.entryTargets.e1.amount, 900_000);
assert.equal(riskPlan.entryTargets.e2.amount, 540_000);
assert.equal(riskPlan.entryTargets.e3.amount, 360_000);
assert.equal(riskPlan.trailingStops.afterEntry3, 100);
assert.equal(riskPlan.totalShares, plan.completedShares);
assert.ok(riskPlan.riskPolicy?.pyramidPlan);

console.log('pyramid position sizing tests passed');
