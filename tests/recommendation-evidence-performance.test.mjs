import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const evidence = jiti('../lib/recommendations/evidence-performance.ts');

function longSeries({ instrument = 'TEST', qualityStatus = 'FULL', source = 'official-provider', revised = {} } = {}) {
  return {
    instrument,
    source,
    adjustmentType: 'PROVIDER_ADJUSTED',
    qualityStatus,
    bars: Array.from({ length: 10 }, (_, index) => {
      const day = index + 1;
      const baseline = 100 + day;
      const close = revised[day] ?? baseline;
      return {
        date: `2026-07-${String(day).padStart(2, '0')}`,
        open: baseline,
        high: Math.max(baseline, close) + 2,
        low: Math.min(baseline, close) - 2,
        close,
        volume: 1_000 + day,
        qualityStatus,
      };
    }),
  };
}

{
  const left = evidence.stableEvidenceHash({ z: 1, nested: { b: 2, a: 1 } });
  const right = evidence.stableEvidenceHash({ nested: { a: 1, b: 2 }, z: 1 });
  assert.equal(left, right, 'object key order must not change immutable identifiers');
  assert.notEqual(left, evidence.stableEvidenceHash({ nested: { a: 1, b: 3 }, z: 1 }));
}

{
  const first = evidence.buildRecommendationPriceEvidence({
    pickId: '00000000-0000-4000-8000-000000000001',
    generatedAt: '2026-06-30T12:00:00Z',
    market: 'US',
    horizon: 'D5',
    security: longSeries(),
    benchmark: longSeries({ instrument: 'BENCH', source: 'official-benchmark' }),
  });
  const same = evidence.buildRecommendationPriceEvidence({
    pickId: '00000000-0000-4000-8000-000000000001',
    generatedAt: '2026-06-30T12:00:00Z',
    market: 'US',
    horizon: 'D5',
    security: longSeries(),
    benchmark: longSeries({ instrument: 'BENCH', source: 'official-benchmark' }),
  });
  const changed = evidence.buildRecommendationPriceEvidence({
    pickId: '00000000-0000-4000-8000-000000000001',
    generatedAt: '2026-06-30T12:00:00Z',
    market: 'US',
    horizon: 'D5',
    security: longSeries({ revised: { 4: 140 } }),
    benchmark: longSeries({ instrument: 'BENCH', source: 'official-benchmark' }),
  });
  assert.equal(first.dataManifest.evidenceTier, 'OFFICIAL');
  assert.equal(first.dataManifest.dataManifestId, same.dataManifest.dataManifestId);
  assert.notEqual(first.dataManifest.dataManifestId, changed.dataManifest.dataManifestId, 'a used price change must create a new data manifest');

  const fallback = evidence.buildRecommendationPriceEvidence({
    pickId: '00000000-0000-4000-8000-000000000001',
    generatedAt: '2026-06-30T12:00:00Z',
    market: 'US',
    horizon: 'D5',
    security: longSeries({ qualityStatus: 'FALLBACK' }),
    benchmark: longSeries({ instrument: 'BENCH', source: 'official-benchmark' }),
  });
  assert.equal(fallback.dataManifest.evidenceTier, 'FALLBACK');
}

{
  const calculation = evidence.buildRecommendationPriceEvidence({
    pickId: '00000000-0000-4000-8000-000000000001',
    generatedAt: '2026-06-30T12:00:00Z',
    market: 'US',
    horizon: 'D5',
    security: longSeries(),
    benchmark: longSeries({ instrument: 'BENCH', source: 'official-benchmark' }),
  });
  const first = evidence.buildRecommendationEvidenceManifest({
    pickId: '00000000-0000-4000-8000-000000000001',
    engineId: 'engine-v1',
    promptId: 'prompt-v1',
    strategyId: 'strategy-v1',
    calculation,
    marketRegime: 'GREEN',
  });
  const same = evidence.buildRecommendationEvidenceManifest({
    marketRegime: 'GREEN',
    calculation,
    strategyId: 'strategy-v1',
    promptId: 'prompt-v1',
    engineId: 'engine-v1',
    pickId: '00000000-0000-4000-8000-000000000001',
  });
  assert.equal(first.evidenceStatus, 'READY');
  assert.equal(first.manifestHash, same.manifestHash);
  assert.notEqual(
    first.manifestHash,
    evidence.buildRecommendationEvidenceManifest({
      pickId: '00000000-0000-4000-8000-000000000001', engineId: 'engine-v1', promptId: 'prompt-v2', strategyId: 'strategy-v1', calculation, marketRegime: 'GREEN',
    }).manifestHash,
  );

  const incomplete = evidence.buildRecommendationEvidenceManifest({
    pickId: '00000000-0000-4000-8000-000000000001',
    engineId: 'engine-v1',
    promptId: null,
    strategyId: 'strategy-v1',
    calculation,
    marketRegime: null,
  });
  assert.equal(incomplete.evidenceStatus, 'INCOMPLETE');
  assert.deepEqual(incomplete.missingFields.sort(), ['marketRegime', 'promptId']);
}

