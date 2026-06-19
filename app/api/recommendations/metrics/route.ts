import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { readRecommendationMetrics } from '@/lib/recommendations/read';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { RecommendationMarket } from '@/lib/recommendations/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = params.get('market')?.toUpperCase() || 'US';
  if (market !== 'US' && market !== 'KR') return apiError('market must be US or KR.', 'INVALID_MARKET', 400);
  try {
    const result = await readRecommendationMetrics({
      client: getSupabaseAdmin(),
      market: market as RecommendationMarket,
      from: params.get('from'),
      to: params.get('to'),
    });
    return apiSuccess(result, { source: 'MTN recommendation metrics', provider: 'Supabase', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Recommendation metrics query failed.'), 'API_ERROR', 500);
  }
}
