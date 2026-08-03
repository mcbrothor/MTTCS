import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const { buildLongitudinalEvidenceEvaluationRows } = jiti('../lib/assurance/longitudinal-evidence.ts');
const ASSURANCE_CONTRACT_HASH = 'a'.repeat(64);

function monthDate(monthOffset, day) {
  const date = new Date(Date.UTC(2026, 7 - monthOffset, day));
  return date.toISOString().slice(0, 10);
}

function evidenceRows({
  months = 10,
  cohortsPerMonth = 6,
  picksPerCohort = 2,
  assuranceContractHash = ASSURANCE_CONTRACT_HASH,
} = {}) {
  const rows = [];
  let pickIndex = 0;
  for (let month = months - 1; month >= 0; month -= 1) {
    for (let cohort = 1; cohort <= cohortsPerMonth; cohort += 1) {
      const runDate = monthDate(month, cohort + 1);
      for (const horizon of ['D5', 'D20', 'D60']) {
        for (let pick = 0; pick < picksPerCohort; pick += 1) {
          pickIndex += 1;
          const pickId = `pick-${month}-${cohort}-${pick}`;
          rows.push({
            status: 'MATURED',
            cost_model_version: 'mtn-standardized-round-trip-v1',
            horizon,
            net_return_pct: 2 + (pick / 10),
            net_excess_return_pct: 1 + (pick / 10),
            mae_pct: -2,
            data_evidence_tier: 'OFFICIAL',
            evidence_status: 'READY',
            evidence_manifest_id: `manifest-${pickIndex}`,
            market_regime: month % 2 === 0 ? 'GREEN' : 'RED',
            recommendation_picks: {
              id: pickId,
              recommendation_publications: {
                run_date: runDate,
                market: 'US',
                category: 'NASDAQ100',
                engine_version: 'engine-v1',
                assurance_contract_hash: assuranceContractHash,
                is_official: true,
                status: 'PUBLISHED',
              },
            },
          });
        }
      }
    }
  }
  return rows;
}

function evaluation(rows, windowMonths, horizon, assuranceContractHash = ASSURANCE_CONTRACT_HASH) {
  const result = buildLongitudinalEvidenceEvaluationRows(rows, 'US');
  const value = result.find((row) => row.window_months === windowMonths
    && row.horizon === horizon
    && row.assurance_contract_hash === assuranceContractHash);
  assert.ok(value, `missing ${windowMonths}m ${horizon} evaluation`);
  return value;
}

test('10 covered months, 60 cohorts, 120 official samples, two balanced regimes pass the 12-month gate', () => {
  const row = evaluation(evidenceRows(), 12, 'D5');
  assert.equal(row.covered_month_count, 10);
  assert.equal(row.cohort_count, 60);
  assert.equal(row.sample_size, 120);
  assert.equal(row.market_regime_count, 2);
  assert.equal(row.evidence_status, 'READY');
  assert.equal(row.gate_status, 'PASS');
  assert.deepEqual(row.gate_reasons, []);
});

test('legacy publications without a publication-time contract hash are never admitted retroactively', () => {
  const legacyRows = evidenceRows({ assuranceContractHash: null });
  assert.deepEqual(buildLongitudinalEvidenceEvaluationRows(legacyRows, 'US'), []);

  const currentRows = evidenceRows();
  const baseline = evaluation(currentRows, 12, 'D5');
  const mixed = evaluation([...currentRows, ...legacyRows], 12, 'D5');
  assert.equal(mixed.evaluation_hash, baseline.evaluation_hash);
  assert.equal(mixed.sample_size, baseline.sample_size);
});

test('the same engine under a changed assurance contract starts a separate longitudinal window', () => {
  const changedContractHash = 'b'.repeat(64);
  const established = evidenceRows();
  const changed = evidenceRows({ months: 1, assuranceContractHash: changedContractHash });
  const establishedEvaluation = evaluation([...established, ...changed], 12, 'D5');
  const changedEvaluation = evaluation([...established, ...changed], 12, 'D5', changedContractHash);

  assert.equal(establishedEvaluation.gate_status, 'PASS');
  assert.equal(changedEvaluation.covered_month_count, 1);
  assert.equal(changedEvaluation.gate_status, 'BLOCKED');
  assert.notEqual(changedEvaluation.evaluation_hash, establishedEvaluation.evaluation_hash);
});

test('fallback rows stay in the completeness denominator and block longitudinal assurance', () => {
  const rows = evidenceRows();
  const fallback = structuredClone(rows[0]);
  fallback.data_evidence_tier = 'FALLBACK';
  fallback.net_return_pct = -99;
  fallback.net_excess_return_pct = -99;
  fallback.evidence_manifest_id = 'fallback-manifest';
  const withoutFallback = evaluation(rows, 12, 'D5');
  const withFallback = evaluation([...rows, fallback], 12, 'D5');
  assert.notEqual(withFallback.evaluation_hash, withoutFallback.evaluation_hash);
  assert.equal(withFallback.sample_size, withoutFallback.sample_size);
  assert.equal(withFallback.gate_status, 'BLOCKED');
  assert.ok(withFallback.gate_reasons.includes('INCOMPLETE_OFFICIAL_EVIDENCE'));
});

