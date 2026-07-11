import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { RECOMMENDATION_CATEGORIES, RECOMMENDATION_CATEGORY_MARKET } from '@/lib/recommendations/config';
import { readRecommendationPublications } from '@/lib/recommendations/read';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { RecommendationCategory, RecommendationMarket } from '@/lib/recommendations/types';

export const dynamic = 'force-dynamic';

function validDate(value: string | null) {
  return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  const params = new URL(request.url).searchParams;
  const categoryParam = params.get('category')?.toUpperCase() || null;
  if (categoryParam && !RECOMMENDATION_CATEGORIES.includes(categoryParam as RecommendationCategory)) {
    return apiError('category must be NASDAQ100, SP500, KOSPI200, or KOSDAQ150.', 'INVALID_CATEGORY', 400);
  }
  const category = categoryParam as RecommendationCategory | null;
  const market = category ? RECOMMENDATION_CATEGORY_MARKET[category] : (params.get('market')?.toUpperCase() || 'US');
  if (market !== 'US' && market !== 'KR') return apiError('market must be US or KR.', 'INVALID_MARKET', 400);
  const from = params.get('from');
  const to = params.get('to');
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) {
    return apiError('from and to must be valid YYYY-MM-DD values in ascending order.', 'INVALID_DATE_RANGE', 400);
  }
  try {
    const result = await readRecommendationPublications({
      client: getSupabaseAdmin(),
      market: market as RecommendationMarket,
      category,
      from,
      to,
      cursor: params.get('cursor'),
      limit: Number(params.get('limit') || 20),
    });
    return apiSuccess(result, { source: 'MTN official recommendations', provider: 'Supabase', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Recommendation history query failed.'), 'API_ERROR', 500);
  }
}
