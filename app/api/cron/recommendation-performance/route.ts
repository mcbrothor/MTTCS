import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/contest-cron';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { runRecommendationPerformanceBatch } from '@/lib/recommendations/jobs';
import {
  RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS,
  recommendationPerformanceUtcBatchDate,
} from '@/lib/recommendations/performance-barrier';
import type { RecommendationMarket } from '@/lib/recommendations/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 270;

function parseBatchDate(value: string | null) {
  if (!value) return recommendationPerformanceUtcBatchDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  const params = new URL(request.url).searchParams;
  const market = params.get('market')?.toUpperCase();
  if (market !== 'US' && market !== 'KR') return apiError('market must be US or KR.', 'INVALID_MARKET', 400);
  const shards = Number(params.get('shards') || RECOMMENDATION_PERFORMANCE_REQUIRED_SHARDS);
  const shard = Number(params.get('shard') || 0);
  const batchDate = parseBatchDate(params.get('batchDate'));
  if (shards !== 4) return apiError('shards must be exactly 4.', 'INVALID_SHARD_COUNT', 400);
  if (!Number.isInteger(shard) || shard < 0 || shard >= shards) {
    return apiError('shard must be an integer from 0 to 3.', 'INVALID_SHARD', 400);
  }
  if (!batchDate) return apiError('batchDate must be a valid UTC date (YYYY-MM-DD).', 'INVALID_BATCH_DATE', 400);
  try {
    const result = await runRecommendationPerformanceBatch({
      client: getSupabaseAdmin(),
      market: market as RecommendationMarket,
      shard,
      shards,
      batchDate,
    });
    if (!result.skipped && result.shardStatus === 'DEGRADED') {
      return apiError(
        result.deadlineReached
          ? 'Recommendation performance shard stopped at its safe work deadline.'
          : 'Recommendation performance shard completed with data-source failures.',
        'RECOMMENDATION_PERFORMANCE_DEGRADED',
        503,
        result,
      );
    }
    return apiSuccess(result, { source: 'MTN recommendation performance', provider: 'KIS/Yahoo', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Recommendation performance refresh failed.'), 'API_ERROR', 500);
  }
}
