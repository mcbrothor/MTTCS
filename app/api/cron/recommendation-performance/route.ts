import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/contest-cron';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { runRecommendationPerformanceBatch } from '@/lib/recommendations/jobs';
import type { RecommendationMarket } from '@/lib/recommendations/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  const params = new URL(request.url).searchParams;
  const market = params.get('market')?.toUpperCase();
  if (market !== 'US' && market !== 'KR') return apiError('market must be US or KR.', 'INVALID_MARKET', 400);
  const shards = Math.max(1, Math.min(16, Number(params.get('shards') || 1)));
  const shard = Math.max(0, Math.min(shards - 1, Number(params.get('shard') || 0)));
  try {
    const result = await runRecommendationPerformanceBatch({
      client: getSupabaseAdmin(),
      market: market as RecommendationMarket,
      shard,
      shards,
    });
    return apiSuccess(result, { source: 'MTN recommendation performance', provider: 'KIS/Yahoo', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Recommendation performance refresh failed.'), 'API_ERROR', 500);
  }
}
