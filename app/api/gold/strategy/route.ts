import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { buildGoldStrategyForOwner } from '@/lib/gold/service';
import { parseGoldStrategyOverrides } from '@/lib/gold/strategy-query';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);

  let overrides;
  try {
    overrides = parseGoldStrategyOverrides(request.url);
  } catch (error) {
    return apiError(
      getErrorMessage(error, '금 전략 쿼리가 올바르지 않습니다.'),
      'INVALID_INPUT',
      400,
    );
  }

  try {
    const built = await buildGoldStrategyForOwner({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
      overrides,
    });
    const strategy = built.response;
    const fallbackUsed =
      strategy.quality.status !== 'VALID'
      || strategy.products.core.fallbackUsed
      || strategy.products.tactical.fallbackUsed;

    return apiSuccess(strategy, {
      source: '상품별 OHLC + FRED + 운영자 승인 WGC 집계 + 통합 포트폴리오',
      provider: 'MTN deterministic gold engine',
      delay: 'EOD',
      observedAt: strategy.quality.priceAsOf || strategy.asOf,
      calculatedAt: strategy.asOf,
      fallbackUsed,
      fallbackReason: fallbackUsed
        ? strategy.quality.reasons.join(' ') || '가격 공급자 fallback 사용'
        : null,
      warnings: strategy.quality.reasons,
      isStale: strategy.quality.status !== 'VALID',
      staleReason:
        strategy.quality.status === 'VALID'
          ? null
          : strategy.quality.reasons.join(' '),
      modelVersion: strategy.modelVersion,
    });
  } catch (error) {
    return apiError(
      getErrorMessage(error, '금 전략을 계산하지 못했습니다.'),
      'GOLD_STRATEGY_FAILED',
      500,
    );
  }
}