test('pending, error, and excluded rows cannot disappear from an otherwise passing population', () => {
  for (const status of ['PENDING', 'ERROR', 'EXCLUDED']) {
    const rows = evidenceRows();
    const target = rows.find((row) => row.horizon === 'D5');
    target.status = status;
    target.net_return_pct = null;
    target.net_excess_return_pct = null;
    target.mae_pct = null;

    const row = evaluation(rows, 12, 'D5');
    assert.equal(row.gate_status, 'BLOCKED', status);
    assert.equal(row.evidence_status, 'INCOMPLETE', status);
    assert.ok(row.gate_reasons.includes('INCOMPLETE_OFFICIAL_EVIDENCE'), status);
  }
});

test('a missing horizon row is counted against the expected pick population', () => {
  const rows = evidenceRows();
  const targetPick = rows.find((row) => row.horizon === 'D5').recommendation_picks.id;
  const missing = rows.filter((row) => !(
    row.horizon === 'D5' && row.recommendation_picks.id === targetPick
  ));
  const row = evaluation(missing, 12, 'D5');

  assert.equal(row.gate_status, 'BLOCKED');
  assert.equal(row.evidence_status, 'INCOMPLETE');
  assert.ok(row.gate_reasons.includes('INCOMPLETE_OFFICIAL_EVIDENCE'));
});

test('unpublished rows are excluded even when they are marked official', () => {
  const rows = evidenceRows();
  const draft = structuredClone(rows[0]);
  draft.recommendation_picks.recommendation_publications.status = 'DRAFT';
  draft.net_return_pct = -99;
  draft.net_excess_return_pct = -99;
  draft.evidence_manifest_id = 'draft-manifest';
  const publishedOnly = evaluation(rows, 12, 'D5');
  const withDraft = evaluation([...rows, draft], 12, 'D5');
  assert.equal(withDraft.evaluation_hash, publishedOnly.evaluation_hash);
});

test('each horizon window ends at its own latest matured cohort', () => {
  const rows = evidenceRows();
  const newestRunDate = rows
    .map((row) => row.recommendation_picks.recommendation_publications.run_date)
    .sort()
    .at(-1);
  const withoutNewestD60 = rows.filter((row) => !(
    row.horizon === 'D60'
    && row.recommendation_picks.recommendation_publications.run_date === newestRunDate
  ));
  const d5 = evaluation(withoutNewestD60, 12, 'D5');
  const d60 = evaluation(withoutNewestD60, 12, 'D60');
  assert.equal(d5.window_end, newestRunDate);
  assert.notEqual(d60.window_end, newestRunDate);
  assert.ok(d60.window_end < d5.window_end);
});

test('one incomplete official observation fails closed', () => {
  const rows = evidenceRows();
  const target = rows.find((row) => row.horizon === 'D5');
  target.evidence_status = 'INCOMPLETE';
  target.evidence_manifest_id = null;
  const row = evaluation(rows, 12, 'D5');
  assert.equal(row.evidence_status, 'INCOMPLETE');
  assert.equal(row.gate_status, 'BLOCKED');
  assert.ok(row.gate_reasons.includes('INCOMPLETE_OFFICIAL_EVIDENCE'));
});

test('a non-positive cost-adjusted excess CI and excessive tail losses independently block promotion', () => {
  const negative = evidenceRows();
  for (const row of negative.filter((item) => item.horizon === 'D20')) row.net_excess_return_pct = -0.2;
  const ci = evaluation(negative, 12, 'D20');
  assert.equal(ci.gate_status, 'BLOCKED');
  assert.ok(ci.gate_reasons.includes('NON_POSITIVE_EXCESS_CI_LOWER_BOUND'));

  const tail = evidenceRows();
  const d5 = tail.filter((row) => row.horizon === 'D5');
  for (let index = 0; index < 12; index += 1) d5[index].net_return_pct = -12;
  const tailResult = evaluation(tail, 12, 'D5');
  assert.equal(tailResult.gate_status, 'BLOCKED');
  assert.ok(tailResult.gate_reasons.includes('TAIL_BREACH_RATE_EXCEEDED'));
});

test('24-month gate requires 20 covered months and the stronger cohort/sample floor', () => {
  const insufficient = evaluation(evidenceRows(), 24, 'D5');
  assert.equal(insufficient.gate_status, 'BLOCKED');
  assert.ok(insufficient.gate_reasons.includes('INSUFFICIENT_MONTH_COVERAGE'));
  assert.ok(insufficient.gate_reasons.includes('INSUFFICIENT_SAMPLE_SIZE'));

  const sufficient = evaluation(evidenceRows({ months: 20 }), 24, 'D5');
  assert.equal(sufficient.covered_month_count, 20);
  assert.equal(sufficient.cohort_count, 120);
  assert.equal(sufficient.sample_size, 240);
  assert.equal(sufficient.gate_status, 'PASS');
});

test('evaluation hashes are deterministic and change when a used official observation changes', () => {
  const rows = evidenceRows();
  const first = evaluation(rows, 12, 'D60');
  const same = evaluation(structuredClone(rows), 12, 'D60');
  assert.equal(first.evaluation_hash, same.evaluation_hash);

  const revised = structuredClone(rows);
  revised.find((row) => row.horizon === 'D60').net_excess_return_pct += 0.1;
  assert.notEqual(evaluation(revised, 12, 'D60').evaluation_hash, first.evaluation_hash);
});
