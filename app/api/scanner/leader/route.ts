import { NextResponse } from 'next/server';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { analyzeLeaderScore } from '@/lib/finance/engines/leader-score';
import type { OHLCData } from '@/types';

/**
 * 주도주 스캐너 배치 분석 API
 *
 * POST /api/scanner/leader
 * Body: { items: [{ ticker, exchange }], benchmarkTicker?: string }
 *
 * 기존 /api/scanner/batch 패턴을 따르되,
 * Leader Score 엔진(leader-score.ts)으로 5축 합산 점수를 산출합니다.
 */

interface LeaderBatchItem {
  ticker: string;
  exchange: string;
  sectorRank?: number | null;
}

interface LeaderBatchRequest {
  items: LeaderBatchItem[];
  benchmarkTicker?: string;
  totalSectors?: number;
}

const MAX_BATCH_SIZE = 20;
const CONCURRENCY_LIMIT = 5;

function yahooTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

async function fetchDailyBars(ticker: string, exchange: string, bars = 300): Promise<OHLCData[]> {
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
    const body = (await request.json()) as LeaderBatchRequest;
    const { items, benchmarkTicker, totalSectors = 11 } = body;

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

    // 벤치마크 데이터 사전 로드 (한 번만)
    let benchmarkData: OHLCData[] = [];
    const benchTicker = benchmarkTicker || 'SPY';
    try {
      benchmarkData = await getYahooDailyPrice(benchTicker);
    } catch {
      // 벤치마크 로드 실패 시 빈 배열로 진행
    }

    const results = await parallelWithLimit(
      items,
      async (item) => {
        try {
          const data = await fetchDailyBars(item.ticker, item.exchange);

          if (data.length < 50) {
            return {
              ticker: item.ticker,
              success: false,
              error: `데이터 부족: ${data.length}개 봉 (최소 50개 필요)`,
            };
          }

          const analysis = analyzeLeaderScore({
            data,
            benchmarkData: benchmarkData.length > 0 ? benchmarkData : undefined,
            sectorRank: item.sectorRank,
            totalSectors,
            market: item.exchange === 'KOSPI' || item.exchange === 'KOSDAQ' ? 'KR' : 'US',
            exchange: item.exchange,
          });

          // 현재가 및 등락률 추출
          const lastBar = data.at(-1);
          const prevBar = data.length >= 2 ? data[data.length - 2] : null;
          const currentPrice = lastBar?.close ?? null;
          const changePercent =
            currentPrice !== null && prevBar?.close
              ? Number((((currentPrice - prevBar.close) / prevBar.close) * 100).toFixed(2))
              : null;

          return {
            ticker: item.ticker,
            success: true,
            data: {
              ...analysis,
              currentPrice,
              changePercent,
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

    return NextResponse.json({ results });
  } catch (error: unknown) {
    console.error('[Leader Batch Error]', error);
    return NextResponse.json(
      { message: '주도주 분석 배치 처리 중 오류 발생', code: 'LEADER_BATCH_ERROR' },
      { status: 500 },
    );
  }
}
