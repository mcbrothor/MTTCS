import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/auth/cron';
import {
  runMarketIntelligenceIngestion,
  type IntelligenceIngestionMode,
} from '@/lib/intelligence/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODES = new Set<IntelligenceIngestionMode>(['feeds', 'indicators', 'all']);

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  const params = new URL(request.url).searchParams;
  const mode = (params.get('mode') || 'all') as IntelligenceIngestionMode;
  if (!MODES.has(mode)) return apiError('mode must be feeds, indicators, or all.', 'INVALID_MODE', 400);

  try {
    const result = await runMarketIntelligenceIngestion({
      mode,
      dryRun: params.get('dryRun') === 'true',
    });
    if (result.status === 'FAILED') {
      return apiError('All market intelligence sources failed.', 'INTELLIGENCE_INGESTION_FAILED', 502, result);
    }
    return apiSuccess(result, {
      source: 'Official market intelligence sources',
      provider: result.sourceResults.map((source) => source.source).join('+'),
      delay: 'REALTIME',
      observedAt: new Date().toISOString(),
      expectedDelaySeconds: mode === 'feeds' ? 45 * 60 : 26 * 60 * 60,
      fallbackUsed: result.status === 'DEGRADED',
      fallbackReason: result.status === 'DEGRADED' ? '일부 원천 수집 실패' : null,
    });
  } catch (error) {
    return apiError(getErrorMessage(error, '시장 인텔리전스 수집 실패'), 'INTELLIGENCE_INGESTION_FAILED', 500);
  }
}
