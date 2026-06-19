import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { readRecommendationDiagnostics } from '@/lib/recommendations/read';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { RecommendationHorizon, RecommendationMarket } from '@/lib/recommendations/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const market = params.get('market')?.toUpperCase() || 'US';
  const horizon = params.get('horizon')?.toUpperCase() || null;
  if (market !== 'US' && market !== 'KR') return apiError('market must be US or KR.', 'INVALID_MARKET', 400);
  if (horizon && !['LIVE', 'D5', 'D20', 'D60'].includes(horizon)) return apiError('Invalid horizon.', 'INVALID_HORIZON', 400);
  try {
    const result = await readRecommendationDiagnostics({
      client: getSupabaseAdmin(),
      market: market as RecommendationMarket,
      horizon: horizon as RecommendationHorizon | null,
      cause: params.get('cause'),
      status: params.get('status'),
    });
    return apiSuccess(result, { source: 'MTN recommendation diagnostics', provider: 'Rules/Statistics', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Recommendation diagnostics query failed.'), 'API_ERROR', 500);
  }
}
