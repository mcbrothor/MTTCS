import { NextResponse } from 'next/server';
import { fetchLatestMacroTrend, fetchLatestStockMetrics, macroIndexForUniverse, marketForUniverse } from '@/lib/finance/market/stock-metrics';
import { supabaseServer } from '@/lib/supabase/server';
import type { ScannerUniverse } from '@/types';

function parseUniverse(value: string | null): ScannerUniverse | null {
  if (value === 'NASDAQ100' || value === 'SP500' || value === 'KOSPI200' || value === 'KOSDAQ150') return value;
  if (value === 'KOSPI100') return 'KOSPI200';
  if (value === 'KOSDAQ100') return 'KOSDAQ150';
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
    const [metrics, macroTrend, profilesResult] = await Promise.all([
      fetchLatestStockMetrics(tickers, market),
      fetchLatestMacroTrend(market, macroIndexForUniverse(universe)),
      supabaseServer
        .from('security_profiles')
        .select('ticker, sector')
        .in('ticker', tickers)
        .then((res) => res.data || []),
    ]);

    const sectorByTicker = new Map<string, string | null>(
      profilesResult.map((p: { ticker: string; sector: string | null }) => [p.ticker, p.sector])
    );

    return NextResponse.json({
      market,
      macroTrend,
      metrics: tickers.map((ticker) => ({
        ticker,
        metric: metrics.get(ticker) || null,
        sector: sectorByTicker.get(ticker) ?? null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scanner metrics could not be loaded.';
    return apiError(message, 'SCANNER_METRICS_FAILED', 500);
  }
}
