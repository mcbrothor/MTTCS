import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { NextResponse } from 'next/server';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { getTossDailyPrice, isTossInvestConfigured } from '@/lib/finance/providers/toss-api';
import { analyzeLeaderScore, applyLeaderUniverseMetrics } from '@/lib/finance/engines/leader-score';
import { calculateTurnoverIntensity } from '@/lib/finance/engines/turnover-intensity';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { OHLCData } from '@/types';
import type { LeaderAnalysisResult } from '@/lib/finance/engines/leader-score';

// ... (fetchDailyBars, parallelWithLimit 등은 동일하므로 하단 교체 대상만 타겟팅합니다)

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

type RankedLeaderData = LeaderAnalysisResult & {
  rsRating: number;
  rsRank: number;
  dollarVolumeShare: number;
};

const MAX_BATCH_SIZE = 20;
const CONCURRENCY_LIMIT = 5;

function yahooTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

function isKoreanExchange(exchange: string) {
  return exchange === 'KOSPI' || exchange === 'KOSDAQ';
}

async function fetchDailyBars(ticker: string, exchange: string, bars = 300): Promise<OHLCData[]> {
  const providerOrder = isKoreanExchange(exchange) ? ['KIS', 'Toss Securities'] : ['Toss Securities', 'KIS'];

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
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
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

    const rawResults = await parallelWithLimit(
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
          const turnoverIntensity = calculateTurnoverIntensity({
            ticker: item.ticker,
            bars: data,
            provider: isKoreanExchange(item.exchange) ? 'KIS/Toss/Yahoo' : 'Toss/KIS/Yahoo',
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
              turnoverIntensity,
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

    // ── 성공한 아이템들의 상대적 계량 순위(R^2, 모멘텀, 거래대금 점유율) 연산 ──
    const successfulItems = rawResults
      .filter((r) => r.success && r.data)
      .map((r) => ({
        ticker: r.ticker,
        leaderScore: r.data!.leaderScore,
        leaderGrade: r.data!.leaderGrade,
        breakdown: r.data!.breakdown,
        dollarVolume20d: r.data!.dollarVolume20d,
        liquidityVelocity: r.data!.liquidityVelocity,
        regressionR2: r.data!.regressionR2,
        regressionSlope: r.data!.regressionSlope,
        trendIntensityIndex: r.data!.trendIntensityIndex,
        weightedMomentumScore: r.data!.weightedMomentumScore,
        benchmarkRelativeScore: r.data!.benchmarkRelativeScore,
        distanceFromHigh52WeekPct: r.data!.distanceFromHigh52WeekPct,
        sectorRank: itemSectorRank(items, r.ticker),
        raw: r.data!,
      }));

    const rankedItems = applyLeaderUniverseMetrics(successfulItems, totalSectors);

    // 맵 구조를 통해 원본 결과 리스트에 랭킹 및 보정된 지표를 다시 바인딩
    const rankedMap = new Map<string, RankedLeaderData>();
    rankedItems.forEach((item) => {
      rankedMap.set(item.ticker, {
        ...item.raw,
        rsRating: item.rsRating,
        rsRank: item.rsRank,
        dollarVolumeShare: item.dollarVolumeShare,
        leaderScore: item.leaderScore,
        leaderGrade: item.leaderGrade,
        breakdown: item.breakdown,
      });
    });

    const finalResults = rawResults.map((r) => {
      if (r.success && r.data) {
        const rankedData = rankedMap.get(r.ticker);
        return {
          ...r,
          data: {
            ...r.data,
            ...rankedData,
          },
        };
      }
      return r;
    });

    const turnoverSnapshots = finalResults.flatMap((result) => {
      if (!result.success || !result.data?.turnoverIntensity) return [];
      const signal = result.data.turnoverIntensity;
      const exchange = items.find((item) => item.ticker === result.ticker)?.exchange || 'US';
      return [{
        ticker: result.ticker, exchange, as_of: signal.asOf.slice(0, 10), model_version: signal.modelVersion,
        provider: signal.provider, quality: signal.quality, snapshot: signal, updated_at: new Date().toISOString(),
      }];
    });
    if (turnoverSnapshots.length > 0) {
      const { error: snapshotError } = await getSupabaseAdmin().from('turnover_intensity_snapshots').upsert(turnoverSnapshots, {
        onConflict: 'ticker,exchange,as_of,model_version',
      });
      if (snapshotError) console.warn('[Leader Batch] turnover snapshot persistence failed:', snapshotError.message);
    }

    return NextResponse.json({ results: finalResults });
  } catch (error: unknown) {
    console.error('[Leader Batch Error]', error);
    return NextResponse.json(
      { message: '주도주 분석 배치 처리 중 오류 발생', code: 'LEADER_BATCH_ERROR' },
      { status: 500 },
    );
  }
}

// 헬퍼: 맵 대용 ticker 섹터 순위 탐색
function itemSectorRank(items: LeaderBatchItem[], ticker: string): number | null {
  const match = items.find((i) => i.ticker === ticker);
  return match?.sectorRank ?? null;
}
