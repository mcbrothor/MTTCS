import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const evidencePerformance = jiti('../lib/recommendations/evidence-performance.ts');
const {
  buildRecommendationEvidenceEvaluationRows,
  recommendationEvidenceManifestInsertRow,
} = jiti('../lib/recommendations/evidence-repository.ts');

function priceSeries(instrument) {
  return {
    instrument,
    source: 'official-provider',
    adjustmentType: 'PROVIDER_ADJUSTED',
    qualityStatus: 'FULL',
    bars: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 1_000 + index,
      qualityStatus: 'FULL',
    })),
  };
}

{
  const calculation = evidencePerformance.buildRecommendationPriceEvidence({
    pickId: '00000000-0000-4000-8000-000000000003',
    generatedAt: '2026-06-30T12:00:00Z',
    market: 'US',
    horizon: 'D5',
    security: priceSeries('TEST'),
    benchmark: priceSeries('BENCH'),
  });
  const manifest = evidencePerformance.buildRecommendationEvidenceManifest({
    pickId: '00000000-0000-4000-8000-000000000003',
    engineId: 'engine-v1',
    promptId: 'prompt-v1',
    calculation,
    marketRegime: 'GREEN',
  });
  const insert = recommendationEvidenceManifestInsertRow(manifest);
  assert.equal(insert.pick_id, manifest.pickId);
  assert.equal(insert.horizon, 'D5');
  assert.equal(insert.payload_hash, manifest.dataManifestId);
  assert.deepEqual(insert.data_payload, manifest.dataPayload);
  assert.deepEqual(insert.calculation_result, manifest.calculationResult);

  const tampered = structuredClone(manifest);
  tampered.dataPayload.security.bars[0].close += 1;
  assert.throws(() => recommendationEvidenceManifestInsertRow(tampered), /payload hash/i);
}

function row({ engineVersion, horizon, day, dataTier = 'OFFICIAL', excess = 2 }) {
  const runDate = `2026-07-${String(day).padStart(2, '0')}`;
  return {
    status: 'MATURED',
    cost_model_version: 'mtn-standardized-round-trip-v1',
    horizon,
    net_return_pct: excess + 2,
    net_excess_return_pct: excess,
    mae_pct: -1,
    data_evidence_tier: dataTier,
    evidence_status: 'READY',
    evidence_manifest_id: `${engineVersion}-${horizon}-${runDate}-${dataTier}`,
    market_regime: day % 2 === 0 ? 'RED' : 'GREEN',
    recommendation_picks: {
      id: `${engineVersion}-${runDate}-${day % 2}`,
      recommendation_publications: {
        run_date: runDate,
        market: 'US',
        category: 'NASDAQ100',
        engine_version: engineVersion,
        assurance_contract_hash: engineVersion === 'engine-a' ? 'a'.repeat(64) : 'b'.repeat(64),
        is_official: true,
        status: 'PUBLISHED',
      },
    },
  };
}

const rows = [];
for (const engineVersion of ['engine-a', 'engine-b']) {
  for (const horizon of ['D5', 'D20', 'D60']) {
    for (let day = 1; day <= 4; day += 1) {
      rows.push(row({ engineVersion, horizon, day, excess: engineVersion === 'engine-a' ? 2 : 1 }));
      rows.push(row({ engineVersion, horizon, day, excess: engineVersion === 'engine-a' ? 3 : 1.5 }));
    }
    rows.push(row({ engineVersion, horizon, day: 1, dataTier: 'FALLBACK', excess: -30 }));
  }
}

const options = {
  policy: { minimumSampleSize: 8, minimumCohortCount: 4, minimumMarketRegimeCount: 2 },
  bootstrap: { iterations: 1_000, seed: 20260802 },
};
const first = buildRecommendationEvidenceEvaluationRows(rows, 'US', options);
const reversed = buildRecommendationEvidenceEvaluationRows([...rows].reverse(), 'US', options);

assert.equal(first.length, 6, 'engine versions and horizons remain independent evaluation units');
assert.deepEqual(
  first.map((item) => item.evaluation_hash).sort(),
  reversed.map((item) => item.evaluation_hash).sort(),
  'the immutable evaluation identity must not depend on database row order',
);
for (const evaluation of first) {
  assert.equal(evaluation.statistics.official.sampleSize, 8);
  assert.equal(evaluation.statistics.fallback.sampleSize, 1);
  assert.equal(evaluation.promotion_gate.status, 'PASS');
  assert.equal(evaluation.data_scope, 'OFFICIAL_GATE_WITH_FALLBACK_DIAGNOSTIC');
  assert.equal(evaluation.account_evidence_status, 'NOT_AVAILABLE');
}

assert.notEqual(
  first.find((item) => item.engine_version === 'engine-a' && item.horizon === 'D5').evaluation_hash,
  first.find((item) => item.engine_version === 'engine-b' && item.horizon === 'D5').evaluation_hash,
);

console.log('recommendation evidence repository tests passed');
