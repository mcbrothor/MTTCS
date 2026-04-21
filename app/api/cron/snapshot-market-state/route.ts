import { NextResponse } from 'next/server';
import { validateCronRequest } from '@/lib/contest-cron';
import { apiError } from '@/lib/api/response';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getYahooDailyPrice, getYahooQuotes } from '@/lib/finance/providers/yahoo-api';
import { computeP3 } from '@/lib/master-filter/compute';
import { computeMacroScore } from '@/lib/macro/compute';
import type { OHLCData } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const US_MACRO_SYMBOLS = [
  '^VIX', 'UUP', 'SHY', 'TLT', 'HYG', 'IEF',
  'QQQ', 'SPY', 'DIA', 'IWM', 'RSP',
  'GLD', 'CPER',
];

const US_SECTOR_ETFS = ['XLK', 'XLY', 'XLC', 'XLI', 'XLF', 'XLV', 'XLE', 'XLP', 'XLU', 'XLB'];
const US_BREADTH_ETFS = ['SPY', 'QQQ', 'DIA', 'IWM', 'RSP'];
const US_RISK_ON_SECTORS = new Set(['XLK', 'XLY', 'XLC', 'XLI', 'XLF']);
const US_SECTOR_NAMES: Record<string, string> = {
  XLK: 'Technology', XLY: 'Consumer Discretionary', XLC: 'Communication Services',
  XLI: 'Industrials', XLF: 'Financials', XLV: 'Health Care',
  XLE: 'Energy', XLP: 'Consumer Staples', XLU: 'Utilities', XLB: 'Materials',
};

const KR_SECTOR_ETFS = ['455850.KS', '305720.KS', '123310.KS', '244580.KS', '091220.KS', '117680.KS', '117700.KS', '139260.KS'];
const KR_BREADTH_ETFS = ['^KS200', '^KQ150', '069500.KS'];
const KR_RISK_ON_SECTORS = new Set(['455850.KS', '305720.KS', '123310.KS', '139260.KS']);
const KR_SECTOR_NAMES: Record<string, string> = {
  '455850.KS': '반도체', '305720.KS': '2차전지', '123310.KS': '자동차',
  '244580.KS': '바이오', '091220.KS': '은행', '117680.KS': '철강',
  '117700.KS': '화학/건설', '139260.KS': 'IT',
};

async function safeDaily(symbol: string): Promise<OHLCData[]> {
  return getYahooDailyPrice(symbol).catch(() => []);
}

function percentReturn(data: { close: number }[], lookback: number) {
  if (data.length <= lookback) return null;
  const start = data[data.length - lookback - 1]?.close;
  const end = data.at(-1)?.close;
  if (!start || !end) return null;
  return ((end - start) / start) * 100;
}

function movingAverage(data: { close: number }[], period: number) {
  if (data.length < period) return null;
  return data.slice(-period).reduce((sum, d) => sum + d.close, 0) / period;
}

async function snapshotMasterFilter(market: 'US' | 'KR', calcDate: string) {
  const sectorEtfs = market === 'KR' ? KR_SECTOR_ETFS : US_SECTOR_ETFS;
  const breadthEtfs = market === 'KR' ? KR_BREADTH_ETFS : US_BREADTH_ETFS;
  const riskOnSectors = market === 'KR' ? KR_RISK_ON_SECTORS : US_RISK_ON_SECTORS;
  const sectorNames = market === 'KR' ? KR_SECTOR_NAMES : US_SECTOR_NAMES;
  const mainSymbol = market === 'KR' ? '^KS200' : 'SPY';

  const [mainData, vixData, breadthSeries, sectorSeries] = await Promise.all([
    safeDaily(mainSymbol),
    safeDaily('^VIX'),
    Promise.all(breadthEtfs.map(async (s) => [s, await safeDaily(s)] as const)),
    Promise.all(sectorEtfs.map(async (s) => [s, await safeDaily(s)] as const)),
  ]);

  if (mainData.length < 200) throw new Error(`${mainSymbol} 200일 데이터 부족`);

  const breadthRows = breadthSeries
    .filter(([, d]) => d.length >= 200)
    .map(([symbol, d]) => ({
      symbol,
      above200: d.at(-1)!.close > (movingAverage(d, 200) ?? Infinity),
      return20: percentReturn(d, 20) ?? 0,
    }));

  const sectorRows = sectorSeries
    .filter(([, d]) => d.length >= 21)
    .map(([symbol, d], i) => ({
      symbol,
      name: sectorNames[symbol] || symbol,
      return20: percentReturn(d, 20) ?? 0,
      riskOn: riskOnSectors.has(symbol),
      rank: i + 1,
    }))
    .sort((a, b) => b.return20 - a.return20)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const result = computeP3(mainData, vixData, breadthRows, sectorRows, mainSymbol, breadthEtfs);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('master_filter_snapshot').upsert({
    calc_date: calcDate,
    market,
    p3_score: result.p3Score,
    state: result.state,
    trend_score: result.trendScore,
    breadth_score: result.breadthScore,
    volatility_score: result.volatilityScore,
    liquidity_score: result.liquidityScore,
    ftd_score: result.ftdScore,
    distribution_score: result.distributionScore,
    nhnl_score: result.newHighLowScore,
    above200_score: result.above200Score,
    sector_score: result.sectorScore,
  }, { onConflict: 'calc_date,market' });

  if (error) throw new Error(`master_filter_snapshot upsert error: ${error.message}`);
  return { p3Score: result.p3Score, state: result.state };
}

async function snapshotMacro(calcDate: string) {
  const quotes = await getYahooQuotes(US_MACRO_SYMBOLS).catch(() => []);
  const quotesMap = quotes.reduce((acc, q) => {
    acc[q.symbol] = q;
    return acc;
  }, {} as Record<string, typeof quotes[number]>);

  const result = computeMacroScore(quotesMap);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('macro_snapshot').upsert({
    calc_date: calcDate,
    macro_score: result.macroScore,
    regime: result.regime,
    spy_above_50ma: result.spyAbove50ma,
    hyg_ief_diff: result.hygIefDiff,
    vix_level: result.vixLevel,
    trend_score: result.componentScores.trendScore,
    credit_score: result.componentScores.creditScore,
    volatility_score: result.componentScores.volatilityScore,
    dollar_rate_score: result.componentScores.dollarRateScore,
    econ_sensitivity_score: result.componentScores.econSensitivityScore,
    breadth_score: result.componentScores.breadthScore,
    raw_json: { breakdown: result.breakdown },
  }, { onConflict: 'calc_date' });

  if (error) throw new Error(`macro_snapshot upsert error: ${error.message}`);
  return { macroScore: result.macroScore, regime: result.regime };
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') ?? 'master-filter';
  const market = (searchParams.get('market')?.toUpperCase() ?? 'US') as 'US' | 'KR';
  const calcDate = searchParams.get('calcDate') ?? new Date().toISOString().slice(0, 10);

  try {
    if (type === 'macro') {
      const data = await snapshotMacro(calcDate);
      return NextResponse.json({ data });
    }
    const data = await snapshotMasterFilter(market, calcDate);
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : '스냅샷 저장 중 오류가 발생했습니다.';
    console.error('[snapshot-market-state]', error);
    return NextResponse.json({ message, code: 'API_ERROR' }, { status: 500 });
  }
}
