import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': new URL('..', import.meta.url).pathname },
});

const {
  RECOMMENDATION_PERFORMANCE_LEDGER_RESERVE_MS,
  RECOMMENDATION_PERFORMANCE_ROUTE_LIMIT_MS,
  RECOMMENDATION_PERFORMANCE_WORK_BUDGET_MS,
  RecommendationPerformanceDeadlineError,
  classifyRecommendationShardOutcome,
  createRecommendationPerformanceRuntime,
} = jiti('../lib/recommendations/performance-runtime.ts');

assert.equal(RECOMMENDATION_PERFORMANCE_ROUTE_LIMIT_MS, 270_000);
assert.ok(
  RECOMMENDATION_PERFORMANCE_WORK_BUDGET_MS
    + RECOMMENDATION_PERFORMANCE_LEDGER_RESERVE_MS
    <= RECOMMENDATION_PERFORMANCE_ROUTE_LIMIT_MS,
  'work must stop early enough to persist the shard and pipeline ledgers before Vercel terminates the route',
);
assert.ok(
  RECOMMENDATION_PERFORMANCE_LEDGER_RESERVE_MS >= 30_000,
  'the fail-closed ledger path needs a meaningful reserve under free-tier contention',
);

{
  let now = 10_000;
  let scheduled;
  let cleared = false;
  const runtime = createRecommendationPerformanceRuntime({
    budgetMs: 1_000,
    now: () => now,
    setTimer: (callback, delayMs) => {
      scheduled = { callback, delayMs };
      return 7;
    },
    clearTimer: (handle) => {
      assert.equal(handle, 7);
      cleared = true;
    },
  });

  assert.equal(scheduled.delayMs, 1_000);
  assert.equal(runtime.remainingMs(), 1_000);
  assert.equal(runtime.providerTimeoutMs(12_000), 1_000);
  assert.equal(runtime.signal.aborted, false);

  now = 11_001;
  assert.throws(
    () => runtime.throwIfExpired(),
    (error) => error instanceof RecommendationPerformanceDeadlineError,
  );
  assert.equal(runtime.signal.aborted, true, 'deadline must cancel in-flight provider work');
  assert.equal(runtime.deadlineReached(), true);

  runtime.dispose();
  assert.equal(cleared, true);
}

assert.equal(classifyRecommendationShardOutcome({
  deadlineReached: false,
  errorCount: 0,
  processedSecurities: 4,
  totalSecurities: 4,
}), 'SUCCESS');
assert.equal(classifyRecommendationShardOutcome({
  deadlineReached: true,
  errorCount: 1,
  processedSecurities: 3,
  totalSecurities: 4,
}), 'DEGRADED', 'a deadline-limited partial run must never be recorded as success');
assert.equal(classifyRecommendationShardOutcome({
  deadlineReached: false,
  errorCount: 0,
  processedSecurities: 3,
  totalSecurities: 4,
}), 'DEGRADED', 'unprocessed securities must fail closed even without an explicit timeout error');

