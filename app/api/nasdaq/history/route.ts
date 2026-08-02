import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import {
  isNasdaqProductCode,
  loadNasdaqAdjustedHistory,
  loadNasdaqExecutionHistory,
} from '@/lib/nasdaq/data';
import type { YahooChartRange } from '@/lib/finance/providers/yahoo-api';

const RANGES = new Set<YahooChartRange>(['1y', '2y', '5y', '10y', 'max']);

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  const { searchParams } = new URL(request.url);
  const product = searchParams.get('product');
  const range = (searchParams.get('range') || '2y') as YahooChartRange;
  const series = searchParams.get('series') || 'execution';
  if (!isNasdaqProductCode(product)) {
    return apiError('지원하지 않는 나스닥 ETF입니다.', 'INVALID_INPUT', 400);
  }
  if (!RANGES.has(range) || !['execution', 'adjusted'].includes(series)) {
    return apiError('range 또는 series가 올바르지 않습니다.', 'INVALID_INPUT', 400);
  }
  try {
    const dataset = series === 'adjusted'
      ? await loadNasdaqAdjustedHistory(product, { range })
      : await loadNasdaqExecutionHistory(product, { range });
    return apiSuccess(dataset, {
      source: `${product} ${series === 'adjusted' ? '조정주가' : '자체 OHLC'}`,
      provider: dataset.provider,
      delay: 'EOD',
      observedAt: dataset.bars.at(-1)?.date,
      fallbackUsed: dataset.fallbackUsed,
      fallbackReason: dataset.warnings.join(' ') || null,
      warnings: dataset.warnings,
      modelVersion: 'nasdaq-core-leverage-2026.07-v1',
    });
  } catch (error) {
    return apiError(getErrorMessage(error), 'NO_DATA', 503);
  }
}
