import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import {
  getNasdaqSettings,
  upsertNasdaqSettings,
} from '@/lib/nasdaq/repository';
import {
  mapStoredNasdaqSettings,
  validateNasdaqSettingsPatch,
} from '@/lib/nasdaq/settings';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  try {
    const record = await getNasdaqSettings({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
    });
    return apiSuccess(mapStoredNasdaqSettings(record), {
      source: 'nasdaq_strategy_settings',
      provider: 'Supabase',
      delay: 'REALTIME',
      observedAt: record?.updatedAt,
      modelVersion: 'nasdaq-core-leverage-2026.07-v1',
    });
  } catch (error) {
    return apiError(getErrorMessage(error), 'API_ERROR', 500);
  }
}

export async function PUT(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  try {
    const patch = validateNasdaqSettingsPatch(await request.json());
    if (Object.keys(patch).length === 0) {
      return apiError('저장할 설정이 없습니다.', 'INVALID_INPUT', 400);
    }
    const record = await upsertNasdaqSettings({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
      settings: patch,
    });
    return apiSuccess(mapStoredNasdaqSettings(record), {
      source: 'nasdaq_strategy_settings',
      provider: 'Supabase',
      delay: 'REALTIME',
      observedAt: record.updatedAt,
      modelVersion: 'nasdaq-core-leverage-2026.07-v1',
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const invalid = error instanceof SyntaxError || /이어야|지정할 수|저장할/.test(message);
    return apiError(message, invalid ? 'INVALID_INPUT' : 'API_ERROR', invalid ? 400 : 500);
  }
}
