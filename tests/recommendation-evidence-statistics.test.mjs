import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const {
  evaluateRecommendationEvidence,
  recommendationDayBlockBootstrap95,
} = jiti('../lib/recommendations/evidence-statistics.ts');

function observation({
  runDate,
  horizon = 'D5',
  dataTier = 'OFFICIAL',
  netReturnPct = 3,
  netExcessReturnPct = 1.5,
  maePct = -1,
  marketRegime = 'GREEN',
  evidenceStatus = 'READY',
  evidenceManifestId = `manifest-${runDate}`,
} = {}) {
  return {
    runDate,
    horizon,
    dataTier,
    netReturnPct,
    netExcessReturnPct,
    maePct,
    marketRegime,
    evidenceStatus,
    evidenceManifestId,
  };
}

function completeObservations() {
  const rows = [];
  const horizonOffsets = { D5: 0, D20: 2, D60: 4 };

  for (const [horizon, offset] of Object.entries(horizonOffsets)) {
    for (let day = 1; day <= 4; day += 1) {
      const runDate = `2026-07-${String(day).padStart(2, '0')}`;
      const marketRegime = day % 2 === 0 ? 'RED' : 'GREEN';
      rows.push(observation({
        runDate,
        horizon,
        netReturnPct: 3 + offset,
        netExcessReturnPct: 1.5 + offset,
        maePct: -1,
        marketRegime,
      }));
      rows.push(observation({
        runDate,
        horizon,
        netReturnPct: 4 + offset,
        netExcessReturnPct: 2 + offset,
        maePct: -2,
        marketRegime,
        evidenceManifestId: `manifest-${runDate}-second`,
      }));
    }

    rows.push(observation({
      runDate: '2026-07-01',
      horizon,
      dataTier: 'FALLBACK',
      netReturnPct: -40,
      netExcessReturnPct: -42,
      maePct: -50,
    }));
  }

  return rows;
}

const bootstrapOptions = { iterations: 2_000, seed: 20260802 };
const promotionPolicy = {
  minimumSampleSize: 8,
  minimumCohortCount: 4,
  minimumMarketRegimeCount: 2,
};

{
  const rows = [
    ...Array.from({ length: 100 }, (_, index) => observation({
      runDate: '2026-07-01',
      netExcessReturnPct: 10,
      evidenceManifestId: `manifest-large-${index}`,
    })),
    observation({ runDate: '2026-07-02', netExcessReturnPct: 0 }),
  ];

  const first = recommendationDayBlockBootstrap95({
    observations: rows,
    valueKey: 'netExcessReturnPct',
    ...bootstrapOptions,
  });
  const second = recommendationDayBlockBootstrap95({
    observations: rows,
    valueKey: 'netExcessReturnPct',
    ...bootstrapOptions,
  });

  assert.deepEqual(first, second, 'a fixed seed makes the cohort bootstrap deterministic');
  assert.equal(first.confidenceLevel, 0.95);
  assert.equal(first.sampleSize, 101);
  assert.equal(first.cohortCount, 2);
  assert.equal(first.mean, 5, 'recommendation-day cohorts are equally weighted instead of treating picks as independent');
  assert.ok(first.lower <= first.mean);
  assert.ok(first.upper >= first.mean);
}

{
  const result = evaluateRecommendationEvidence({
    observations: completeObservations(),
    bootstrap: bootstrapOptions,
    policy: promotionPolicy,
  });

  assert.deepEqual(Object.keys(result.horizons).sort(), ['D20', 'D5', 'D60']);
  assert.equal(result.horizons.D5.official.sampleSize, 8);
  assert.equal(result.horizons.D5.official.cohortCount, 4);
  assert.equal(result.horizons.D5.official.meanNetReturnPct, 3.5);
  assert.equal(result.horizons.D20.official.meanNetReturnPct, 5.5);
  assert.equal(result.horizons.D60.official.meanNetReturnPct, 7.5);
  assert.equal(result.horizons.D5.official.averageMaePct, -1.5);
  assert.equal(result.horizons.D5.official.lowerDecileNetReturnPct, 3);
  assert.equal(result.horizons.D5.official.marketRegimeCount, 2);
  assert.ok(result.horizons.D5.official.excessReturnConfidenceInterval95.lower > 0);

  assert.equal(result.horizons.D5.fallback.sampleSize, 1);
  assert.equal(result.horizons.D5.fallback.meanNetReturnPct, -40);
  assert.equal(result.horizons.D5.official.meanNetReturnPct, 3.5, 'fallback rows do not contaminate official evidence');

  for (const horizon of ['D5', 'D20', 'D60']) {
    assert.equal(result.horizons[horizon].promotion.status, 'PASS');
    assert.equal(result.horizons[horizon].promotion.passed, true);
  }
  assert.equal(result.promotion.allHorizonsPass, true);
}

