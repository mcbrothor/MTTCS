import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

process.env.NEXT_PHASE = 'phase-production-build';
delete process.env.KIS_APP_KEY;
delete process.env.KIS_APP_SECRET;
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const axios = jiti('axios');
const originalNow = Date.now;
const originalFetch = globalThis.fetch;
const originalAdapter = axios.defaults.adapter;
let clock = Date.parse('2026-09-23T09:00:00Z');
Date.now = () => clock;
globalThis.fetch = async (url) => {
  if (/\/rest\/v1\/(api_cache|api_token_cache)/.test(String(url))) return Response.json({ message: 'No test cache' }, { status: 404 });
  assert.ok(String(url).includes('yahoo.com'), `Unexpected external request ${url}`);
  return new Response('test-crumb', { headers: { 'set-cookie': 'test=1' } });
};
const chart = { chart: { result: [{
  timestamp: [Date.parse('2026-09-21T00:00:00Z'), Date.parse('2026-09-22T00:00:00Z')].map((value) => value / 1000),
  indicators: { quote: [{ open: [100, 101], high: [102, 103], low: [99, 100], close: [101, 102], volume: [1000, 1000] }] },
}] } };
const calls = [];
axios.defaults.adapter = async (config) => {
  assert.ok(config.url.includes('/finance/chart/'));
  const ticker = config.url.split('/').at(-1);
  if (ticker.startsWith('TEST')) {
    calls.push(ticker);
    clock += 120_000;
  }
  return { status: 200, statusText: 'OK', headers: {}, config, data: chart };
};
const { runRecommendationPerformanceBatch } = jiti('../lib/recommendations/jobs.ts');
function hash(value) {
  let result = 0;
  for (const char of value) result = ((result << 5) - result + char.charCodeAt(0)) | 0;
  return Math.abs(result);
}
const tickers = Array.from({ length: 30 }, (_, index) => `TEST${index}`).filter((ticker) => hash(`NAS:${ticker}`) % 4 === 0).slice(0, 3);
let picks = tickers.map((ticker, index) => ({
  id: `pick-${index}`, publication_id: `publication-${index}`, ticker, exchange: 'NAS', source: 'test', sector: null,
  rank: 1, confidence: 0.9, benchmark_symbol: '^NDX', signal_price: 100, action_state: 'ACTIVE',
  recommendation_publications: { run_date: '2026-09-21', market: 'US', category: 'NASDAQ100', generated_at: '2026-09-20T12:00:00Z', engine_version: 'test', prompt_version: null, market_context: {}, is_official: true },
}));
let metadata = {};
let attempt = 0;
let completionStatus;
let finalizationClaims = 0;
let failCheckpointRead = false;
let failPickRead = false;
let failPerformanceWrite = false;
let completionCalls = 0;
const manifests = new Map();
const performance = new Map();
function request(execute) {
  const filters = {};
  const builder = {
    select() { return builder; },
    eq(key, value) { filters[key] = value; return builder; },
    in(key, value) { filters[key] = value; return builder; },
    gte() { return builder; }, order() { return builder; }, range() { return builder; },
    abortSignal() { return builder; }, maybeSingle() { return builder; },
    then(resolve, reject) { return Promise.resolve().then(() => execute(filters)).then(resolve, reject); },
  };
  return builder;
}
const client = {
  rpc(name, input) {
    return request(() => {
      if (name === 'claim_recommendation_performance_shard') {
        attempt += 1;
        return { data: { claimed: true, claim_status: 'CLAIMED', claim_token: `claim-${attempt}`, attempt_count: attempt, barrier_status: 'WAITING' }, error: null };
      }
      if (name === 'complete_recommendation_performance_shard') {
        completionCalls += 1;
        assert.equal(input.p_claim_token, `claim-${attempt}`);
        metadata = structuredClone(input.p_metadata);
        completionStatus = input.p_status;
        return { data: { completed: true, barrier_status: input.p_status === 'SUCCESS' ? 'READY' : 'DEGRADED', successful_shards: input.p_status === 'SUCCESS' ? 1 : 0, required_shards: 4 }, error: null };
      }
      if (name === 'claim_recommendation_performance_finalization') {
        finalizationClaims += 1;
        return { data: { claimed: false, claim_status: 'BARRIER_WAITING', barrier_status: 'WAITING', required_shards: 4 }, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });
  },
  from(table) {
    if (table === 'recommendation_picks') return request(() => ({ data: picks, error: failPickRead ? new Error('pick read failed') : null }));
    if (table === 'recommendation_performance_batch_shards') return request((filters) => {
      assert.equal(filters.batch_date, '2026-09-23');
      assert.equal(filters.market, 'US');
      assert.equal(filters.shard, 0);
      assert.equal(filters.claim_token, `claim-${attempt}`);
      return { data: { run_metadata: structuredClone(metadata) }, error: failCheckpointRead ? new Error('checkpoint read failed') : null };
    });
    if (table === 'recommendation_market_prices') return { upsert: () => request(() => ({ error: null })) };
    if (table === 'recommendation_evidence_manifests') return {
      upsert(rows) { return request(() => { for (const row of rows) manifests.set(row.manifest_hash, `manifest-${manifests.size}`); return { error: null }; }); },
      select() { return request((filters) => ({ data: filters.manifest_hash.map((key) => ({ manifest_hash: key, id: manifests.get(key) })), error: null })); },
    };
    if (table === 'recommendation_performance') return { upsert(rows) { return request(() => {
      for (const row of (failPerformanceWrite ? rows.slice(0, 2) : rows)) performance.set(`${row.pick_id}:${row.horizon}`, row);
      return { error: failPerformanceWrite ? new Error('partial horizon write failed') : null };
    }); } };
    if (table === 'recommendation_publications') return { update: () => request(() => ({ error: null })) };
    if (table === 'data_pipeline_runs') return { insert: () => request(() => ({ error: null })) };
    throw new Error(`Unexpected table ${table}`);
  },
};
const input = { client, market: 'US', shard: 0, shards: 4, batchDate: '2026-09-23' };
try {
  const first = await runRecommendationPerformanceBatch(input);
  assert.equal(first.processedSecurities, 1);
  assert.equal(first.shardStatus, 'DEGRADED');
  assert.equal(finalizationClaims, 0);
  const second = await runRecommendationPerformanceBatch(input);
  assert.equal(second.processedSecurities, 2, 'retry must retain prior completed security instead of restarting the same prefix');
  assert.equal(second.remainingSecurities, 1);
  const third = await runRecommendationPerformanceBatch(input);
  assert.equal(third.shardStatus, 'SUCCESS');
  assert.equal(third.processedSecurities, 3);
  assert.equal(third.updated, 12, 'batch totals must include durable work from earlier attempts without double counting');
  assert.equal(performance.size, 12);
  assert.equal(completionStatus, 'SUCCESS');
  assert.equal(finalizationClaims, 1);
  assert.equal(calls.filter((ticker) => ticker === tickers[0]).length, 1, 'completed prefix must never be fetched again');
  // Changed input in the same batch cannot reuse a completed checkpoint.
  picks = picks.map((pick, index) => index === 0 ? { ...pick, benchmark_symbol: '^GSPC' } : pick);
  const changed = await runRecommendationPerformanceBatch(input);
  assert.equal(changed.attemptedSecurities, 1);
  assert.equal(calls.filter((ticker) => ticker === tickers[0]).length, 2);
  const savedMetadata = structuredClone(metadata);
  failPickRead = true;
  await assert.rejects(runRecommendationPerformanceBatch(input), /pick read failed/);
  assert.deepEqual(metadata, savedMetadata, 'input query failure must preserve existing completion checkpoints');
  failPickRead = false;
  failCheckpointRead = true;
  const beforeReadFailure = completionCalls;
  await assert.rejects(runRecommendationPerformanceBatch(input), /checkpoint read failed/);
  assert.equal(completionCalls, beforeReadFailure, 'unreadable checkpoint must leave claim for stale recovery without erasing progress');
  assert.deepEqual(metadata, savedMetadata);
  failCheckpointRead = false;
  metadata = { ...savedMetadata, batch_date: '2026-09-22' };
  failPerformanceWrite = true;
  const partial = await runRecommendationPerformanceBatch(input);
  assert.equal(partial.processedSecurities, 0, 'other-batch checkpoints and partially saved horizons cannot count as completed');
  assert.equal(partial.shardStatus, 'DEGRADED');
  assert.deepEqual(metadata.completed_securities, {});
  failPerformanceWrite = false;
  const retriedPartial = await runRecommendationPerformanceBatch(input);
  assert.equal(retriedPartial.processedSecurities, 1, 'failed security must be recomputed fully on retry');
  console.log('recommendation performance resume tests passed');
} finally {
  Date.now = originalNow;
  globalThis.fetch = originalFetch;
  axios.defaults.adapter = originalAdapter;
}
