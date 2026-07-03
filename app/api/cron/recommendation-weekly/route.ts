import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/contest-cron';
import { readRecommendationDiagnostics, readRecommendationMetrics } from '@/lib/recommendations/read';
import { formatRecommendationWeeklyReport } from '@/lib/recommendations/weekly-report';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { sendTelegramMessage } from '@/lib/telegram';
import {
  KR_RISK_ENGINE_VERSION,
  KR_RISK_FLOW_ENGINE_VERSION,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_CATEGORY_MARKET,
  RECOMMENDATION_ENGINE_VERSION,
} from '@/lib/recommendations/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  try {
    const client = getSupabaseAdmin();
    const categories = [];
    for (const category of RECOMMENDATION_CATEGORIES) {
      const market = RECOMMENDATION_CATEGORY_MARKET[category];
      const [metrics, diagnostics, ...policyMetrics] = await Promise.all([
        readRecommendationMetrics({ client, market, category }),
        readRecommendationDiagnostics({ client, market, category }),
        ...(market === 'KR' ? [RECOMMENDATION_ENGINE_VERSION, KR_RISK_ENGINE_VERSION, KR_RISK_FLOW_ENGINE_VERSION]
          .map((engineVersion) => readRecommendationMetrics({ client, market, category, engineVersion })) : []),
      ]);
      categories.push({
        category,
        market,
        horizons: metrics.horizons,
        causes: diagnostics.causeSummary,
        policies: policyMetrics.map((policy) => ({
          engineVersion: policy.engineVersion as string,
          d5: policy.horizons.find((row) => row.horizon === 'D5') || null,
        })),
      });
    }
    const origin = process.env.NEXT_PUBLIC_APP_URL || null;
    const message = formatRecommendationWeeklyReport({
      generatedAt: new Date().toISOString(),
      categories,
      dashboardUrl: origin ? `${origin.replace(/\/$/, '')}/recommendations?view=diagnostics` : null,
    });
    const delivery = await sendTelegramMessage(message);
    return apiSuccess({ categories, delivery }, { source: 'MTN weekly recommendation review', provider: 'Rules/Statistics', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Recommendation weekly report failed.'), 'API_ERROR', 500);
  }
}
