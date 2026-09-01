import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { loadKospi52wDataset } from '@/lib/strategy/kospi-52w/service';
import { screenCandidates, generateSignal } from '@/lib/strategy/kospi-52w/engine';
import { KOSPI52W_MODEL_VERSION, KOSPI52W_POLICY, KOSPI52W_UNIVERSE } from '@/lib/strategy/kospi-52w/policy';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { loadStrategyHoldings } from '@/lib/strategy/holdings';
import { isStrategyDataUnavailableError, requireStrategyCoverage } from '@/lib/strategy/data-quality';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  try {
    const [{ universeBars, kospiBars, quality }, holdings] = await Promise.all([
      loadKospi52wDataset(400),
      loadStrategyHoldings({
        client: getSupabaseAdmin(),
        ownerId: session.systemId,
        universe: KOSPI52W_UNIVERSE.map((item) => item.ticker),
      }),
    ]);
    requireStrategyCoverage(quality);
    const asOf = quality.asOf;
    const candidates = screenCandidates(universeBars, kospiBars, asOf);
    const signal = generateSignal(holdings, candidates, universeBars, asOf);
    return apiSuccess(
      {
        modelVersion: KOSPI52W_MODEL_VERSION,
        policy: KOSPI52W_POLICY,
        asOf,
        quality,
        holdings,
        universeCount: Object.keys(universeBars).length,
        candidates,
        signal,
      },
      {
        source: 'KOSPI 52주 신고가 RS Top12∩52w 4×25% MA10',
        provider: 'KIS→Yahoo fallback',
        delay: 'EOD',
        observedAt: asOf,
        calculatedAt: new Date().toISOString(),
        modelVersion: KOSPI52W_MODEL_VERSION,
        warnings: quality.warnings.slice(0, 10),
      },
    );
  } catch (error) {
    return apiError(
      getErrorMessage(error, 'KOSPI 52주 전략 계산 실패'),
      isStrategyDataUnavailableError(error) ? 'STRATEGY_DATA_UNAVAILABLE' : 'KOSPI52W_FAILED',
      isStrategyDataUnavailableError(error) ? 503 : 500,
    );
  }
}
