import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import {
  isGoldProductCode,
  loadGoldProductHistory,
} from '@/lib/gold/data';
import { assessGoldPriceDataset } from '@/lib/gold/quality';
import type { GoldHistoryResponse } from '@/lib/gold/api-contract';
import type { YahooChartRange } from '@/lib/finance/providers/yahoo-api';

const ALLOWED_RANGES = new Set<YahooChartRange>(['1y', '2y', '5y', '10y']);

export async function GET(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);

  const { searchParams } = new URL(request.url);
  const product = searchParams.get('product');
  const range = (searchParams.get('range') || '2y') as YahooChartRange;
  if (!isGoldProductCode(product)) {
    return apiError('지원하지 않는 금 상품입니다.', 'INVALID_INPUT', 400);
  }
  if (!ALLOWED_RANGES.has(range)) {
    return apiError('range는 1y, 2y, 5y, 10y 중 하나여야 합니다.', 'INVALID_INPUT', 400);
  }

  try {
    const dataset = await loadGoldProductHistory(product, { range });
    const quality = assessGoldPriceDataset(dataset);
    const data: GoldHistoryResponse = {
      product: dataset.product,
      bars: dataset.bars,
      quality,
      provider: dataset.provider,
      fallbackUsed: dataset.fallbackUsed,
    };
    return apiSuccess(data, {
      source: `${dataset.product.code} 자체 OHLC`,
      provider: dataset.provider,
      delay: 'EOD',
      fallbackUsed: dataset.fallbackUsed,
      fallbackReason: dataset.fallbackUsed ? 'KIS 가격 조회 실패 또는 봉 수 부족' : null,
      warnings: [...dataset.warnings, ...quality.reasons],
      observedAt: quality.priceAsOf || undefined,
      isStale: quality.status !== 'VALID',
      staleReason: quality.reasons.join(' ') || null,
      modelVersion: 'gold-core-tactical-2026.07-v1',
    });
  } catch (error) {
    return apiError(
      getErrorMessage(error, '금 상품 가격 이력을 불러오지 못했습니다.'),
      'NO_DATA',
      503,
    );
  }
}
