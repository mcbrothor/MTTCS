import { NextResponse } from 'next/server';
import { fetchLatestMacroTrend, fetchLatestStockMetrics, macroIndexForUniverse, marketForUniverse } from '@/lib/finance/market/stock-metrics';
import type { ScannerUniverse } from '@/types';

function parseUniverse(value: string | null): ScannerUniverse | null {
  if (value === 'NASDAQ100' || value === 'SP500' || value === 'KOSPI100' || value === 'KOSDAQ100') return value;
  return null;
}

function apiError(message: string, code: string, status = 500) {
  return NextResponse.json({ message, code, recoverable: status < 500 }, { status });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const universe = parseUniverse(searchParams.get('universe'));
  const tickers = (searchParams.get('tickers') || '')
    .split(',')
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);

  if (!universe) return apiError('Invalid scanner universe.', 'INVALID_UNIVERSE', 400);
  if (tickers.length === 0) return apiError('tickers query parameter is required.', 'MISSING_TICKERS', 400);

  try {
    const market = marketForUniverse(universe);
    const [metrics, macroTrend] = await Promise.all([
      fetchLatestStockMetrics(tickers, market),
      fetchLatestMacroTrend(market, macroIndexForUniverse(universe)),
    ]);

    return NextResponse.json({
      market,
      macroTrend,
      metrics: tickers.map((ticker) => ({ ticker, metric: metrics.get(ticker) || null })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scanner metrics could not be loaded.';
    return apiError(message, 'SCANNER_METRICS_FAILED', 500);
  }
}
