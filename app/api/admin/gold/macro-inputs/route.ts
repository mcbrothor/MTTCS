import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import {
  getLatestGoldMacroObservation,
  upsertGoldMacroObservation,
} from '@/lib/gold/repository';
import { validateGoldMacroInput } from '@/lib/gold/admin-input';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  }

  try {
    const observation = await getLatestGoldMacroObservation({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
    });
    return apiSuccess(observation, {
      source: 'gold_macro_observations',
      provider: 'Supabase / WGC manual approval',
      delay: 'UNKNOWN',
      observedAt: observation?.approvedAt,
    });
  } catch (error) {
    return apiError(
      getErrorMessage(error, '금 ETF 흐름 입력 조회에 실패했습니다.'),
      'GOLD_MACRO_READ_FAILED',
      500,
    );
  }
}

export async function PUT(request: Request) {
  const session = await getRequestSession(request);
  if (!session) {
    return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  }

  const body = await request.json().catch(() => null);
  if (body === null) {
    return apiError(
      '유효한 JSON 요청 본문이 필요합니다.',
      'INVALID_GOLD_MACRO_INPUT',
      400,
    );
  }
  const validation = validateGoldMacroInput(body);
  if (!validation.ok) {
    return apiError(
      validation.message,
      'INVALID_GOLD_MACRO_INPUT',
      400,
    );
  }

  try {
    const approvedAt = new Date().toISOString();
    const observation = await upsertGoldMacroObservation({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
      observation: {
        ...validation.value,
        approvedAt,
      },
    });
    return apiSuccess(observation, {
      source: observation.sourceUrl,
      provider: 'World Gold Council / MTN manual approval',
      delay: 'UNKNOWN',
      observedAt: observation.approvedAt,
    });
  } catch (error) {
    return apiError(
      getErrorMessage(error, '금 ETF 흐름 입력 저장에 실패했습니다.'),
      'GOLD_MACRO_WRITE_FAILED',
      500,
    );
  }
}
