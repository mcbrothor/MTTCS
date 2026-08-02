import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const evaluation = jiti('../lib/recommendations/policy-evaluation.ts');
const {
  KR_RISK_ENGINE_VERSION,
  KR_RISK_FLOW_ENGINE_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
} = jiti('../lib/recommendations/config.ts');

const rows = [];
for (let index = 0; index < 20; index += 1) {
  const runDate = `2026-07-${String(index + 1).padStart(2, '0')}`;
  rows.push({ runDate, engineVersion: RECOMMENDATION_ENGINE_VERSION, averageExcessReturnPct: 0, averageMaePct: -3, lowerDecileReturnPct: -5, flowCoveragePct: null });
  rows.push({ runDate, engineVersion: KR_RISK_ENGINE_VERSION, averageExcessReturnPct: 0.7, averageMaePct: -2.8, lowerDecileReturnPct: -4.8, flowCoveragePct: null });
  rows.push({ runDate, engineVersion: KR_RISK_FLOW_ENGINE_VERSION, averageExcessReturnPct: 1, averageMaePct: -2.7, lowerDecileReturnPct: -4.7, flowCoveragePct: 95 });
}
const result = evaluation.evaluateKrPolicyPromotion(rows);
assert.equal(result.cohortCount, 20);
assert.equal(result.riskPassed, true);
assert.equal(result.flowPassed, true);
assert.equal(result.decision, 'PROMOTE_FLOW');

{
  const categories = ['KOSPI200', 'KOSDAQ150'].map((category) => ({
    category,
    cohorts: { D20: rows, D60: rows },
  }));
  const readiness = evaluation.evaluateKrLongTermPolicyPromotion({
    activeEngineVersion: RECOMMENDATION_ENGINE_VERSION,
    categories,
  });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.allMature, true);
  assert.equal(readiness.recommendedEngineVersion, KR_RISK_FLOW_ENGINE_VERSION);
  assert.equal(readiness.evaluations.length, 4);

  const insufficient = evaluation.evaluateKrLongTermPolicyPromotion({
    activeEngineVersion: RECOMMENDATION_ENGINE_VERSION,
    categories: categories.map((item) => ({
      ...item,
      cohorts: { ...item.cohorts, D60: item.category === 'KOSDAQ150' ? rows.slice(0, 57) : rows },
    })),
  });
  assert.equal(insufficient.ready, false);
  assert.equal(insufficient.allMature, false);
  assert.equal(insufficient.reason, 'INSUFFICIENT_LONG_TERM_COHORTS');

  const alreadyActive = evaluation.evaluateKrLongTermPolicyPromotion({
    activeEngineVersion: KR_RISK_FLOW_ENGINE_VERSION,
    categories,
  });
  assert.equal(alreadyActive.ready, false);
  assert.equal(alreadyActive.reason, 'ALREADY_ACTIVE');

  const riskOnlyRows = rows.map((row) => row.engineVersion === KR_RISK_FLOW_ENGINE_VERSION
    ? { ...row, flowCoveragePct: 50 }
    : row);
  const noDowngradeAlert = evaluation.evaluateKrLongTermPolicyPromotion({
    activeEngineVersion: KR_RISK_FLOW_ENGINE_VERSION,
    categories: categories.map((item) => ({
      ...item,
      cohorts: { D20: riskOnlyRows, D60: riskOnlyRows },
    })),
  });
  assert.equal(noDowngradeAlert.riskReady, true);
  assert.equal(noDowngradeAlert.flowReady, false);
  assert.equal(noDowngradeAlert.recommendedEngineVersion, KR_RISK_ENGINE_VERSION);
  assert.equal(noDowngradeAlert.ready, false);
  assert.equal(noDowngradeAlert.reason, 'NO_FORWARD_PROMOTION');
}

{
  const mismatched = [
    { ...rows[0], runDate: '2026-01-01', engineVersion: RECOMMENDATION_ENGINE_VERSION },
    { ...rows[0], runDate: '2026-01-02', engineVersion: RECOMMENDATION_ENGINE_VERSION },
    { ...rows[1], runDate: '2026-01-01', engineVersion: KR_RISK_ENGINE_VERSION },
    { ...rows[1], runDate: '2026-01-02', engineVersion: KR_RISK_ENGINE_VERSION },
    { ...rows[1], runDate: '2026-01-03', engineVersion: KR_RISK_ENGINE_VERSION },
    { ...rows[2], runDate: '2026-01-01', engineVersion: KR_RISK_FLOW_ENGINE_VERSION },
    { ...rows[2], runDate: '2026-01-03', engineVersion: KR_RISK_FLOW_ENGINE_VERSION },
  ];
  assert.equal(evaluation.evaluateKrPolicyPromotion(mismatched).cohortCount, 1);
}

const bootstrapA = evaluation.pairedBootstrap({
  baseline: rows.filter((row) => row.engineVersion === RECOMMENDATION_ENGINE_VERSION),
  challenger: rows.filter((row) => row.engineVersion === KR_RISK_ENGINE_VERSION),
});
const bootstrapB = evaluation.pairedBootstrap({
  baseline: rows.filter((row) => row.engineVersion === RECOMMENDATION_ENGINE_VERSION),
  challenger: rows.filter((row) => row.engineVersion === KR_RISK_ENGINE_VERSION),
});
assert.deepEqual(bootstrapA, bootstrapB, 'bootstrap is deterministic with the fixed seed');

const rollback = evaluation.evaluateKrPolicyRollback({
  active: rows.filter((row) => row.engineVersion === KR_RISK_FLOW_ENGINE_VERSION).map((row) => ({ ...row, averageExcessReturnPct: -1.5 })),
  comparison: rows.filter((row) => row.engineVersion === KR_RISK_ENGINE_VERSION),
});
assert.equal(rollback.rollback, true);
assert.equal(rollback.reason, 'ALPHA_UNDERPERFORMANCE');

console.log('recommendation policy evaluation tests passed');
