import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecommendationMarket } from './types';

export const RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS = 4;

type RpcClient = Pick<SupabaseClient, 'rpc'>;

interface BarrierClaimPayload {
  claimed: boolean;
  claim_status: string;
  claim_token?: string | null;
  barrier_status: string;
  successful_shards: number;
  required_shards: number;
  degraded_shards: number[];
  missing_shards: number[];
}

export interface RecommendationPerformanceBarrierState {
  claimed: boolean;
  claimStatus: string;
  claimToken: string | null;
  barrierStatus: string;
  successfulShards: number;
  requiredShards: number;
  degradedShards: number[];
  missingShards: number[];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown recommendation performance barrier error');
}

function requireRpcPayload(data: unknown, operation: string) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${operation} returned an invalid barrier payload.`);
  }
  return data as Record<string, unknown>;
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item)).map(Number)
    : [];
}

function normalizeBarrierClaim(data: unknown, operation: string): RecommendationPerformanceBarrierState {
  const payload = requireRpcPayload(data, operation) as unknown as BarrierClaimPayload;
  return {
    claimed: payload.claimed === true,
    claimStatus: String(payload.claim_status || 'UNKNOWN'),
    claimToken: typeof payload.claim_token === 'string' ? payload.claim_token : null,
    barrierStatus: String(payload.barrier_status || 'UNKNOWN'),
    successfulShards: Number(payload.successful_shards || 0),
    requiredShards: Number(payload.required_shards || RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS),
    degradedShards: numberArray(payload.degraded_shards),
    missingShards: numberArray(payload.missing_shards),
  };
}

export function recommendationPerformanceUtcBatchDate(now = new Date()) {
  if (Number.isNaN(now.getTime())) throw new Error('A valid UTC batch timestamp is required.');
  return now.toISOString().slice(0, 10);
}

export async function claimRecommendationPerformanceShard(input: {
  client: RpcClient;
  batchDate: string;
  market: RecommendationMarket;
  shard: number;
  signal?: AbortSignal;
}) {
  const request = input.client.rpc('claim_recommendation_performance_shard', {
    p_batch_date: input.batchDate,
    p_market: input.market,
    p_shard: input.shard,
    p_shards: RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS,
  });
  const { data, error } = await (
    input.signal && 'abortSignal' in request
      ? request.abortSignal(input.signal)
      : request
  );
  if (error) throw error;
  const payload = requireRpcPayload(data, 'Shard claim');
  return {
    claimed: payload.claimed === true,
    claimStatus: String(payload.claim_status || 'UNKNOWN'),
    claimToken: typeof payload.claim_token === 'string' ? payload.claim_token : null,
    shardStatus: String(payload.shard_status || 'UNKNOWN'),
    attemptCount: Number(payload.attempt_count || 0),
    barrierStatus: String(payload.barrier_status || 'WAITING'),
  };
}

export async function completeRecommendationPerformanceShard(input: {
  client: RpcClient;
  batchDate: string;
  market: RecommendationMarket;
  shard: number;
  claimToken: string;
  status: 'SUCCESS' | 'DEGRADED' | 'FAILED';
  metadata: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  const { data, error } = await input.client.rpc('complete_recommendation_performance_shard', {
    p_batch_date: input.batchDate,
    p_market: input.market,
    p_shard: input.shard,
    p_claim_token: input.claimToken,
    p_status: input.status,
    p_metadata: input.metadata,
    p_error_message: input.errorMessage || null,
  });
  if (error) throw error;
  return requireRpcPayload(data, 'Shard completion');
}

async function claimRecommendationPerformanceFinalization(input: {
  client: RpcClient;
  batchDate: string;
  market: RecommendationMarket;
  signal?: AbortSignal;
}) {
  const request = input.client.rpc('claim_recommendation_performance_finalization', {
    p_batch_date: input.batchDate,
    p_market: input.market,
  });
  const { data, error } = await (
    input.signal && 'abortSignal' in request
      ? request.abortSignal(input.signal)
      : request
  );
  if (error) throw error;
  return normalizeBarrierClaim(data, 'Finalization claim');
}

async function completeRecommendationPerformanceFinalization(input: {
  client: RpcClient;
  batchDate: string;
  market: RecommendationMarket;
  claimToken: string;
  success: boolean;
  errorMessage?: string | null;
}) {
  const { data, error } = await input.client.rpc('complete_recommendation_performance_finalization', {
    p_batch_date: input.batchDate,
    p_market: input.market,
    p_claim_token: input.claimToken,
    p_success: input.success,
    p_error_message: input.errorMessage || null,
  });
  if (error) throw error;
  return requireRpcPayload(data, 'Finalization completion');
}

export async function finalizeRecommendationPerformanceBatchIfReady<TEvidence>(input: {
  client: RpcClient;
  batchDate: string;
  market: RecommendationMarket;
  signal?: AbortSignal;
  refreshDiagnostics: () => Promise<number>;
  refreshEvidence: () => Promise<TEvidence>;
}) {
  const barrier = await claimRecommendationPerformanceFinalization(input);
  if (!barrier.claimed) {
    return {
      finalized: barrier.claimStatus === 'ALREADY_SUCCESS',
      findings: 0,
      evidence: null as TEvidence | null,
      ...barrier,
    };
  }
  if (!barrier.claimToken) throw new Error('Finalization claim did not return a claim token.');

  try {
    const findings = await input.refreshDiagnostics();
    const evidence = await input.refreshEvidence();
    await completeRecommendationPerformanceFinalization({
      ...input,
      claimToken: barrier.claimToken,
      success: true,
      errorMessage: null,
    });
    return { finalized: true, findings, evidence, ...barrier };
  } catch (error) {
    await completeRecommendationPerformanceFinalization({
      ...input,
      claimToken: barrier.claimToken,
      success: false,
      errorMessage: errorMessage(error),
    });
    throw error;
  }
}
