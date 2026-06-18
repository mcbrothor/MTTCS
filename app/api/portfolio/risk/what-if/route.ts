import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { buildLivePriceMap } from '@/lib/finance/core/live-trade-pricing';
import { getMtnKrLivePrice, getMtnUsLiveQuotes } from '@/lib/finance/core/live-price-providers';
import { calculatePortfolioRiskSummary } from '@/lib/finance/core/portfolio-risk';
import { calculatePortfolioWhatIf } from '@/lib/finance/core/portfolio-what-if';
import { attachTradeMetrics } from '@/lib/finance/core/trade-metrics';
import { supabaseServer } from '@/lib/supabase/server';
import type { SecurityProfile, Trade } from '@/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const market = body.market === 'KR' ? 'KR' : 'US';
    const candidate = {
      ticker: String(body.ticker || '').trim().toUpperCase(),
      shares: Number(body.shares), entryPrice: Number(body.entryPrice), stopPrice: Number(body.stopPrice),
      sector: typeof body.sector === 'string' ? body.sector : null,
    };
    if (!candidate.ticker || !Number.isFinite(candidate.shares) || candidate.shares <= 0 || candidate.stopPrice <= 0 || candidate.entryPrice <= candidate.stopPrice) {
      return apiError('유효한 ticker, shares, entryPrice, stopPrice가 필요합니다.', 'INVALID_INPUT', 400);
    }
    const [{ data: rows, error }, { data: settings }, { data: profiles }] = await Promise.all([
      supabaseServer.from('trades').select('*, trade_executions(*)').eq('status', 'ACTIVE'),
      supabaseServer.from('portfolio_settings').select('*').eq('market', market).maybeSingle(),
      supabaseServer.from('security_profiles').select('*').eq('market', market),
    ]);
    if (error) throw error;
    const scoped = ((rows || []) as unknown as Trade[]).filter((trade) => market === 'KR' ? /^\d{6}$/.test(trade.ticker) : !/^\d{6}$/.test(trade.ticker));
    const prices = await buildLivePriceMap(scoped, { getUsQuotes: getMtnUsLiveQuotes, getKrPrice: getMtnKrLivePrice });
    const trades = scoped.map((trade) => attachTradeMetrics(trade, prices.get(trade.ticker) || null));
    const summary = calculatePortfolioRiskSummary(trades, Number(settings?.total_equity || 0), (profiles || []) as SecurityProfile[], market);
    return apiSuccess(calculatePortfolioWhatIf(summary, candidate), { source: 'MTN portfolio what-if', provider: 'MTN', delay: 'REALTIME', modelVersion: 'portfolio-risk-2026.06-v1' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'What-if 계산 실패'), 'API_ERROR', 500);
  }
}
