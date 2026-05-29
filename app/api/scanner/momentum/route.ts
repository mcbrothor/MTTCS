import { NextResponse } from 'next/server';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { analyzeSurge } from '@/lib/finance/engines/surge-score';
import type { OHLCData } from '@/types';

/**
 * 급등 종목 스캐너 배치 분석 API
 *
 * POST /api/scanner/surge
 * Body: { items: [{ ticker, exchange }] }
 */

interface SurgeBatchItem {
  ticker: string;
  exchange: string;
}

interface SurgeBatchRequest {
  items: SurgeBatchItem[];
}

const MAX_BATCH_SIZE = 20;
const CONCURRENCY_LIMIT = 5;

function yahooTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

async function fetchDailyBars(ticker: string, exchange: string, bars = 30): Promise<OHLCData[]> {
  try {
    const data = await getMarketDailyPrice(ticker, exchange, bars);
    if (data.length > 0) return data;
  } catch {
    // KIS 실패 시 Yahoo fallback
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
    const body = (await request.json()) as SurgeBatchRequest;
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

    const rawResults = await parallelWithLimit(
      items,
      async (item) => {
        try {
          // Surge 분석에는 30일 정도 데이터면 충분함
          const data = await fetchDailyBars(item.ticker, item.exchange, 30);

          if (data.length < 20) {
            return {
              ticker: item.ticker,
              success: false,
              error: `데이터 부족: ${data.length}개 봉 (최소 20개 필요)`,
            };
          }

          const analysis = analyzeSurge(data);

          if (!analysis) {
             return {
              ticker: item.ticker,
              success: false,
              error: `분석 실패`,
            };
          }

          // 현재가 추출
          const lastBar = data.at(-1);
          const currentPrice = lastBar?.close ?? null;

          return {
            ticker: item.ticker,
            success: true,
            data: {
              ...analysis,
              currentPrice,
            },
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

    return NextResponse.json({ results: rawResults });
  } catch (error: unknown) {
    console.error('[Surge Batch Error]', error);
    return NextResponse.json(
      { message: '급등 분석 배치 처리 중 오류 발생', code: 'SURGE_BATCH_ERROR' },
      { status: 500 },
    );
  }
}