{
  const result = evaluateRecommendationEvidence({
    observations: completeObservations(),
    bootstrap: bootstrapOptions,
    policy: { ...promotionPolicy, minimumSampleSize: 9, minimumCohortCount: 5 },
  });

  assert.equal(result.horizons.D5.promotion.status, 'BLOCKED');
  assert.equal(result.horizons.D5.promotion.passed, false);
  assert.ok(result.horizons.D5.promotion.reasons.includes('INSUFFICIENT_SAMPLE_SIZE'));
  assert.ok(result.horizons.D5.promotion.reasons.includes('INSUFFICIENT_COHORT_COUNT'));
  assert.equal(result.promotion.allHorizonsPass, false);
}

{
  const oneRegime = completeObservations().map((row) => (
    row.dataTier === 'OFFICIAL' && row.horizon === 'D5'
      ? { ...row, marketRegime: 'GREEN' }
      : row
  ));
  const result = evaluateRecommendationEvidence({
    observations: oneRegime,
    bootstrap: bootstrapOptions,
    policy: promotionPolicy,
  });

  assert.equal(result.horizons.D5.promotion.status, 'BLOCKED');
  assert.ok(result.horizons.D5.promotion.reasons.includes('INSUFFICIENT_MARKET_REGIMES'));
}

{
  const nonPositiveExcess = completeObservations().map((row) => (
    row.dataTier === 'OFFICIAL' && row.horizon === 'D20'
      ? { ...row, netExcessReturnPct: 0 }
      : row
  ));
  const result = evaluateRecommendationEvidence({
    observations: nonPositiveExcess,
    bootstrap: bootstrapOptions,
    policy: promotionPolicy,
  });

  assert.equal(result.horizons.D20.promotion.status, 'BLOCKED');
  assert.equal(result.horizons.D20.official.excessReturnConfidenceInterval95.lower, 0);
  assert.ok(result.horizons.D20.promotion.reasons.includes('NON_POSITIVE_EXCESS_CI_LOWER_BOUND'));
}

{
  const incomplete = completeObservations();
  incomplete[0] = { ...incomplete[0], evidenceManifestId: null };
  const missingRegimeIndex = incomplete.findIndex((row) => row.horizon === 'D60' && row.dataTier === 'OFFICIAL');
  incomplete[missingRegimeIndex] = { ...incomplete[missingRegimeIndex], marketRegime: null };

  const result = evaluateRecommendationEvidence({
    observations: incomplete,
    bootstrap: bootstrapOptions,
    policy: promotionPolicy,
  });

  assert.equal(result.horizons.D5.promotion.status, 'BLOCKED');
  assert.ok(result.horizons.D5.promotion.reasons.includes('INCOMPLETE_EVIDENCE'));
  assert.equal(result.horizons.D60.promotion.status, 'BLOCKED');
  assert.ok(result.horizons.D60.promotion.reasons.includes('MISSING_MARKET_REGIME'));
  assert.equal(result.promotion.allHorizonsPass, false, 'missing evidence fails closed instead of being silently discarded');
}

{
  const missingMetric = completeObservations();
  missingMetric[0] = { ...missingMetric[0], maePct: null };
  const result = evaluateRecommendationEvidence({
    observations: missingMetric,
    bootstrap: bootstrapOptions,
    policy: promotionPolicy,
  });

  assert.equal(result.horizons.D5.promotion.status, 'BLOCKED');
  assert.ok(result.horizons.D5.promotion.reasons.includes('MISSING_PERFORMANCE_METRICS'));
}

console.log('recommendation evidence statistics tests passed');
