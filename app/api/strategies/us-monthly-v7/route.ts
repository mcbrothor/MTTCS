import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { toMonthlyStrategyApi } from '@/lib/strategy/monthly/api-contract';
import { isStrategyDataUnavailableError, runMonthlyStrategy } from '@/lib/strategy/monthly/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  try {
    const { snapshot, holdings, inputHash, provider, source } = await runMonthlyStrategy({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
      market: 'US',
    });
    return apiSuccess(
      { ...toMonthlyStrategyApi(snapshot), holdings, inputHash },
      {
        source,
        provider,
        delay: 'EOD',
        observedAt: snapshot.latestObservationAt ?? undefined,
        calculatedAt: new Date().toISOString(),
        modelVersion: snapshot.modelVersion,
        warnings: snapshot.quality.warnings.slice(0, 20),
      },
    );
  } catch (error) {
    return apiError(
      getErrorMessage(error, 'US 월간 전략 계산 실패'),
      isStrategyDataUnavailableError(error) ? 'STRATEGY_DATA_UNAVAILABLE' : 'US_MONTHLY_FAILED',
      isStrategyDataUnavailableError(error) ? 503 : 500,
    );
  }
}
