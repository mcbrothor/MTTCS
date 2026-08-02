import assert from 'node:assert/strict';
import { evaluateRiskGate } from '../lib/finance/core/risk-gate.ts';
import { buildAuthoritativeRiskPolicy, buildRiskPolicyForStrategy } from '../lib/finance/core/risk-policy.ts';

const policy = buildRiskPolicyForStrategy('US', 'MINERVINI_VCP', 0.01);

{
  const gate = evaluateRiskGate({
    policy,
    totalEquity: 100_000,
    candidateRisk: 1_000,
    currentOpenRisk: 2_000,
    stopQuality: 'VALID',
  });

  assert.equal(gate.status, 'PASS');
  assert.equal(gate.riskBudgetRemaining, 4_000);
  assert.equal(gate.allowedRiskAmount, 2_000);
}

{
  const gate = evaluateRiskGate({
    policy,
    totalEquity: 100_000,
    candidateRisk: 2_000,
    currentOpenRisk: 5_500,
    stopQuality: 'VALID',
  });

  assert.equal(gate.status, 'REDUCE');
  assert.equal(gate.riskBudgetRemaining, 500);
  assert.ok(gate.reasons.some((item) => item.code === 'INSUFFICIENT_RISK_BUDGET'));
}

{
  const gate = evaluateRiskGate({
    policy,
    totalEquity: 100_000,
    candidateRisk: 100,
    currentOpenRisk: 6_000,
    stopQuality: 'VALID',
  });

  assert.equal(gate.status, 'BLOCK');
  assert.ok(gate.reasons.some((item) => item.code === 'PORTFOLIO_HEAT'));
}

{
  const gate = evaluateRiskGate({
    policy,
    totalEquity: 100_000,
    candidateRisk: 1_000,
    stopQuality: 'INVALID',
  });

  assert.equal(gate.status, 'BLOCK');
  assert.ok(gate.reasons.some((item) => item.code === 'STOP_QUALITY'));
}

{
  const gate = evaluateRiskGate({
    policy,
    totalEquity: 100_000,
    candidateRisk: 2_500,
    currentOpenRisk: 0,
    stopQuality: 'VALID',
  });

  assert.equal(gate.status, 'REDUCE');
  assert.equal(gate.allowedRiskAmount, 2_000);
  assert.ok(gate.reasons.some((item) => item.message.includes('single-trade')));
}

{
  const conservative = buildAuthoritativeRiskPolicy('US', 'CONSERVATIVE', 0.01);
  const highTight = buildAuthoritativeRiskPolicy('US', 'HIGH_TIGHT_FLAG', 0.01);

  assert.equal(conservative.maxSingleTradeRiskPct, 0.01);
  assert.equal(conservative.maxPortfolioHeatPct, 0.03);
  assert.equal(highTight.maxSingleTradeRiskPct, 0.02);
  assert.equal(highTight.maxPortfolioHeatPct, 0.06);
}

{
  const alreadyReduced = evaluateRiskGate({
    policy,
    totalEquity: 100_000,
    candidateRisk: 1_000,
    currentOpenRisk: 0,
    stopQuality: 'VALID',
    marketActionLevel: 'REDUCED',
  });
  assert.equal(alreadyReduced.status, 'PASS');
  assert.equal(alreadyReduced.allowedRiskAmount, 1_000);
  assert.equal(alreadyReduced.effectiveRiskPct, 0.005);

  const stillTooLarge = evaluateRiskGate({
    policy,
    totalEquity: 100_000,
    candidateRisk: 1_500,
    currentOpenRisk: 0,
    stopQuality: 'VALID',
    marketActionLevel: 'REDUCED',
  });
  assert.equal(stillTooLarge.status, 'REDUCE');
  assert.ok(stillTooLarge.reasons.some((item) => item.code === 'MARKET_REGIME' && item.severity === 'WARN'));
}

{
  const dailyLimit = evaluateRiskGate({
    policy,
    totalEquity: 100_000,
    candidateRisk: 500,
    currentOpenRisk: 0,
    dailyLossPct: 2,
    weeklyLossPct: 2,
    currentPositionCount: 1,
  });
  assert.equal(dailyLimit.status, 'BLOCK');
  assert.ok(dailyLimit.reasons.some((item) => item.message.includes('Daily loss')));

  const weeklyLimit = evaluateRiskGate({
    policy,
    totalEquity: 100_000,
    candidateRisk: 500,
    currentOpenRisk: 0,
    dailyLossPct: 1,
    weeklyLossPct: 4,
    currentPositionCount: 1,
  });
  assert.equal(weeklyLimit.status, 'BLOCK');
  assert.ok(weeklyLimit.reasons.some((item) => item.message.includes('Weekly loss')));
}

{
  const positionPolicy = { ...policy, maxPositions: 5 };
  const atCapacity = evaluateRiskGate({
    policy: positionPolicy,
    totalEquity: 100_000,
    candidateRisk: 500,
    currentOpenRisk: 0,
    dailyLossPct: 0,
    weeklyLossPct: 0,
    currentPositionCount: 5,
  });
  assert.equal(atCapacity.status, 'BLOCK');
  assert.ok(atCapacity.reasons.some((item) => item.message.includes('Position limit')));

  const lastSlot = evaluateRiskGate({
    policy: positionPolicy,
    totalEquity: 100_000,
    candidateRisk: 500,
    currentOpenRisk: 0,
    dailyLossPct: 0,
    weeklyLossPct: 0,
    currentPositionCount: 4,
  });
  assert.equal(lastSlot.status, 'PASS');
}

console.log('risk gate tests passed');