{
  const base = {
    pickId: '00000000-0000-4000-8000-000000000002',
    generatedAt: '2026-07-02T21:00:00Z',
    market: 'US',
    security: longSeries(),
    benchmark: longSeries({ instrument: 'BENCH', source: 'official-benchmark' }),
  };
  const d5 = evidence.buildRecommendationPriceEvidence({ ...base, horizon: 'D5' });
  assert.equal(d5.result.status, 'MATURED');
  assert.equal(d5.result.entryDate, '2026-07-03');
  assert.equal(d5.result.evaluationDate, '2026-07-08');
  assert.deepEqual(d5.dataManifest.dataPayload.security.bars.map((bar) => bar.date), [
    '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08',
  ]);
  assert.deepEqual(d5.dataManifest.dataPayload.benchmark.bars.map((bar) => bar.date), [
    '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08',
  ]);

  const outsideRevision = evidence.buildRecommendationPriceEvidence({
    ...base,
    horizon: 'D5',
    security: longSeries({ revised: { 1: 999, 10: 888 } }),
  });
  assert.equal(
    d5.dataManifest.dataManifestId,
    outsideRevision.dataManifest.dataManifestId,
    'pre-entry and post-evaluation revisions must not change the calculation payload',
  );

  const d20 = evidence.buildRecommendationPriceEvidence({ ...base, horizon: 'D20' });
  assert.equal(d20.result.status, 'PENDING');
  assert.equal(d20.dataManifest.evidenceTier, 'INCOMPLETE');
  assert.notEqual(d5.dataManifest.dataManifestId, d20.dataManifest.dataManifestId, 'horizons need independent payload identities');
  assert.deepEqual(
    evidence.replayRecommendationPriceEvidence(d20.dataManifest.dataPayload, d20.dataManifest.dataManifestId),
    d20.result,
  );

  const live = evidence.buildRecommendationPriceEvidence({ ...base, horizon: 'LIVE' });
  assert.equal(live.result.status, 'MATURED');
  assert.equal(live.dataManifest.evidenceTier, 'INCOMPLETE', 'LIVE evidence is never promotion-ready');
  const liveManifest = evidence.buildRecommendationEvidenceManifest({
    pickId: base.pickId,
    engineId: 'engine-v1',
    promptId: 'prompt-v1',
    calculation: live,
    marketRegime: 'GREEN',
  });
  assert.equal(liveManifest.evidenceStatus, 'INCOMPLETE');
  assert.ok(liveManifest.missingFields.includes('maturedHorizon'));

  const sourceBars = longSeries();
  const frozen = evidence.buildRecommendationPriceEvidence({ ...base, horizon: 'D5', security: sourceBars });
  const originalResult = structuredClone(frozen.result);
  sourceBars.bars[3].close = 1;
  assert.deepEqual(
    evidence.replayRecommendationPriceEvidence(
      frozen.dataManifest.dataPayload,
      frozen.dataManifest.dataManifestId,
    ),
    originalResult,
    'stored exact bars must replay the original calculation after provider revisions',
  );
  const tampered = structuredClone(frozen.dataManifest.dataPayload);
  tampered.security.bars[0].close += 1;
  assert.throws(
    () => evidence.replayRecommendationPriceEvidence(tampered, frozen.dataManifest.dataManifestId),
    /payload hash/i,
  );

  const missingBenchmarkEntry = evidence.buildRecommendationPriceEvidence({
    ...base,
    generatedAt: '2026-06-30T12:00:00Z',
    horizon: 'D5',
    benchmark: {
      ...base.benchmark,
      bars: base.benchmark.bars.filter((bar) => bar.date !== '2026-07-01'),
    },
  });
  assert.equal(missingBenchmarkEntry.result.status, 'EXCLUDED');
  assert.equal(missingBenchmarkEntry.dataManifest.evidenceTier, 'INCOMPLETE');
  assert.deepEqual(
    evidence.replayRecommendationPriceEvidence(
      missingBenchmarkEntry.dataManifest.dataPayload,
      missingBenchmarkEntry.dataManifest.dataManifestId,
    ),
    missingBenchmarkEntry.result,
    'fail-closed excluded calculations must still retain a replayable minimal slice',
  );
}

{
  const result = evidence.calculateNetRecommendationPerformance({
    market: 'US',
    grossReturnPct: 10,
    benchmarkReturnPct: 4,
  });
  assert.equal(result.costEvidenceStatus, 'STANDARDIZED_MODEL');
  assert.equal(result.accountEvidenceStatus, 'NOT_AVAILABLE');
  assert.equal(result.accountActualReturnPct, null, 'missing account evidence must not be estimated');
  assert.ok(result.netReturnPct < 10);
  assert.ok(result.netExcessReturnPct < 6);
  assert.ok(result.totalCostPct > 0);
  assert.ok(result.commissionCostPct >= 0);
  assert.ok(result.taxCostPct >= 0);
  assert.ok(result.slippageCostPct >= 0);
  assert.ok(result.fxCostPct >= 0);
  assert.equal(
    Number((result.netReturnPct - result.benchmarkReturnPct).toFixed(6)),
    result.netExcessReturnPct,
    'cost-adjusted alpha uses a frictionless benchmark for conservative comparison',
  );
}

{
  const missing = evidence.calculateNetRecommendationPerformance({
    market: 'KR',
    grossReturnPct: null,
    benchmarkReturnPct: 1,
  });
  assert.equal(missing.costEvidenceStatus, 'MISSING');
  assert.equal(missing.netReturnPct, null);
  assert.equal(missing.netExcessReturnPct, null);
}

console.log('recommendation evidence performance tests passed');
