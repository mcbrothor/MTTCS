import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { buildLivePriceMap } from '@/lib/finance/core/live-trade-pricing';
import { calculatePortfolioRiskSummary } from '@/lib/finance/core/portfolio-risk';
import { attachTradeMetrics } from '@/lib/finance/core/trade-metrics';
import { getKisDomesticPrice } from '@/lib/finance/providers/kis-api';
import { getYahooQuotes } from '@/lib/finance/providers/yahoo-api';
import { supabaseServer } from '@/lib/supabase/server';
import type { SecurityProfile, Trade } from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market') === 'KR' ? 'KR' : 'US';
    const fallbackEquity = Number(searchParams.get('totalEquity') || 0);

    const [{ data: tradeRows, error: tradeError }, { data: settings }, { data: profiles }] = await Promise.all([
      supabaseServer.from('trades').select('*, trade_executions(*)').in('status', ['ACTIVE', 'PLANNED']),
      supabaseServer.from('portfolio_settings').select('*').eq('market', market).maybeSingle(),
      supabaseServer.from('security_profiles').select('*').eq('market', market),
    ]);

    if (tradeError) throw tradeError;

    const isKorean = (ticker: string) => /^\d{6}$/.test(ticker);
    const scopedTrades = ((tradeRows || []) as unknown as (Trade & { trade_executions?: Trade['executions'] })[])
      .filter((trade) => market === 'KR' ? isKorean(trade.ticker) : !isKorean(trade.ticker));
    const priceMap = await buildLivePriceMap(scopedTrades, {
      getUsQuotes: getYahooQuotes,
      getKrPrice: getKisDomesticPrice,
    });
    const trades = scopedTrades.map((trade) => {
        const { trade_executions: tradeExecutions, ...rest } = trade;
        const currentPrice = trade.status === 'ACTIVE' ? (priceMap.get(trade.ticker) || null) : null;
        return attachTradeMetrics({ ...rest, executions: tradeExecutions || [] } as Trade, currentPrice);
      });

    const totalEquity = Number(settings?.total_equity || fallbackEquity);
    const summary = calculatePortfolioRiskSummary(trades, totalEquity, (profiles || []) as SecurityProfile[], market);

    return apiSuccess(summary, {
      source: 'Supabase trades + portfolio_settings',
      provider: 'Supabase',
      delay: 'REALTIME',
    });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to calculate portfolio risk.'), 'API_ERROR', 500);
  }
}
