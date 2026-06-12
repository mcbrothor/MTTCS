import { NextResponse } from 'next/server';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { getTossDailyPrice, isTossInvestConfigured } from '@/lib/finance/providers/toss-api';
import { analyzeQullamaggieSetup } from '@/lib/finance/engines/qullamaggie-score';
import type { OHLCData } from '@/types';

interface QullamaggieBatchItem {
  ticker: string;
  exchange: string;
}

interface QullamaggieBatchRequest {
  items: QullamaggieBatchItem[];
}

const MAX_BATCH_SIZE = 20;
const CONCURRENCY_LIMIT = 4;
const TARGET_BARS = 180;

function yahooTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

async function fetchDailyBars(ticker: string, exchange: string, bars = TARGET_BARS): Promise<OHLCData[]> {
  const providerOrder = exchange === 'KOSPI' || exchange === 'KOSDAQ'
    ? ['KIS', 'Toss Securities']
    : ['Toss Securities', 'KIS'];

  for (const provider of providerOrder) {
    if (provider === 'Toss Securities' && !isTossInvestConfigured()) continue;

    try {
      const data = provider === 'KIS'
        ? await getMarketDailyPrice(ticker, exchange, bars)
        : await getTossDailyPrice(ticker, bars);
      if (data.length > 0) return data;
    } catch {
      // 다음 provider로 fallback
    }
  }
  return getYahooDailyPrice(yahooTicker(ticker, exchange));
}

async function parallelWithLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as QullamaggieBatchRequest;
    const { items } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { message: 'items 배열이 필요합니다.', code: 'INVALID_INPUT' },
        { status: 400 },
      );
    }

    if (items.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { message: `최대 ${MAX_BATCH_SIZE}개까지 요청 가능합니다.`, code: 'PAYLOAD_TOO_LARGE' },
        { status: 400 },
      );
    }

    const results = await parallelWithLimit(
      items,
      async (item) => {
        try {
          const data = await fetchDailyBars(item.ticker, item.exchange);

          if (data.length < 60) {
            return {
              ticker: item.ticker,
              success: false,
              error: `데이터 부족: ${data.length}개 봉 (최소 60개 필요)`,
            };
          }

          const market = item.exchange === 'KOSPI' || item.exchange === 'KOSDAQ' ? 'KR' : 'US';
          const analysis = analyzeQullamaggieSetup(data, { market, exchange: item.exchange });

          if (!analysis) {
            return {
              ticker: item.ticker,
              success: false,
              error: '쿨라매기 셋업 분석 실패',
            };
          }

          return {
            ticker: item.ticker,
            success: true,
            data: analysis,
          };
        } catch (err: unknown) {
          return {
            ticker: item.ticker,
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }
      },
      CONCURRENCY_LIMIT,
    );

    return NextResponse.json({ results });
  } catch (error: unknown) {
    console.error('[Qullamaggie Batch Error]', error);
    return NextResponse.json(
      { message: '쿨라매기 분석 배치 처리 중 오류 발생', code: 'QULLAMAGGIE_BATCH_ERROR' },
      { status: 500 },
    );
  }
}
