import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/contest-cron';
import { finalizeRsMetrics, runRsMetricsChunk } from '@/lib/finance/market/stock-metrics';
import type { MarketCode } from '@/types';

function parseMarket(value: string | null): MarketCode[] | null {
  if (!value || value === 'ALL') return ['KR', 'US'];
  if (value === 'KR' || value === 'US') return [value];
  return null;
}

function parseMode(value: string | null) {
  if (value === 'enqueue' || value === 'chunk' || value === 'finalize') return value;
  return 'enqueue';
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);

  const { searchParams } = new URL(request.url);
  const markets = parseMarket(searchParams.get('market'));
  const mode = parseMode(searchParams.get('mode'));
  const calcDate = searchParams.get('calcDate') || new Date().toISOString().slice(0, 10);
  const chunkSize = Math.max(1, Math.min(100, Number(searchParams.get('chunkSize') || 50)));
  const chunkIndex = Math.max(0, Number(searchParams.get('chunk') || searchParams.get('chunkIndex') || 0));

  if (!markets) return apiError('market must be KR, US, or ALL.', 'INVALID_MARKET', 400);

  try {
    if (mode === 'enqueue') {
      return apiSuccess({
        mode,
        calcDate,
        markets,
        chunkSize,
        instructions: 'Call mode=chunk with chunk=0..N for each market, then mode=finalize for the same calcDate.',
        next: markets.map((market) => ({ market, mode: 'chunk', chunk: 0, chunkSize, calcDate })),
      }, { source: 'MTN RS cron', provider: 'MTN', delay: 'EOD' });
    }

    const results = [];
    for (const market of markets) {
      if (mode === 'chunk') {
        results.push(await runRsMetricsChunk({ market, calcDate, chunkIndex, chunkSize }));
      } else {
        results.push(await finalizeRsMetrics(market, calcDate));
      }
    }

    return apiSuccess({ mode, calcDate, results }, { source: 'MTN RS cron', provider: 'MTN', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'RS metrics cron failed.'), 'API_ERROR', 500);
  }
}
