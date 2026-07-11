import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { NextResponse } from 'next/server';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { getTossDailyPrice, isTossInvestConfigured } from '@/lib/finance/providers/toss-api';
import { analyzeSurge } from '@/lib/finance/engines/surge-score';
import type { OHLCData } from '@/types';
import axios from 'axios';

/**
 * 모멘텀 스캐너 배치 분석 API
 *
 * POST /api/scanner/momentum
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

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function yahooTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

function isKoreanExchange(exchange: string) {
  return exchange === 'KOSPI' || exchange === 'KOSDAQ';
}

/**
 * 모멘텀 분석에 최적화된 Yahoo 일봉 조회 (최근 60일만 요청)
 * getYahooDailyPrice는 2년치를 가져오므로 대역폭 낭비 — 여기선 3개월로 제한
 */
async function fetchYahooShortRange(ticker: string, days = 60): Promise<OHLCData[]> {
  const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
    params: {
      range: `${days}d`,
      interval: '1d',
      includePrePost: false,
      events: 'history',
    },
    headers: {
      'User-Agent': BROWSER_UA,
      'Accept': 'application/json',
      'Referer': 'https://finance.yahoo.com/',
    },
    timeout: 8000,
  });

  const result = response.data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0];
  if (!result || !quote || timestamps.length === 0) return [];

  return timestamps
    .map((timestamp, index) => {
      const o = quote.open?.[index];
      const h = quote.high?.[index];
      const l = quote.low?.[index];
      const c = quote.close?.[index];
      const v = quote.volume?.[index];
      if (o === null || h === null || l === null || c === null) return null;
      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        open: Number(o),
        high: Number(h),
        low: Number(l),
        close: Number(c),
        volume: Number(v),
      };
    })
    .filter((row): row is OHLCData =>
      row !== null &&
      Number.isFinite(row.open) &&
      Number.isFinite(row.close) &&
      Number.isFinite(row.volume) &&
      row.close > 0
    );
}

/**
 * 종목별 데이터 소싱 전략:
 * - 한국 주식: KIS API 우선 → Toss → Yahoo fallback
 * - 미국 주식: Toss 우선 → KIS → Yahoo fallback
 */
async function fetchDailyBars(ticker: string, exchange: string): Promise<OHLCData[]> {
  const providerOrder = isKoreanExchange(exchange) ? ['KIS', 'Toss Securities'] : ['Toss Securities', 'KIS'];

  for (const provider of providerOrder) {
    if (provider === 'Toss Securities' && !isTossInvestConfigured()) continue;

    try {
      const data = provider === 'KIS'
        ? await getMarketDailyPrice(ticker, exchange, 30)
        : await getTossDailyPrice(ticker, 60);
      if (data.length > 0) return data;
    } catch {
      // 다음 provider로 fallback
    }
  }

  return fetchYahooShortRange(yahooTicker(ticker, exchange), 60);
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
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
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
          const data = await fetchDailyBars(item.ticker, item.exchange);

          if (data.length < 20) {
            return {
              ticker: item.ticker,
              success: false,
              error: `데이터 부족: ${data.length}개 봉 (최소 20개 필요)`,
            };
          }

          const isKr = isKoreanExchange(item.exchange);
          const analysis = analyzeSurge(data, isKr);

          if (!analysis) {
             return {
              ticker: item.ticker,
              success: false,
              error: `분석 실패`,
            };
          }

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
