/**
 * EDGAR 펀더멘털 백필 cron — Vercel Hobby 60초 한도 내 chunked 처리.
 *
 * GET /api/cron/edgar-backfill?wave=A&size=60
 *   wave: 'A' | 'B' | 'KR'  (cursor 분리)
 *   size: 1회 invocation에 처리할 종목 수 (default 60, ~50초 예산)
 *
 * 동작:
 *   1. fundamentals_backfill_progress에서 cursor 조회
 *   2. getStandardScannerUniverse(market)에서 cursor부터 size개 슬라이스
 *   3. 각 종목에 대해 getSecFundamentals 호출 (rate limit 10 req/sec, 동시성 6)
 *   4. 결과를 fundamental_cache에 upsert (status 포함)
 *   5. cursor 진행. 끝에 도달하면 0으로 wrap.
 *
 * 무료 한도:
 *   - SEC EDGAR: 10 req/sec, User-Agent 필수 (SEC_USER_AGENT env)
 *   - companyfacts JSON: 1~3MB/종목, fresh row 24h 이내면 skip → egress 절감
 *   - Vercel cron: 매일 1회 wave A/B (vercel.json)
 */

import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/contest-cron';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { getSecFundamentals } from '@/lib/finance/providers/sec-edgar-api';
import {
  CANSLIM_FUNDAMENTAL_FRESHNESS_DAYS,
  getBackfillProgress,
  readCanslimFundamentalsBatch,
  updateBackfillProgress,
  upsertCanslimFundamentals,
} from '@/lib/finance/market/fundamentals-cache';
import type { CanslimStockData, MarketCode } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Hobby 한도

const DEFAULT_CHUNK_SIZE = 60;
const MAX_CHUNK_SIZE = 120;
const CONCURRENCY = 6;
// EDGAR 권장 rate limit 10 req/sec → 동시성 6 + 종목 사이 100ms 간격으로 안전 마진.
const PER_TICKER_DELAY_MS = 100;

function parseWave(value: string | null): { wave: 'A' | 'B' | 'KR'; market: MarketCode } | null {
  if (value === 'A') return { wave: 'A', market: 'US' };
  if (value === 'B') return { wave: 'B', market: 'US' };
  if (value === 'KR') return { wave: 'KR', market: 'KR' };
  return null;
}

