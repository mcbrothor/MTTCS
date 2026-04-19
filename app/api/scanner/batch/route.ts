import { NextResponse } from 'next/server';
import { GET as getMarketData } from '@/app/api/market-data/route';
import type { MarketAnalysisResponse, ProviderAttempt } from '@/types';

// =============================================
// 스캐너 분석 데이터 서버사이드 배치 처리 API
// =============================================
// 클라이언트에서 100번에 달하는 N+1 호출 부하를 줄이기 위해,
// 10~20개 단위의 청크(chunk)를 서버에서 병렬 처리하여 반환합니다.

interface BatchItem {
  ticker: string;
  exchange: string;
  currentPrice: number | null;
  priceAsOf: string;
  priceSource: string;
}

interface ScannerBatchRequest {
  items: BatchItem[];
  totalEquity: number;
  riskPercent: number;
}

const MAX_BATCH_SIZE = 20;
const CONCURRENCY_LIMIT = 5;

// 프로미스를 동시성 제어 하에 병렬 실행하는 헬퍼
async function parallelWithLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
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
    const body = await request.json() as ScannerBatchRequest;
    const { items, totalEquity, riskPercent } = body;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ message: 'items 배열이 필요합니다.', code: 'INVALID_INPUT' }, { status: 400 });
    }

    if (items.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ message: `최대 ${MAX_BATCH_SIZE}개까지 요청 가능합니다.`, code: 'PAYLOAD_TOO_LARGE' }, { status: 400 });
    }

    // 서버사이드 루프: N+1 문제를 Vercel 내부에서 자체 처리 (네트워킹 오버헤드 감소)
    const results = await parallelWithLimit(items, async (item) => {
      try {
        const url = new URL(`http://localhost/api/market-data`);
        url.searchParams.set('ticker', item.ticker);
        url.searchParams.set('exchange', item.exchange);
        url.searchParams.set('totalEquity', String(totalEquity));
        url.searchParams.set('riskPercent', String(riskPercent));
        url.searchParams.set('includeFundamentals', 'true');

        // Next.js API 핸들러 직접 호출 (HTTP 오버헤드 없음)
        const mockReq = new Request(url);
        const res = await getMarketData(mockReq);
        
        if (!res.ok) {
           const errBody = await res.text();
           let parsedErr;
           try { parsedErr = JSON.parse(errBody); } catch { parsedErr = { message: errBody }; }
           return {
             ticker: item.ticker,
             success: false,
             error: parsedErr.message || `요청 실패 (${res.status})`,
             providerAttempts: parsedErr.details?.providerAttempts || []
           };
        }

        const data = await res.json() as MarketAnalysisResponse;
        return {
           ticker: item.ticker,
           success: true,
           data
        };
      } catch (err: unknown) {
        return {
          ticker: item.ticker,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
          providerAttempts: []
        };
      }
    }, CONCURRENCY_LIMIT);

    return NextResponse.json({ results });
  } catch (error: unknown) {
    console.error('[Scanner Batch Error]', error);
    return NextResponse.json(
      { message: '배치 분석 중 치명적 오류 발생', code: 'BATCH_FATAL_ERROR' },
      { status: 500 }
    );
  }
}
