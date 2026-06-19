import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/contest-cron';
import { readRecommendationDiagnostics, readRecommendationMetrics } from '@/lib/recommendations/read';
import { formatRecommendationWeeklyReport } from '@/lib/recommendations/weekly-report';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { sendTelegramMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  try {
    const client = getSupabaseAdmin();
    const markets = [];
    for (const market of ['US', 'KR'] as const) {
      const [metrics, diagnostics] = await Promise.all([
        readRecommendationMetrics({ client, market }),
        readRecommendationDiagnostics({ client, market }),
      ]);
      markets.push({ market, horizons: metrics.horizons, causes: diagnostics.causeSummary });
    }
    const origin = process.env.NEXT_PUBLIC_APP_URL || null;
    const message = formatRecommendationWeeklyReport({
      generatedAt: new Date().toISOString(),
      markets,
      dashboardUrl: origin ? `${origin.replace(/\/$/, '')}/recommendations?view=diagnostics` : null,
    });
    const delivery = await sendTelegramMessage(message);
    return apiSuccess({ markets, delivery }, { source: 'MTN weekly recommendation review', provider: 'Rules/Statistics', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Recommendation weekly report failed.'), 'API_ERROR', 500);
  }
}