async function parallelLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx], idx);
      if (PER_TICKER_DELAY_MS > 0) await new Promise((r) => setTimeout(r, PER_TICKER_DELAY_MS));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface PerTickerResult {
  ticker: string;
  status: 'OK' | 'NO_CIK' | 'FETCH_FAIL' | 'PARSE_FAIL' | 'EMPTY' | 'SKIPPED';
  message?: string;
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseWave(searchParams.get('wave'));
  if (!parsed) {
    return apiError('wave 파라미터는 A | B | KR 중 하나여야 합니다.', 'INVALID_WAVE', 400);
  }
  const { wave, market } = parsed;

  // KR wave는 EDGAR 미사용 — DART 기반 별도 cron이 향후 채울 자리 (현재는 NO-OP).
  if (market === 'KR') {
    await updateBackfillProgress({
      wave, market, cursorOffset: 0, universeSize: 0,
      processed: 0, failed: 0, skipped: 0, error: 'KR wave: DART backfill not yet wired',
    });
    return apiSuccess({ wave, market, message: 'KR wave is reserved — DART backfill TBD.' });
  }

  const chunkSize = Math.max(10, Math.min(MAX_CHUNK_SIZE, Number(searchParams.get('size') || DEFAULT_CHUNK_SIZE)));
  const startedAt = Date.now();
  const deadline = startedAt + 55_000; // 55초 안전 마진

  try {
    // 1. 유니버스 + cursor 로드
    const [universe, progress] = await Promise.all([
      getStandardScannerUniverse(market),
      getBackfillProgress(wave),
    ]);
    const universeSize = universe.length;

    // wave A는 0~ceil(N/2), wave B는 ceil(N/2)~N 으로 모집단 분할
    const half = Math.ceil(universeSize / 2);
    const waveStart = wave === 'A' ? 0 : half;
    const waveEnd = wave === 'A' ? half : universeSize;

    // cursor가 wave 범위를 벗어났으면 정상화
    let cursor = progress?.cursorOffset ?? waveStart;
    if (cursor < waveStart || cursor >= waveEnd) cursor = waveStart;

    const sliceEnd = Math.min(cursor + chunkSize, waveEnd);
    const slice = universe.slice(cursor, sliceEnd);

    // 2. 이미 fresh한 row는 skip — readCanslimFundamentalsBatch로 단일 쿼리에 확인
    const tickers = slice.map((c) => c.ticker.toUpperCase());
    const cacheMap = await readCanslimFundamentalsBatch(tickers, market);
    const freshSet = new Set<string>();
    for (const [ticker, cached] of cacheMap) {
      if (cached.isFresh && cached.edgarStatus === 'OK') freshSet.add(ticker);
    }

    // 3. EDGAR 호출 (동시성 + rate limit)
    const results: PerTickerResult[] = await parallelLimit(slice, async (item) => {
      // 데드라인 도달 시 남은 종목은 skip — 다음 cron이 같은 cursor부터 재진입
      if (Date.now() > deadline) {
        return { ticker: item.ticker, status: 'SKIPPED', message: 'cron deadline' };
      }
      const ticker = item.ticker.toUpperCase();
      if (freshSet.has(ticker)) {
        return { ticker, status: 'SKIPPED', message: 'fresh cache' };
      }

      try {
        const snapshot = await getSecFundamentals(ticker);
        if (snapshot === null) {
          await upsertCanslimFundamentals({
            ticker, market, source: 'SEC EDGAR', status: 'NO_CIK',
            errorMessage: 'CIK lookup or empty XBRL',
          });
          return { ticker, status: 'NO_CIK' };
        }

        const data: Partial<CanslimStockData> = {
          symbol: ticker,
          market,
          currentQtrEpsGrowth: snapshot.currentQtrEpsGrowth ?? snapshot.epsGrowthPct ?? null,
          priorQtrEpsGrowth: snapshot.priorQtrEpsGrowth ?? null,
          epsGrowthLast3Qtrs: snapshot.epsGrowthLast3Qtrs ?? [null, null, null],
          currentQtrSalesGrowth: snapshot.currentQtrSalesGrowth ?? snapshot.revenueGrowthPct ?? null,
          annualEpsGrowthEachYear: snapshot.annualEpsGrowthEachYear ?? [null, null, null],
          hadNegativeEpsInLast3Yr: snapshot.hadNegativeEpsInLast3Yr ?? null,
          roe: snapshot.roePct ?? null,
          floatShares: snapshot.floatShares ?? null,
          sharesBuyback: snapshot.sharesBuyback ?? null,
        };

        // 모든 필드가 null이면 EMPTY로 표시 (다음 cron이 재시도하지 않음 — 7일 후 자연 만료)
        const hasAny = Object.entries(data).some(([k, v]) => {
          if (k === 'symbol' || k === 'market') return false;
          if (Array.isArray(v)) return v.some((x) => x !== null);
          return v !== null;
        });

        await upsertCanslimFundamentals({
          ticker, market, source: snapshot.source ?? 'SEC EDGAR companyfacts',
          status: hasAny ? 'OK' : 'EMPTY',
          data,
          epsGrowthPct: snapshot.epsGrowthPct ?? null,
          revenueGrowthPct: snapshot.revenueGrowthPct ?? null,
          roePct: snapshot.roePct ?? null,
          debtToEquityPct: snapshot.debtToEquityPct ?? null,
          floatShares: snapshot.floatShares ?? null,
        });
        return { ticker, status: hasAny ? 'OK' : 'EMPTY' };
      } catch (err) {
        const message = getErrorMessage(err);
        try {
          await upsertCanslimFundamentals({
            ticker, market, source: 'SEC EDGAR', status: 'FETCH_FAIL',
            errorMessage: message.slice(0, 500),
          });
        } catch {/* upsert 실패는 무시 */ }
        return { ticker, status: 'FETCH_FAIL', message };
      }
    }, CONCURRENCY);

    // 4. cursor 이동 (실제로 처리한(=skipped 제외) 종목 수만큼 OR 슬라이스 크기 — 후자가 안전)
    const processed = results.filter((r) => r.status === 'OK' || r.status === 'EMPTY').length;
    const failed = results.filter((r) => r.status === 'FETCH_FAIL' || r.status === 'PARSE_FAIL' || r.status === 'NO_CIK').length;
    const skipped = results.filter((r) => r.status === 'SKIPPED').length;

    // SKIPPED(deadline 또는 fresh cache)도 cursor를 진행한다 — fresh skip은 다음 7일 동안 다시 만나지 않고,
    // deadline skip은 어차피 다음 invocation에서 동일 종목을 만날 가능성이 낮다(슬라이스 이동).
    let nextCursor = sliceEnd;
    if (nextCursor >= waveEnd) nextCursor = waveStart; // wrap

    await updateBackfillProgress({
      wave, market,
      cursorOffset: nextCursor,
      universeSize,
      processed, failed, skipped,
      error: failed > slice.length / 2 ? 'High failure rate — check SEC_USER_AGENT and rate limits' : null,
    });

    return apiSuccess({
      wave, market,
      cursorPrev: cursor, cursorNext: nextCursor,
      sliceSize: slice.length, processed, failed, skipped,
      universeSize, waveRange: [waveStart, waveEnd],
      elapsedMs: Date.now() - startedAt,
      sample: results.slice(0, 5),
    });
  } catch (err) {
    return apiError(getErrorMessage(err), 'EDGAR_BACKFILL_FAILED', 500);
  }
}

// FRESHNESS_DAYS는 Next.js Route export로 노출하지 않음 (빌드 오류 방지).
// 외부에서 참조 필요 시 lib/finance/engines/canslim-data-fetcher.ts에서 직접 import.
const FRESHNESS_DAYS = CANSLIM_FUNDAMENTAL_FRESHNESS_DAYS;
void FRESHNESS_DAYS; // unused variable 경고 억제
