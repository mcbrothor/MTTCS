import { NextResponse } from 'next/server';
import { cacheGet, cacheKey, cacheSet } from '@/lib/cache';
import { getScannerUniverse } from '@/lib/finance/market/scanner-universes';
import type { ScannerUniverse, ScannerUniverseResponse } from '@/types';

const UNIVERSE_TTL_MS = 30 * 60 * 1000;

function apiError(message: string, code: string, status = 500) {
  return NextResponse.json({ message, code, recoverable: status < 500 }, { status });
}

function parseUniverse(value: string | null): ScannerUniverse | null {
  if (value === 'NASDAQ100' || value === 'SP500' || value === 'KOSPI200' || value === 'KOSDAQ150') return value;
  if (value === 'KOSPI100') return 'KOSPI200';
  if (value === 'KOSDAQ100') return 'KOSDAQ150';
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const universe = parseUniverse(searchParams.get('universe'));

  if (!universe) {
    return apiError('지원하는 종목군은 NASDAQ100, SP500, KOSPI200, KOSDAQ150입니다.', 'INVALID_UNIVERSE', 400);
  }

  try {
    const key = cacheKey('scanner-universe', universe);
    const cached = cacheGet<ScannerUniverseResponse>(key);
    if (cached) return NextResponse.json(cached);

    const response = await getScannerUniverse(universe);
    cacheSet(key, response, UNIVERSE_TTL_MS);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : '종목군을 불러오지 못했습니다.';
    return apiError(message, 'UNIVERSE_FETCH_FAILED', 500);
  }
}
