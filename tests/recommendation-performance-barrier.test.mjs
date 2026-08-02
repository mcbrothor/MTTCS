import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': new URL('..', import.meta.url).pathname },
});
const {
  RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS,
  finalizeRecommendationPerformanceBatchIfReady,
  recommendationPerformanceUtcBatchDate,
} = jiti('../lib/recommendations/performance-barrier.ts');

function rpcClient(responses) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      const response = responses.shift();
      if (response instanceof Error) return { data: null, error: response };
      return { data: response, error: null };
    },
  };
}

assert.equal(RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS, 4);
assert.equal(
  recommendationPerformanceUtcBatchDate(new Date('2026-08-02T23:59:59.999-07:00')),
  '2026-08-03',
  'batch identity must use the UTC calendar date',
);

{
  const client = rpcClient([{
    claimed: false,
    claim_status: 'BARRIER_WAITING',
    barrier_status: 'WAITING',
    successful_shards: 3,
    required_shards: 4,
    degraded_shards: [2],
    missing_shards: [],
  }]);
  let diagnostics = 0;
  let evidence = 0;

  const result = await finalizeRecommendationPerformanceBatchIfReady({
    client,
    batchDate: '2026-08-02',
    market: 'US',
    refreshDiagnostics: async () => { diagnostics += 1; return 1; },
    refreshEvidence: async () => { evidence += 1; return { evaluated: 1 }; },
  });

  assert.equal(result.finalized, false);
  assert.equal(result.barrierStatus, 'WAITING');
  assert.equal(diagnostics, 0, 'missing shards must block diagnostics refresh');
  assert.equal(evidence, 0, 'missing shards must block evidence refresh');
  assert.deepEqual(client.calls, [{
    name: 'claim_recommendation_performance_finalization',
    args: { p_batch_date: '2026-08-02', p_market: 'US' },
  }]);
}

{
  const client = rpcClient([{
    claimed: false,
    claim_status: 'BARRIER_DEGRADED',
    barrier_status: 'DEGRADED',
    successful_shards: 3,
    required_shards: 4,
    degraded_shards: [1],
    missing_shards: [],
  }]);
  let refreshes = 0;
  const result = await finalizeRecommendationPerformanceBatchIfReady({
    client,
    batchDate: '2026-08-02',
    market: 'KR',
    refreshDiagnostics: async () => { refreshes += 1; return 0; },
    refreshEvidence: async () => { refreshes += 1; return {}; },
  });

  assert.equal(result.finalized, false);
  assert.equal(result.barrierStatus, 'DEGRADED');
  assert.equal(refreshes, 0, 'degraded shards must fail closed');
}

{
  const claimToken = '11111111-1111-4111-8111-111111111111';
  const client = rpcClient([
    {
      claimed: true,
      claim_status: 'CLAIMED',
      claim_token: claimToken,
      barrier_status: 'READY',
      successful_shards: 4,
      required_shards: 4,
      degraded_shards: [],
      missing_shards: [],
    },
    { completed: true, finalization_status: 'SUCCESS' },
  ]);

  const result = await finalizeRecommendationPerformanceBatchIfReady({
    client,
    batchDate: '2026-08-02',
    market: 'US',
    refreshDiagnostics: async () => 7,
    refreshEvidence: async () => ({ evaluated: 9, groups: 3 }),
  });

  assert.equal(result.finalized, true);
  assert.equal(result.findings, 7);
  assert.deepEqual(result.evidence, { evaluated: 9, groups: 3 });
  assert.equal(client.calls[1].name, 'complete_recommendation_performance_finalization');
  assert.deepEqual(client.calls[1].args, {
    p_batch_date: '2026-08-02',
    p_market: 'US',
    p_claim_token: claimToken,
    p_success: true,
    p_error_message: null,
  });
}

{
  const claimToken = '22222222-2222-4222-8222-222222222222';
  const client = rpcClient([
    {
      claimed: true,
      claim_status: 'CLAIMED',
      claim_token: claimToken,
      barrier_status: 'READY',
      successful_shards: 4,
      required_shards: 4,
      degraded_shards: [],
      missing_shards: [],
    },
    { completed: true, finalization_status: 'FAILED' },
  ]);

  await assert.rejects(
    () => finalizeRecommendationPerformanceBatchIfReady({
      client,
      batchDate: '2026-08-02',
      market: 'KR',
      refreshDiagnostics: async () => { throw new Error('diagnostics unavailable'); },
      refreshEvidence: async () => ({}),
    }),
    /diagnostics unavailable/,
  );
  assert.equal(client.calls[1].name, 'complete_recommendation_performance_finalization');
  assert.equal(client.calls[1].args.p_success, false, 'failed finalization must be retryable');
  assert.match(client.calls[1].args.p_error_message, /diagnostics unavailable/);
}

console.log('Recommendation performance barrier tests passed');
