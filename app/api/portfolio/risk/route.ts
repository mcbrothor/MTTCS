import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getMtnKrLivePrice, getMtnUsLiveQuotes } from '@/lib/finance/core/live-price-providers';
import { buildLivePriceMap } from '@/lib/finance/core/live-trade-pricing';
import { calculatePortfolioRiskSummary } from '@/lib/finance/core/portfolio-risk';
import { attachTradeMetrics } from '@/lib/finance/core/trade-metrics';
import { getTossHoldings, isTossInvestConfigured, type TossHoldingPosition } from '@/lib/finance/providers/toss-api';
import { supabaseServer } from '@/lib/supabase/server';
import type { SecurityProfile, Trade } from '@/types';

function isKoreanTicker(ticker: string) {
  return /^\d{6}$/.test(ticker);
}

function scopeTradesByMarket(trades: (Trade & { trade_executions?: Trade['executions'] })[], market: 'US' | 'KR') {
  return trades.filter((trade) => market === 'KR' ? isKoreanTicker(trade.ticker) : !isKoreanTicker(trade.ticker));
}

function baseTradeFromHolding(
  holding: TossHoldingPosition,
  existing: (Trade & { trade_executions?: Trade['executions'] }) | undefined,
  now: string
): Trade {
  const entryPrice = holding.avgPrice ?? existing?.entry_price ?? holding.currentPrice ?? null;
  const currentPrice = holding.currentPrice ?? null;
  const executions = [
    {
      id: `toss-${holding.symbol}-entry`,
      trade_id: existing?.id || `toss-${holding.symbol}`,
      created_at: now,
      updated_at: now,
      side: 'ENTRY' as const,
      executed_at: now,
      price: entryPrice || currentPrice || 0,
      shares: holding.quantity,
      fees: 0,
      leg_label: 'MANUAL' as const,
      note: 'Toss Securities synced holding',
    },
  ].filter((execution) => execution.price > 0);

  return {
    id: existing?.id || `toss-${holding.symbol}`,
    created_at: existing?.created_at || now,
    updated_at: now,
    ticker: holding.symbol,
    direction: existing?.direction || 'LONG',
    status: 'ACTIVE',
    chk_sepa: existing?.chk_sepa ?? false,
    chk_market: existing?.chk_market ?? false,
    chk_risk: existing?.chk_risk ?? false,
    chk_entry: existing?.chk_entry ?? false,
    chk_stoploss: existing?.chk_stoploss ?? false,
    chk_exit: existing?.chk_exit ?? false,
    chk_psychology: existing?.chk_psychology ?? false,
    sepa_evidence: existing?.sepa_evidence ?? null,
    total_equity: existing?.total_equity ?? null,
    planned_risk: existing?.planned_risk ?? null,
    risk_percent: existing?.risk_percent ?? null,
    atr_value: existing?.atr_value ?? null,
    entry_price: entryPrice,
    stoploss_price: existing?.stoploss_price ?? null,
    position_size: holding.quantity,
    total_shares: holding.quantity,
    entry_targets: existing?.entry_targets ?? null,
    trailing_stops: existing?.trailing_stops ?? null,
    risk_strategy: existing?.risk_strategy ?? null,
    requested_risk_strategy: existing?.requested_risk_strategy ?? null,
    risk_gate: existing?.risk_gate ?? null,
    risk_policy_snapshot: existing?.risk_policy_snapshot ?? null,
    exit_price: existing?.exit_price ?? null,
    exit_reason: existing?.exit_reason ?? null,
    result_amount: existing?.result_amount ?? null,
    final_discipline: existing?.final_discipline ?? null,
    emotion_note: existing?.emotion_note ?? null,
    setup_tags: existing?.setup_tags ?? null,
    mistake_tags: existing?.mistake_tags ?? null,
    plan_note: existing?.plan_note ?? null,
    invalidation_note: existing?.invalidation_note ?? null,
    review_note: existing?.review_note ?? null,
    review_action: existing?.review_action ?? null,
    entry_snapshot: existing?.entry_snapshot ?? null,
    contest_snapshot: existing?.contest_snapshot ?? null,
    llm_verdict: existing?.llm_verdict ?? null,
    executions,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const market = searchParams.get('market') === 'KR' ? 'KR' : 'US';
    const source = searchParams.get('source') || searchParams.get('broker') || 'auto';
    const preferToss = source !== 'supabase' && isTossInvestConfigured();
    const fallbackEquity = Number(searchParams.get('totalEquity') || 0);

    const [{ data: tradeRows, error: tradeError }, { data: settings }, { data: profiles }] = await Promise.all([
      supabaseServer.from('trades').select('*, trade_executions(*)').in('status', ['ACTIVE', 'PLANNED']),
      supabaseServer.from('portfolio_settings').select('*').eq('market', market).maybeSingle(),
      supabaseServer.from('security_profiles').select('*').eq('market', market),
    ]);

    if (tradeError) throw tradeError;

    const scopedTrades = scopeTradesByMarket(
      (tradeRows || []) as unknown as (Trade & { trade_executions?: Trade['executions'] })[],
      market
    );

    if (preferToss) {
      try {
        const holdings = await getTossHoldings(market);
        if (holdings.positions.length > 0) {
          const existingByTicker = new Map(scopedTrades.map((trade) => [trade.ticker.toUpperCase(), trade]));
          const now = new Date().toISOString();
          const trades = holdings.positions.map((holding) => {
            const trade = baseTradeFromHolding(holding, existingByTicker.get(holding.symbol.toUpperCase()), now);
            return attachTradeMetrics(trade, holding.currentPrice ?? null);
          });
          const profilesByTicker = new Map((profiles || []).map((profile) => [String(profile.ticker).toUpperCase(), profile]));
          const profileRows = [...(profiles || [])] as SecurityProfile[];
          for (const holding of holdings.positions) {
            if (!profilesByTicker.has(holding.symbol.toUpperCase())) {
              profileRows.push({
                ticker: holding.symbol,
                exchange: market,
                name: holding.name,
                sector: null,
                industry: null,
                market,
              } as SecurityProfile);
            }
          }
          const invested = holdings.positions.reduce((sum, holding) => {
            const value = holding.evaluationAmount ?? ((holding.currentPrice ?? holding.avgPrice ?? 0) * holding.quantity);
            return sum + value;
          }, 0);
          const totalEquity = Number(holdings.totalEquity || settings?.total_equity || fallbackEquity || invested + (holdings.cash || 0));
          const summary = calculatePortfolioRiskSummary(trades, totalEquity, profileRows, market);
          if (trades.some((trade) => !trade.stoploss_price)) {
            summary.warnings.push('Toss 보유 종목 중 MTN 손절가가 없는 포지션은 오픈 리스크가 0으로 계산됩니다.');
          }

          return apiSuccess(summary, {
            source: 'Toss Securities holdings + MTN trade plans',
            provider: 'Toss Securities',
            delay: 'REALTIME',
            warnings: holdings.asOf ? [`Toss holdings as of ${holdings.asOf}`] : [],
          });
        }
      } catch (error) {
        if (source === 'toss') throw error;
      }
    }

    const priceMap = await buildLivePriceMap(scopedTrades, {
      getUsQuotes: getMtnUsLiveQuotes,
      getKrPrice: getMtnKrLivePrice,
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
