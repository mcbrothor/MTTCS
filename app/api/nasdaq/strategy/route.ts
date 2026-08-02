import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { buildNasdaqStrategyForOwner } from '@/lib/nasdaq/service';
import { parseNasdaqStrategyOverrides } from '@/lib/nasdaq/strategy-query';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  let overrides;
  try {
    overrides = parseNasdaqStrategyOverrides(request.url);
  } catch (error) {
    return apiError(getErrorMessage(error), 'INVALID_INPUT', 400);
  }
  try {
    const built = await buildNasdaqStrategyForOwner({
      client: getSupabaseAdmin(),
      ownerId: session.systemId,
      overrides,
    });
    const strategy = built.response;
    return apiSuccess(strategy, {
      source: 'QQQ adjusted regime + selected ETF execution OHLC + unified portfolio',
      provider: 'MTN deterministic Nasdaq engine / KIS / Yahoo Finance',
      delay: 'EOD',
      observedAt: strategy.quality.asOf || strategy.asOf,
      calculatedAt: new Date().toISOString(),
      fallbackUsed:
        strategy.quality.status !== 'VALID'
        || strategy.providers.tacticalExecution.fallbackUsed,
      fallbackReason: strategy.quality.reasons.join(' ') || null,
      warnings: [...strategy.quality.reasons, ...strategy.portfolioWarnings],
      isStale: strategy.quality.status !== 'VALID',
      staleReason: strategy.quality.reasons.join(' ') || null,
      modelVersion: strategy.modelVersion,
    });
  } catch (error) {
    return apiError(
      getErrorMessage(error, '나스닥 전략을 계산하지 못했습니다.'),
      'NASDAQ_STRATEGY_FAILED',
      500,
    );
  }
}
