import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import {
  getGoldStrategySettings,
  upsertGoldStrategySettings,
} from '@/lib/gold/repository';
import {
  mapStoredGoldSettings,
  validateGoldSettingsPatch,
} from '@/lib/gold/settings';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);

  try {
    const record = await getGoldStrategySettings({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
    });
    return apiSuccess(mapStoredGoldSettings(record), {
      source: 'gold_strategy_settings',
      provider: 'Supabase',
      delay: 'REALTIME',
      observedAt: record?.updatedAt,
      modelVersion: 'gold-core-tactical-2026.07-v1',
    });
  } catch (error) {
    return apiError(
      getErrorMessage(error, '금 전략 설정을 불러오지 못했습니다.'),
      'API_ERROR',
      500,
    );
  }
}

export async function PUT(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);

  try {
    const body = await request.json();
    const settings = validateGoldSettingsPatch(body);
    if (Object.keys(settings).length === 0) {
      return apiError('저장할 설정이 없습니다.', 'INVALID_INPUT', 400);
    }
    const record = await upsertGoldStrategySettings({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
      settings,
    });
    return apiSuccess(mapStoredGoldSettings(record), {
      source: 'gold_strategy_settings',
      provider: 'Supabase',
      delay: 'REALTIME',
      observedAt: record.updatedAt,
      modelVersion: 'gold-core-tactical-2026.07-v1',
    });
  } catch (error) {
    const message = getErrorMessage(error, '금 전략 설정을 저장하지 못했습니다.');
    const invalid =
      error instanceof SyntaxError ||
      /이어야|없습니다|화이트리스트|지정할 수/.test(message);
    return apiError(message, invalid ? 'INVALID_INPUT' : 'API_ERROR', invalid ? 400 : 500);
  }
}
