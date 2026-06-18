import assert from 'node:assert/strict';
import { canInfluenceDecision, validatePromotion } from '../lib/validation/model-governance.ts';

assert.equal(canInfluenceDecision('RESEARCH_ONLY'), false);
assert.equal(canInfluenceDecision('APPROVED'), true);
assert.equal(validatePromotion({ currentStatus: 'SHADOW', targetStatus: 'APPROVED', pointInTime: false, licensed: false }).allowed, false);
assert.equal(validatePromotion({
  currentStatus: 'SHADOW', targetStatus: 'APPROVED', pointInTime: true, licensed: true,
  approvedBy: 'CIO', metrics: { expectancy: 0.2, sharpe: 1, sortino: 1.2, maxDrawdownPct: 12, turnover: 2, hitRate: 0.5, payoffRatio: 1.4 },
}).allowed, true);
console.log('model governance tests passed');
