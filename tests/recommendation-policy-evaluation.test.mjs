import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const evaluation = jiti('../lib/recommendations/policy-evaluation.ts');
const { RECOMMENDATION_ENGINE_VERSION } = jiti('../lib/recommendations/config.ts');

const rows = [];
for (let index = 0; index < 20; index += 1) {
  const runDate = `2026-07-${String(index + 1).padStart(2, '0')}`;
  rows.push({ runDate, engineVersion: RECOMMENDATION_ENGINE_VERSION, averageExcessReturnPct: 0, averageMaePct: -3, lowerDecileReturnPct: -5, flowCoveragePct: null });
  rows.push({ runDate, engineVersion: 'kr-risk-ranked-v2', averageExcessReturnPct: 0.7, averageMaePct: -2.8, lowerDecileReturnPct: -4.8, flowCoveragePct: null });
  rows.push({ runDate, engineVersion: 'kr-risk-flow-v2.1', averageExcessReturnPct: 1, averageMaePct: -2.7, lowerDecileReturnPct: -4.7, flowCoveragePct: 95 });
}
const result = evaluation.evaluateKrPolicyPromotion(rows);
assert.equal(result.cohortCount, 20);
assert.equal(result.riskPassed, true);
assert.equal(result.flowPassed, true);
assert.equal(result.decision, 'PROMOTE_FLOW');

const bootstrapA = evaluation.pairedBootstrap({
  baseline: rows.filter((row) => row.engineVersion === RECOMMENDATION_ENGINE_VERSION),
  challenger: rows.filter((row) => row.engineVersion === 'kr-risk-ranked-v2'),
});
const bootstrapB = evaluation.pairedBootstrap({
  baseline: rows.filter((row) => row.engineVersion === RECOMMENDATION_ENGINE_VERSION),
  challenger: rows.filter((row) => row.engineVersion === 'kr-risk-ranked-v2'),
});
assert.deepEqual(bootstrapA, bootstrapB, 'bootstrap is deterministic with the fixed seed');

const rollback = evaluation.evaluateKrPolicyRollback({
  active: rows.filter((row) => row.engineVersion === 'kr-risk-flow-v2.1').map((row) => ({ ...row, averageExcessReturnPct: -1.5 })),
  comparison: rows.filter((row) => row.engineVersion === 'kr-risk-ranked-v2'),
});
assert.equal(rollback.rollback, true);
assert.equal(rollback.reason, 'ALPHA_UNDERPERFORMANCE');

console.log('recommendation policy evaluation tests passed');
