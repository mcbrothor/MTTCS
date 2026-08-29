import assert from 'node:assert/strict';
import { computeDecision } from '../lib/decision/rule.ts';

// Test 1: 기본 GREEN + RISK_ON -> GO_FULL
{
  const result = computeDecision('GREEN', 'RISK_ON');
  assert.equal(result.decision, 'GO_FULL');
  assert.equal(result.sizeMultiplier, 1.0);
}

// Test 2: GREEN + RISK_ON 이지만 Risk Barometer가 HIGH(과열)일 때 -> GO_50 강제 감속
{
  const result = computeDecision('GREEN', 'RISK_ON', {
    riskBarometerBand: 'HIGH',
    riskBarometerScore: 8,
  });
  assert.equal(result.decision, 'GO_50');
  assert.equal(result.sizeMultiplier, 0.5);
  assert.ok(result.blockingFactors.some((f) => f.includes('리스크 바로미터 HIGH')));
}

// Test 3: GREEN + RISK_ON 이지만 Risk Barometer가 CAUTION일 때 -> GO_75
{
  const result = computeDecision('GREEN', 'RISK_ON', {
    riskBarometerBand: 'CAUTION',
  });
  assert.equal(result.decision, 'GO_75');
  assert.equal(result.sizeMultiplier, 0.75);
}

// Test 4: Master Filter가 RED이면 Risk Barometer 무관하게 NO_GO
{
  const result = computeDecision('RED', 'RISK_ON', {
    riskBarometerBand: 'LOW',
  });
  assert.equal(result.decision, 'NO_GO');
  assert.equal(result.sizeMultiplier, 0);
}

console.log('decision rule tests passed');
