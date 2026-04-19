/**
 * 종목명 배치 조회 API
 *
 * POST /api/security-lookup/batch
 * Body: { items: [{ ticker: "AAPL", exchange: "NAS" }, ...] }
 *
 * 왜 배치 API가 필요한가?
 * - 스캐너/테이블에서 종목 50~100개의 이름을 개별 조회하면 N+1 문제 발생
 * - 배치로 묶어 병렬 처리하면 Yahoo API 호출 횟수를 줄이고 응답 시간을 단축
 * - 캐시 히트율도 향상됨 (한 번 조회된 종목은 다음 배치에서 즉시 반환)
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheKey, cacheSet } from '@/lib/cache';
import { getYahooSecurityProfile } from '@/lib/finance/providers/yahoo-api';

interface BatchItem {
  ticker: string;
  exchange: string;
}

interface SecurityLookupResult {
  ticker: string;
  exchange: string;
  name: string | null;
  source: string;
}

// Yahoo 비공식 API의 Rate Limit 보호를 위한 동시 요청 제한
const MAX_CONCURRENCY = 5;
const MAX_BATCH_SIZE = 100;

function getYahooFormattedTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

/**
 * 동시성 제한 병렬 실행기
 * maxConcurrency만큼만 동시에 실행하여 Yahoo API Rate Limit을 보호합니다.
 */
async function parallelWithLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  maxConcurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items: BatchItem[] = body?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { message: 'items 배열이 필요합니다.', code: 'INVALID_INPUT' },
        { status: 400 }
      );
    }

    if (items.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { message: `최대 ${MAX_BATCH_SIZE}개까지 조회할 수 있습니다.`, code: 'BATCH_TOO_LARGE' },
        { status: 400 }
      );
    }

    // 중복 티커 제거 (같은 ticker+exchange 조합)
    const uniqueMap = new Map<string, BatchItem>();
    for (const item of items) {
      const key = `${item.ticker?.toUpperCase()}_${item.exchange?.toUpperCase() || 'NAS'}`;
      if (item.ticker && !uniqueMap.has(key)) {
        uniqueMap.set(key, {
          ticker: item.ticker.toUpperCase(),
          exchange: item.exchange?.toUpperCase() || 'NAS',
        });
      }
    }

    const uniqueItems = Array.from(uniqueMap.values());

    const results = await parallelWithLimit(
      uniqueItems,
      async (item): Promise<SecurityLookupResult> => {
        // 캐시 확인
        const cacheId = cacheKey('security-lookup', item.ticker, item.exchange);
        const cached = cacheGet<SecurityLookupResult>(cacheId);
        if (cached) {
          return cached;
        }

        // Yahoo에서 조회
        const yahooTicker = getYahooFormattedTicker(item.ticker, item.exchange);
        try {
          const profile = await getYahooSecurityProfile(yahooTicker);
          const result: SecurityLookupResult = {
            ticker: item.ticker,
            exchange: item.exchange,
            name: profile?.name ?? null,
            source: profile?.source ?? 'unknown',
          };
          cacheSet(cacheId, result);
          return result;
        } catch {
          return {
            ticker: item.ticker,
            exchange: item.exchange,
            name: null,
            source: 'error',
          };
        }
      },
      MAX_CONCURRENCY
    );

    // ticker → name 맵으로 반환 (클라이언트에서 O(1) 접근)
    const nameMap: Record<string, string | null> = {};
    for (const result of results) {
      nameMap[result.ticker] = result.name;
    }

    return NextResponse.json({
      results,
      nameMap,
      total: results.length,
      cached: results.filter((r) => r.source !== 'error' && r.source !== 'unknown').length,
    });
  } catch (error) {
    console.error('[Security Lookup Batch Error]', error);
    return NextResponse.json(
      { message: '종목명 배치 조회 중 오류가 발생했습니다.', code: 'BATCH_LOOKUP_FAILED' },
      { status: 500 }
    );
  }
}