{
  const {
    buildRecommendationEvidenceManifest,
    buildRecommendationPriceEvidence,
  } = jiti('../lib/recommendations/evidence-performance.ts');
  const { registerRecommendationEvidenceManifests } = jiti(
    '../lib/recommendations/evidence-repository.ts',
  );
  const series = (instrument) => ({
    instrument,
    source: 'test-provider',
    adjustmentType: 'PROVIDER_ADJUSTED',
    qualityStatus: 'FULL',
    bars: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      open: 100 + index,
      high: 102 + index,
      low: 99 + index,
      close: 101 + index,
      volume: 1_000,
      qualityStatus: 'FULL',
    })),
  });
  const manifests = [3, 4].map((suffix) => {
    const pickId = `00000000-0000-4000-8000-00000000000${suffix}`;
    const calculation = buildRecommendationPriceEvidence({
      pickId,
      generatedAt: '2026-06-30T12:00:00Z',
      market: 'US',
      horizon: 'D5',
      security: series(`TEST-${suffix}`),
      benchmark: series('BENCH'),
    });
    return buildRecommendationEvidenceManifest({
      pickId,
      engineId: 'engine-v1',
      promptId: 'prompt-v1',
      calculation,
      marketRegime: 'GREEN',
    });
  });
  const stored = new Map();
  let writes = 0;
  let reads = 0;
  const client = {
    from(table) {
      assert.equal(table, 'recommendation_evidence_manifests');
      return {
        upsert(rows, options) {
          writes += 1;
          assert.equal(options.onConflict, 'manifest_hash');
          assert.equal(options.ignoreDuplicates, true);
          for (const row of rows) {
            if (!stored.has(row.manifest_hash)) {
              stored.set(row.manifest_hash, `manifest-${stored.size + 1}`);
            }
          }
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            in(column, hashes) {
              reads += 1;
              assert.equal(column, 'manifest_hash');
              return Promise.resolve({
                data: hashes.map((manifestHash) => ({
                  id: stored.get(manifestHash),
                  manifest_hash: manifestHash,
                })),
                error: null,
              });
            },
          };
        },
      };
    },
  };
  const registered = await registerRecommendationEvidenceManifests(client, manifests);
  assert.equal(registered.size, 2);
  assert.equal(writes, 1, 'manifests for one security should share one write request');
  assert.equal(reads, 1, 'manifest identifiers should be resolved in one batch');
}

const jobs = readFileSync(new URL('../lib/recommendations/jobs.ts', import.meta.url), 'utf8');
const prices = readFileSync(new URL('../lib/recommendations/prices.ts', import.meta.url), 'utf8');
const kis = readFileSync(new URL('../lib/finance/providers/kis-api.ts', import.meta.url), 'utf8');
const yahoo = readFileSync(new URL('../lib/finance/providers/yahoo-api.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/cron/recommendation-performance/route.ts', import.meta.url), 'utf8');

assert.match(jobs, /createRecommendationPerformanceRuntime/);
assert.match(jobs, /remaining_securities/);
assert.match(jobs, /deadline_reached/);
assert.match(jobs, /classifyRecommendationShardOutcome/);
assert.match(jobs, /registerRecommendationEvidenceManifests/);
assert.match(jobs, /performanceRows/);
assert.match(jobs, /publicationUpdateGroups/);
assert.doesNotMatch(
  jobs,
  /for \(const horizon[\s\S]{0,5000}recommendation_performance'\)\.upsert/,
  'performance rows must be written in batches, not with one HTTP round trip per pick and horizon',
);
assert.match(prices, /signal\??:\s*AbortSignal/);
assert.match(prices, /timeoutMs\??:\s*number/);
assert.match(kis, /timeout:/, 'KIS HTTP calls need an explicit transport timeout');
assert.match(kis, /signal:/, 'KIS HTTP calls need cancellation propagation');
assert.match(yahoo, /timeout:/, 'Yahoo HTTP calls need an explicit transport timeout');
assert.match(yahoo, /signal:/, 'Yahoo HTTP calls need cancellation propagation');
assert.match(route, /RECOMMENDATION_PERFORMANCE_DEGRADED/);
assert.match(route, /503/, 'a DEGRADED shard must not be disguised as an HTTP success');

process.env.NEXT_PHASE = 'phase-production-build';
process.env.KIS_APP_KEY = 'runtime-test-app-key';
process.env.KIS_APP_SECRET = 'runtime-test-app-secret';
process.env.KIS_BASE_URL = 'https://openapi.koreainvestment.com:9443';
process.env.KIS_DISTRIBUTED_RATE_LIMIT_ENABLED = 'false';
process.env.KIS_REQUEST_INTERVAL_MS = '10000';
const { reserveKisRequestSlot, waitForKisRequestSlot } = jiti(
  '../lib/finance/providers/kis-rate-limit.ts',
);
await reserveKisRequestSlot('rest');
const limiterAbort = new AbortController();
const limiterWait = waitForKisRequestSlot('rest', { signal: limiterAbort.signal });
limiterAbort.abort(new Error('shard deadline'));
await assert.rejects(limiterWait, /shard deadline/);

console.log('Recommendation performance runtime tests passed');
