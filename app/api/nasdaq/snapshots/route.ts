import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { isNasdaqTacticalProduct } from '@/lib/nasdaq/data';
import { listNasdaqSnapshots } from '@/lib/nasdaq/repository';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  const { searchParams } = new URL(request.url);
  const product = searchParams.get('product');
  const rawLimit = Number(searchParams.get('limit') || 30);
  if (product && !isNasdaqTacticalProduct(product)) {
    return apiError('product는 QLD 또는 TQQQ여야 합니다.', 'INVALID_INPUT', 400);
  }
  if (!Number.isFinite(rawLimit) || rawLimit < 1) {
    return apiError('limit은 1 이상의 숫자여야 합니다.', 'INVALID_INPUT', 400);
  }
  try {
    const records = await listNasdaqSnapshots({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
      product: product && isNasdaqTacticalProduct(product) ? product : undefined,
      limit: rawLimit,
    });
    return apiSuccess({
      items: records.map((record) => {
        const result = record.result as {
          decision?: string;
          allocation?: {
            totalCapitalTargetPct?: number;
            totalEffectiveTargetPct?: number;
          };
        };
        return {
          id: record.id,
          strategyDate: record.asOfDate,
          tacticalProduct: record.tacticalProduct,
          decision: result.decision ?? 'DATA_BLOCKED',
          totalCapitalTargetPct: result.allocation?.totalCapitalTargetPct ?? 0,
          totalEffectiveTargetPct: result.allocation?.totalEffectiveTargetPct ?? 0,
          dataQuality: record.dataQuality,
          modelVersion: record.modelVersion,
          inputHash: record.inputHash,
          createdAt: record.createdAt,
        };
      }),
    }, {
      source: 'nasdaq_strategy_snapshots',
      provider: 'Supabase',
      delay: 'EOD',
      observedAt: records[0]?.observedAt,
      modelVersion: 'nasdaq-core-leverage-2026.07-v1',
    });
  } catch (error) {
    return apiError(getErrorMessage(error), 'API_ERROR', 500);
  }
}
