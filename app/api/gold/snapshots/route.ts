import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import {
  isGoldProductCode,
} from '@/lib/gold/data';
import {
  listGoldStrategySnapshots,
} from '@/lib/gold/repository';
import type {
  GoldDecisionView,
  GoldSnapshotsResponse,
} from '@/lib/gold/api-contract';
import { getSupabaseAdmin } from '@/lib/supabase/server';

function fallbackDecision(): GoldDecisionView {
  return {
    code: 'BLOCKED',
    label: '기록 확인 필요',
    summary: '저장된 결과 형식이 현재 화면 계약과 다릅니다.',
    coreAction: '검토',
    tacticalAction: '대기',
  };
}

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);

  const { searchParams } = new URL(request.url);
  const rawProduct = searchParams.get('product');
  if (rawProduct && !isGoldProductCode(rawProduct)) {
    return apiError('지원하지 않는 금 상품입니다.', 'INVALID_INPUT', 400);
  }
  const product = rawProduct && isGoldProductCode(rawProduct) ? rawProduct : undefined;
  const rawLimit = Number(searchParams.get('limit') || 30);
  if (!Number.isFinite(rawLimit) || rawLimit < 1) {
    return apiError('limit은 1 이상의 숫자여야 합니다.', 'INVALID_INPUT', 400);
  }

  try {
    const records = await listGoldStrategySnapshots({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
      product,
      limit: rawLimit,
    });
    const data: GoldSnapshotsResponse = {
      items: records.map((record) => {
        const result = record.result as {
          decision?: GoldDecisionView;
          macro?: { score?: number | null };
          allocation?: { coreTargetPct?: number; tacticalTargetPct?: number };
        };
        return {
          id: record.id,
          strategyDate: record.asOfDate,
          coreProduct: record.coreProduct,
          tacticalProduct: record.tacticalProduct,
          decision: result.decision || fallbackDecision(),
          macroScore: result.macro?.score ?? null,
          targetCorePct: result.allocation?.coreTargetPct ?? 4,
          targetTacticalPct: result.allocation?.tacticalTargetPct ?? 0,
          dataQuality:
            record.dataQuality === 'READY' ? 'VALID' : record.dataQuality,
          modelVersion: record.modelVersion,
          inputHash: record.inputHash,
          createdAt: record.createdAt,
        };
      }),
    };
    return apiSuccess(data, {
      source: 'gold_strategy_snapshots',
      provider: 'Supabase',
      delay: 'EOD',
      observedAt: records[0]?.observedAt,
      modelVersion: 'gold-core-tactical-2026.07-v1',
    });
  } catch (error) {
    return apiError(
      getErrorMessage(error, '금 전략 이력을 불러오지 못했습니다.'),
      'API_ERROR',
      500,
    );
  }
}
