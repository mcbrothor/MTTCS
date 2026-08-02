import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { RISK_BAROMETER_MODEL_VERSION } from '@/lib/risk-barometer/model';
import { getRiskBarometerHistory } from '@/lib/risk-barometer/repository';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const rejected = await rejectUnauthenticatedRequest(request);
  if (rejected) return rejected;
  const days = Number(new URL(request.url).searchParams.get('days') || 30);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    return apiError('days는 1~365 사이의 정수여야 합니다.', 'INVALID_DAYS', 400);
  }
  try {
    const items = await getRiskBarometerHistory(getSupabaseAdmin(), days);
    return apiSuccess({ items, days }, {
      source: 'risk_barometer_snapshots',
      provider: 'Supabase',
      delay: 'EOD',
      observedAt: items.at(-1)?.date,
      modelVersion: RISK_BAROMETER_MODEL_VERSION,
    });
  } catch (error) {
    return apiError(getErrorMessage(error), 'RISK_BAROMETER_HISTORY_FAILED', 500);
  }
}
