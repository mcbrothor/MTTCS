import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { emptyRiskBarometer, RISK_BAROMETER_MODEL_VERSION } from '@/lib/risk-barometer/model';
import { getLatestRiskBarometerSnapshot } from '@/lib/risk-barometer/repository';
import { buildRiskBarometerSnapshot } from '@/lib/risk-barometer/service';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const rejected = await rejectUnauthenticatedRequest(request);
  if (rejected) return rejected;
  const market = new URL(request.url).searchParams.get('market') || 'US';
  if (market !== 'US') {
    return apiError('v1 바로미터는 미국 시장만 지원합니다.', 'INVALID_MARKET', 400);
  }
  try {
    const client = getSupabaseAdmin();
    const stored = await getLatestRiskBarometerSnapshot(client);
    const response = stored
      ?? (await buildRiskBarometerSnapshot({ client }).catch(() => null))?.response
      ?? emptyRiskBarometer();
    return apiSuccess(response, {
      source: stored ? 'risk_barometer_snapshots' : 'Live calculation preview',
      provider: 'MTN deterministic model',
      delay: 'EOD',
      observedAt: response.asOf,
      fallbackUsed: response.quality !== 'VALID',
      fallbackReason: response.quality === 'BLOCKED'
        ? '8개 미만의 지표만 확인되어 점수를 차단했습니다.'
        : response.quality === 'DEGRADED'
          ? `${response.coverage.valid}/10개 지표로 환산했습니다.`
          : null,
      modelVersion: RISK_BAROMETER_MODEL_VERSION,
    });
  } catch (error) {
    return apiError(getErrorMessage(error), 'RISK_BAROMETER_READ_FAILED', 500);
  }
}
