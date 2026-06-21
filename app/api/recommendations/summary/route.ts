import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { readFrequentRecommendationPicks } from '@/lib/recommendations/read';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { RecommendationMarket } from '@/lib/recommendations/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const market = new URL(request.url).searchParams.get('market')?.toUpperCase() || 'US';
  if (market !== 'US' && market !== 'KR') return apiError('market must be US or KR.', 'INVALID_MARKET', 400);

  try {
    const result = await readFrequentRecommendationPicks({
      client: getSupabaseAdmin(),
      market: market as RecommendationMarket,
    });
    return apiSuccess(result, { source: 'MTN official recommendations', provider: 'Supabase', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Recommendation summary query failed.'), 'API_ERROR', 500);
  }
}
