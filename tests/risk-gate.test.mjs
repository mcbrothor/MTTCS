import assert from 'node:assert/strict';
import { evaluateRiskGate } from '../lib/finance/core/risk-gate.ts';
import { buildRiskPolicyForStrategy } from '../lib/finance/core/risk-policy.ts';

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

console.log('risk gate tests passed');
