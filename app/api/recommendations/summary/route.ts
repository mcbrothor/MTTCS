import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { RECOMMENDATION_CATEGORIES, RECOMMENDATION_CATEGORY_MARKET } from '@/lib/recommendations/config';
import { readFrequentRecommendationPicks } from '@/lib/recommendations/read';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { RecommendationCategory, RecommendationMarket } from '@/lib/recommendations/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const categoryParam = params.get('category')?.toUpperCase() || null;
  if (categoryParam && !RECOMMENDATION_CATEGORIES.includes(categoryParam as RecommendationCategory)) {
    return apiError('category must be NASDAQ100, SP500, KOSPI200, or KOSDAQ150.', 'INVALID_CATEGORY', 400);
  }
  const category = categoryParam as RecommendationCategory | null;
  const market = category ? RECOMMENDATION_CATEGORY_MARKET[category] : (params.get('market')?.toUpperCase() || 'US');
  if (market !== 'US' && market !== 'KR') return apiError('market must be US or KR.', 'INVALID_MARKET', 400);

  try {
    const result = await readFrequentRecommendationPicks({
      client: getSupabaseAdmin(),
      market: market as RecommendationMarket,
      category,
    });
    return apiSuccess(result, { source: 'MTN official recommendations', provider: 'Supabase', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Recommendation summary query failed.'), 'API_ERROR', 500);
  }
}
