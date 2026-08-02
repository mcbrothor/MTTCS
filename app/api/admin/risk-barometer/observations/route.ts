import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { withAdminSession } from '@/lib/auth/api';
import { parseManualRiskObservation } from '@/lib/risk-barometer/admin-input';
import {
  getLatestManualRiskObservations,
  MANUAL_RISK_KEYS,
  upsertManualRiskObservation,
  type ManualRiskObservationInput,
} from '@/lib/risk-barometer/repository';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const GET = withAdminSession(async () => {
  try {
    const rows = await getLatestManualRiskObservations(getSupabaseAdmin());
    return apiSuccess({
      observations: rows.filter(Boolean).map((row) => ({
        key: row?.indicator_key,
        period: row?.calc_date,
        value: row?.value === null ? null : Number(row?.value),
        unit: row?.unit,
        sourceUrl: row?.source_url,
        observedAt: row?.observed_at,
        approvedBy: row?.approved_by,
        approvedAt: row?.approved_at,
        note: row?.source_excerpt,
      })),
    }, {
      source: 'risk_barometer_indicator_observations',
      provider: 'Supabase',
      delay: 'UNKNOWN',
    });
  } catch (error) {
    return apiError(getErrorMessage(error), 'RISK_BAROMETER_ADMIN_READ_FAILED', 500);
  }
});

export const PUT = withAdminSession(async (request, _context, session) => {
  try {
    const body = await request.json();
    const rawItems = Array.isArray(body?.observations)
      ? body.observations
      : body?.observation
        ? [body.observation]
        : [body];
    if (rawItems.length < 1 || rawItems.length > MANUAL_RISK_KEYS.length) {
      return apiError('한 번에 1~3개 관측값을 저장할 수 있습니다.', 'INVALID_INPUT', 400);
    }
    const parsed: ManualRiskObservationInput[] = rawItems.map(
      (item: unknown) => parseManualRiskObservation(item, session),
    );
    if (new Set(parsed.map((item) => item.key)).size !== parsed.length) {
      return apiError('같은 지표를 한 요청에 중복 입력할 수 없습니다.', 'INVALID_INPUT', 400);
    }
    const client = getSupabaseAdmin();
    const saved = [];
    for (const item of parsed) saved.push(await upsertManualRiskObservation(client, item));
    return apiSuccess({ observations: saved }, {
      source: 'risk_barometer_indicator_observations',
      provider: 'Admin approved',
      delay: 'UNKNOWN',
      observedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const validation = /필요|형식|대상|숫자|단위|주소|관측|근거/.test(message);
    return apiError(message, validation ? 'INVALID_INPUT' : 'RISK_BAROMETER_ADMIN_WRITE_FAILED', validation ? 400 : 500);
  }
});
