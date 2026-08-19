import { withAdminSession } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { calculateLeadershipBreadth } from '@/lib/master-filter/leadership-breadth';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { getSupabaseAdmin } from '@/lib/supabase/server';

const UNIVERSES = {
  US: {
    name: 'AI_TECH_LEADERS',
    index: 'QQQ',
    tickers: ['NVDA', 'MSFT', 'AVGO', 'AMD', 'AMZN', 'GOOGL', 'META', 'ORCL', 'CRM', 'PLTR', 'TSM', 'ASML'],
  },
  KR: {
    name: 'KR_SEMICONDUCTOR_LEADERS',
    index: '^KS200',
    tickers: ['005930.KS', '000660.KS', '042700.KS', '058470.KQ', '403870.KQ', '039030.KQ', '240810.KQ', '036930.KQ'],
  },
} as const;

export const GET = withAdminSession(async (request: Request) => {
  try {
    const market = new URL(request.url).searchParams.get('market') === 'KR' ? 'KR' : 'US';
    const universe = UNIVERSES[market];
    const results = await Promise.allSettled([
      getYahooDailyPrice(universe.index, { range: '2y' }),
      ...universe.tickers.map((ticker) => getYahooDailyPrice(ticker, { range: '2y' })),
    ]);
    const indexBars = results[0].status === 'fulfilled' ? results[0].value : [];
    const constituents = universe.tickers.flatMap((ticker, index) => {
      const result = results[index + 1];
      return result.status === 'fulfilled' ? [{ ticker, bars: result.value }] : [];
    });
    const snapshot = calculateLeadershipBreadth({
      market,
      universe: universe.name,
      constituents,
      indexBars,
      provider: 'Yahoo Finance',
    });
    if (constituents.length < universe.tickers.length) {
      snapshot.warnings.push(`${universe.tickers.length - constituents.length}개 구성종목 가격 조회에 실패했습니다.`);
    }
    const { error: snapshotError } = await getSupabaseAdmin().from('market_breadth_snapshots').upsert({
      market,
      universe: universe.name,
      as_of: snapshot.asOf.slice(0, 10),
      model_version: snapshot.modelVersion,
      provider: snapshot.provider,
      quality: snapshot.quality,
      snapshot,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'market,universe,as_of,model_version' });
    if (snapshotError) snapshot.warnings.push(`스냅샷 저장 실패: ${snapshotError.message}`);
    return apiSuccess(snapshot, { asOf: snapshot.asOf, provider: snapshot.provider, source: 'MTN Breadth Engine' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Breadth 계산에 실패했습니다.'), 'MARKET_BREADTH_FAILED', 500);
  }
});
