import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/auth/cron';
import { SYSTEM_ADMIN_ID } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { isStrategyDataUnavailableError, runMonthlyStrategy } from '@/lib/strategy/monthly/run';
import type { MonthlyMarket } from '@/lib/strategy/monthly/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 240;

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  const market = new URL(request.url).searchParams.get('market')?.toUpperCase();
  if (market !== 'KR' && market !== 'US') {
    return apiError('market must be KR or US.', 'INVALID_MARKET', 400);
  }
  try {
    const result = await runMonthlyStrategy({
      client: getSupabaseAdmin(),
      ownerId: SYSTEM_ADMIN_ID,
      market: market as MonthlyMarket,
      strictPersistence: true,
    });
    if (result.snapshot.status !== 'FINAL' || result.snapshot.quality.status !== 'FULL' || !result.inputHash) {
      return apiError(
        `Monthly ${market} snapshot was not persisted because the signal is incomplete.`,
        'MONTHLY_STRATEGY_INCOMPLETE',
        503,
        { status: result.snapshot.status, quality: result.snapshot.quality },
      );
    }
    return apiSuccess(
      {
        market,
        modelVersion: result.snapshot.modelVersion,
        signalAt: result.snapshot.signalAt,
        effectiveAt: result.snapshot.effectiveAt,
        inputHash: result.inputHash,
      },
      {
        source: result.source,
        provider: result.provider,
        delay: 'EOD',
        observedAt: result.snapshot.latestObservationAt ?? undefined,
        modelVersion: result.snapshot.modelVersion,
        warnings: result.snapshot.quality.warnings.slice(0, 20),
      },
    );
  } catch (error) {
    return apiError(
      getErrorMessage(error, `${market} 월간 전략 자동 저장 실패`),
      isStrategyDataUnavailableError(error) ? 'STRATEGY_DATA_UNAVAILABLE' : 'MONTHLY_STRATEGY_CRON_FAILED',
      isStrategyDataUnavailableError(error) ? 503 : 500,
    );
  }
}
