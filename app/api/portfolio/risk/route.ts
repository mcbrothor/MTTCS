import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getMtnKrLivePrice, getMtnUsLiveQuotes } from '@/lib/finance/core/live-price-providers';
import { buildLivePriceMap } from '@/lib/finance/core/live-trade-pricing';
import { calculatePortfolioRiskSummary } from '@/lib/finance/core/portfolio-risk';
import { attachTradeMetrics } from '@/lib/finance/core/trade-metrics';
import { getTossHoldings, isTossInvestConfigured, type TossHoldingPosition } from '@/lib/finance/providers/toss-api';
import { getYahooFundamentals, getYahooSecurityProfile, getYahooQuotes } from '@/lib/finance/providers/yahoo-api';
import { supabaseServer } from '@/lib/supabase/server';
import type { SecurityProfile, Trade } from '@/types';
import { recordPipelineRun } from '@/lib/data/pipeline-health';

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

function yahooTickerForProfile(ticker: string, market: 'US' | 'KR', exchange?: string | null) {
  if (market === 'KR') return `${ticker}.${exchange === 'KOSDAQ' ? 'KQ' : 'KS'}`;
  return ticker;
}

async function fetchProfileFromPublicSources(
  holding: TossHoldingPosition,
  market: 'US' | 'KR',
  existing?: SecurityProfile
): Promise<SecurityProfile> {
  const ticker = holding.symbol.toUpperCase();
  const yahooTicker = yahooTickerForProfile(ticker, market, existing?.exchange);
  const [security, fundamentals] = await Promise.all([
    getYahooSecurityProfile(yahooTicker).catch(() => null),
    getYahooFundamentals(yahooTicker).catch(() => null),
  ]);

  return {
    ticker,
    exchange: security?.exchangeName || existing?.exchange || market,
    name: security?.name || existing?.name || holding.name || ticker,
    sector: fundamentals?.sector || existing?.sector || null,
    industry: fundamentals?.industry || existing?.industry || null,
    market,
  };
}

async function enrichTossSecurityProfiles(
  holdings: TossHoldingPosition[],
  profiles: SecurityProfile[],
  market: 'US' | 'KR'
) {
  const byTicker = new Map(profiles.map((profile) => [profile.ticker.toUpperCase(), profile]));
  const targets = holdings.filter((holding) => {
    const profile = byTicker.get(holding.symbol.toUpperCase());
    return !profile || !profile.name || !profile.sector;
  });

  if (targets.length === 0) return profiles;

  const enriched = await Promise.all(targets.map((holding) =>
    fetchProfileFromPublicSources(holding, market, byTicker.get(holding.symbol.toUpperCase()))
  ));

  const now = new Date().toISOString();
  const { error } = await supabaseServer.from('security_profiles').upsert(
    enriched.map((profile) => ({ ...profile, updated_at: now })),
    { onConflict: 'ticker' }
  );
  if (error) {
    console.warn('[portfolio-risk] security profile enrichment cache write failed:', error.message);
  }

  for (const profile of enriched) {
    byTicker.set(profile.ticker.toUpperCase(), profile);
  }

  return Array.from(byTicker.values());
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawMarket = searchParams.get('market')?.toUpperCase() || 'US';
    if (rawMarket === 'ALL') {
      const baseCurrency = searchParams.get('baseCurrency') === 'USD' ? 'USD' : 'KRW';
      const [{ data: allRows, error }, { data: allSettings }, { data: allProfiles }, fxQuotes] = await Promise.all([
        supabaseServer.from('trades').select('*, trade_executions(*)').in('status', ['ACTIVE', 'PLANNED']),
        supabaseServer.from('portfolio_settings').select('*').in('market', ['US', 'KR']),
        supabaseServer.from('security_profiles').select('*').in('market', ['US', 'KR']),
        getYahooQuotes(['KRW=X']).catch(() => []),
      ]);
      if (error) throw error;
      const rows = (allRows || []) as unknown as (Trade & { trade_executions?: Trade['executions'] })[];
      const profiles = (allProfiles || []) as SecurityProfile[];
      const settingsByMarket = new Map((allSettings || []).map((row) => [row.market, Number(row.total_equity || 0)]));
      const fx = Number(fxQuotes[0]?.regularMarketPrice || 0);
      const summaries = {} as Record<'US' | 'KR', ReturnType<typeof calculatePortfolioRiskSummary>>;
      for (const itemMarket of ['US', 'KR'] as const) {
        const scoped = scopeTradesByMarket(rows, itemMarket);
        const priceMap = await buildLivePriceMap(scoped, { getUsQuotes: getMtnUsLiveQuotes, getKrPrice: getMtnKrLivePrice });
        const enriched = scoped.map((trade) => {
          const { trade_executions: executions, ...rest } = trade;
          return attachTradeMetrics({ ...rest, executions: executions || [] } as Trade, trade.status === 'ACTIVE' ? priceMap.get(trade.ticker) || null : null);
        });
        summaries[itemMarket] = calculatePortfolioRiskSummary(enriched, settingsByMarket.get(itemMarket) || 0, profiles.filter((profile) => profile.market === itemMarket), itemMarket);
      }
      const fxValid = fx > 0;
      const usFactor = baseCurrency === 'KRW' ? fx : 1;
      const krFactor = baseCurrency === 'USD' ? (fxValid ? 1 / fx : 0) : 1;
      const convert = (value: number, market: 'US' | 'KR') => value * (market === 'US' ? usFactor : krFactor);
      const totalEquity = convert(summaries.US.totalEquity, 'US') + convert(summaries.KR.totalEquity, 'KR');
      const marketValue = convert(summaries.US.marketValue || 0, 'US') + convert(summaries.KR.marketValue || 0, 'KR');
      const totalOpenRisk = convert(summaries.US.totalOpenRisk, 'US') + convert(summaries.KR.totalOpenRisk, 'KR');
      const unknownRiskPositions = (summaries.US.unknownRiskPositions || 0) + (summaries.KR.unknownRiskPositions || 0) + (fxValid ? 0 : 1);
      return apiSuccess({
        baseCurrency,
        fx: { pair: 'USD/KRW', rate: fxValid ? fx : null, status: fxValid ? 'LIVE' : 'UNKNOWN' },
        combined: {
          totalEquity: Number(totalEquity.toFixed(2)), marketValue: Number(marketValue.toFixed(2)),
          cash: Number(Math.max(totalEquity - marketValue, 0).toFixed(2)), totalOpenRisk: Number(totalOpenRisk.toFixed(2)),
          portfolioHeatPct: totalEquity > 0 ? Number((totalOpenRisk / totalEquity * 100).toFixed(2)) : 0,
          activePositions: summaries.US.activePositions + summaries.KR.activePositions, unknownRiskPositions,
          decisionStatus: unknownRiskPositions ? 'BLOCKED' : 'VALID',
        },
        markets: summaries,
      }, {
        source: 'Supabase trades + KIS/Yahoo prices', provider: 'MTN Aggregator', delay: 'REALTIME',
        fallbackUsed: !fxValid, fallbackReason: fxValid ? null : 'USD/KRW 환율 누락', modelVersion: 'portfolio-risk-2026.06-v1',
      });
    }
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
          const profileRows = await enrichTossSecurityProfiles(
            holdings.positions,
            (profiles || []) as SecurityProfile[],
            market
          );
          const profilesByTicker = new Map(profileRows.map((profile) => [String(profile.ticker).toUpperCase(), profile]));
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
          await recordPipelineRun({ pipeline: 'portfolio-risk', provider: 'Toss Securities', market, status: summary.unknownRiskPositions ? 'DEGRADED' : 'SUCCESS', observedAt: holdings.asOf, fallbackUsed: false, metadata: { positions: summary.activePositions } }).catch(() => undefined);

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
    await recordPipelineRun({ pipeline: 'portfolio-risk', provider: 'Supabase+KIS', market, status: summary.unknownRiskPositions ? 'DEGRADED' : 'SUCCESS', observedAt: new Date().toISOString(), fallbackUsed: false, metadata: { positions: summary.activePositions } }).catch(() => undefined);

    return apiSuccess(summary, {
      source: 'Supabase trades + portfolio_settings',
      provider: 'Supabase',
      delay: 'REALTIME',
    });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Failed to calculate portfolio risk.'), 'API_ERROR', 500);
  }
}
