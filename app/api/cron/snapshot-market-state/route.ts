import { NextResponse } from 'next/server';
import { validateCronRequest } from '@/lib/contest-cron';
import { apiError } from '@/lib/api/response';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getKisMarketForeignNetBuy } from '@/lib/finance/providers/kis-api';
import { computeP3 } from '@/lib/master-filter/compute';
import {
  getMasterFilterDailyPrice,
  selectFreshestSufficientHistory,
} from '@/lib/master-filter/price-history';
import { buildSectorRows } from '@/lib/master-filter/sector-rows';
import { buildMacroSnapshotRow, fetchMacroAssessment } from '@/lib/macro/service';
import type { OHLCData } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const US_SECTOR_ETFS = ['XLK', 'XLY', 'XLC', 'XLI', 'XLF', 'XLV', 'XLE', 'XLP', 'XLU', 'XLB'];
const US_BREADTH_ETFS = ['SPY', 'QQQ', 'DIA', 'IWM', 'RSP'];
const US_RISK_ON_SECTORS = new Set(['XLK', 'XLY', 'XLC', 'XLI', 'XLF']);
const US_SECTOR_NAMES: Record<string, string> = {
  XLK: 'Technology', XLY: 'Consumer Discretionary', XLC: 'Communication Services',
  XLI: 'Industrials', XLF: 'Financials', XLV: 'Health Care',
  XLE: 'Energy', XLP: 'Consumer Staples', XLU: 'Utilities', XLB: 'Materials',
};

const KR_SECTOR_ETFS = ['455850.KS', '305720.KS', '091180.KS', '244580.KS', '091220.KS', '117680.KS', '117700.KS', '139260.KS'];
const KR_BREADTH_ETFS = ['^KS200', '^KS11', '^KQ11', '069500.KS'];
const KR_RISK_ON_SECTORS = new Set(['455850.KS', '305720.KS', '091180.KS', '139260.KS']);
const KR_SECTOR_NAMES: Record<string, string> = {
  '455850.KS': '반도체', '305720.KS': '2차전지', '091180.KS': '자동차',
  '244580.KS': '바이오', '091220.KS': '은행', '117680.KS': '철강',
  '117700.KS': '건설', '139260.KS': 'IT',
};

type RecommendationStateCategory = 'NASDAQ100' | 'SP500' | 'KOSPI200' | 'KOSDAQ150';

interface CategorySnapshotConfig {
  category: RecommendationStateCategory;
  market: 'US' | 'KR';
  benchmarkSymbol: string;
  mainSymbols: string[];
  breadthEtfs: string[];
  sectorEtfs: string[];
  riskOnSectors: Set<string>;
  sectorNames: Record<string, string>;
  kisMarket?: 'KOSPI' | 'KOSDAQ';
}

const CATEGORY_SNAPSHOT_CONFIG: Record<RecommendationStateCategory, CategorySnapshotConfig> = {
  NASDAQ100: {
    category: 'NASDAQ100', market: 'US', benchmarkSymbol: '^NDX', mainSymbols: ['^NDX', 'QQQ'],
    breadthEtfs: ['QQQ', 'XLK', 'XLC', 'IWM', 'RSP'], sectorEtfs: US_SECTOR_ETFS,
    riskOnSectors: US_RISK_ON_SECTORS, sectorNames: US_SECTOR_NAMES,
  },
  SP500: {
    category: 'SP500', market: 'US', benchmarkSymbol: '^GSPC', mainSymbols: ['^GSPC', 'SPY'],
    breadthEtfs: US_BREADTH_ETFS, sectorEtfs: US_SECTOR_ETFS,
    riskOnSectors: US_RISK_ON_SECTORS, sectorNames: US_SECTOR_NAMES,
  },
  KOSPI200: {
    category: 'KOSPI200', market: 'KR', benchmarkSymbol: '^KS200', mainSymbols: ['^KS200', '069500.KS'],
    breadthEtfs: KR_BREADTH_ETFS, sectorEtfs: KR_SECTOR_ETFS,
    riskOnSectors: KR_RISK_ON_SECTORS, sectorNames: KR_SECTOR_NAMES, kisMarket: 'KOSPI',
  },
  KOSDAQ150: {
    category: 'KOSDAQ150', market: 'KR', benchmarkSymbol: '^KQ150', mainSymbols: ['^KQ150', '^KQ11', '229200.KS'],
    breadthEtfs: ['^KQ11', '^KS11', '229200.KS'], sectorEtfs: ['244580.KS', '455850.KS', '305720.KS', '139260.KS', '091220.KS'],
    riskOnSectors: new Set(['244580.KS', '455850.KS', '305720.KS', '139260.KS']),
    sectorNames: KR_SECTOR_NAMES, kisMarket: 'KOSDAQ',
  },
};

async function safeDaily(symbol: string): Promise<OHLCData[]> {
  return getMasterFilterDailyPrice(symbol);
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
  const categories: RecommendationStateCategory[] = market === 'KR'
    ? ['KOSPI200', 'KOSDAQ150']
    : ['SP500', 'NASDAQ100'];
  const configs = categories.map((category) => CATEGORY_SNAPSHOT_CONFIG[category]);
  const allSymbols = [...new Set(configs.flatMap((config) => [
    ...config.mainSymbols,
    ...config.breadthEtfs,
    ...config.sectorEtfs,
  ]))];
  const [priceEntries, vixData, vix3mData, foreignEntries] = await Promise.all([
    Promise.all(allSymbols.map(async (symbol) => [symbol, await safeDaily(symbol)] as const)),
    safeDaily('^VIX'),
    safeDaily('^VIX3M'),
    Promise.all(configs.map(async (config) => [
      config.category,
      config.kisMarket ? await getKisMarketForeignNetBuy(config.kisMarket, 20).catch((err: unknown) => {
        console.warn(`[snapshot-market-state] KIS foreignNetBuy ${config.kisMarket} failed:`, err instanceof Error ? err.message : String(err));
        return [];
      }) : [],
    ] as const)),
  ]);
  const prices = new Map(priceEntries);
  const foreignByCategory = new Map(foreignEntries);
  const results = [];
  const failures: Array<{ category: RecommendationStateCategory; message: string }> = [];

  for (const config of configs) {
    try {
      const mainSymbol = selectFreshestSufficientHistory(config.mainSymbols, prices);
      if (!mainSymbol) throw new Error(`${config.benchmarkSymbol} 200일 데이터 부족`);
      const mainData = prices.get(mainSymbol)!;
      const breadthSeries = config.breadthEtfs.map((symbol) => [symbol, prices.get(symbol) || []] as const);
      const sectorSeries = config.sectorEtfs.map((symbol) => [symbol, prices.get(symbol) || []] as const);
      const breadthRows = breadthSeries
        .filter(([, data]) => data.length >= 200)
        .map(([symbol, data]) => {
          const lastBar = data.at(-1);
          if (!lastBar) throw new Error(`breadth data empty for ${symbol}`);
          return {
          symbol,
          above200: lastBar.close > (movingAverage(data, 200) ?? Infinity),
          return20: percentReturn(data, 20) ?? 0,
          };
        });
      const sectorRows = buildSectorRows(sectorSeries, config.sectorNames, config.riskOnSectors);
      const foreignNetBuy = foreignByCategory.get(config.category) || [];
      const foreignNetBuy5d = foreignNetBuy.length
        ? foreignNetBuy.slice(0, 5).reduce((sum, row) => sum + row.netBuyAmount, 0)
        : undefined;
      const result = computeP3(
        mainData,
        vixData,
        breadthRows,
        sectorRows,
        mainSymbol,
        config.breadthEtfs,
        vix3mData,
        foreignNetBuy5d,
      );
      results.push({ config, mainSymbol, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ category: config.category, message });
      if (config.category === categories[0]) throw error;
    }
  }

  const supabase = getSupabaseAdmin();
  const categoryRows = results.map(({ config, mainSymbol, result }) => ({
    calc_date: calcDate,
    category: config.category,
    market: config.market,
    benchmark_symbol: config.benchmarkSymbol,
    source_symbol: mainSymbol,
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
  }));
  const { error: categoryError } = await supabase
    .from('recommendation_category_market_state')
    .upsert(categoryRows, { onConflict: 'calc_date,category' });
  if (categoryError) throw new Error(`recommendation_category_market_state upsert error: ${categoryError.message}`);

  const primary = results.find(({ config }) => config.category === categories[0]);
  if (!primary) throw new Error(`${market} primary master filter result missing`);
  const primaryRow = categoryRows.find((row) => row.category === primary.config.category)!;
  const legacyRow = {
    calc_date: primaryRow.calc_date,
    market: primaryRow.market,
    p3_score: primaryRow.p3_score,
    state: primaryRow.state,
    trend_score: primaryRow.trend_score,
    breadth_score: primaryRow.breadth_score,
    volatility_score: primaryRow.volatility_score,
    liquidity_score: primaryRow.liquidity_score,
    ftd_score: primaryRow.ftd_score,
    distribution_score: primaryRow.distribution_score,
    nhnl_score: primaryRow.nhnl_score,
    above200_score: primaryRow.above200_score,
    sector_score: primaryRow.sector_score,
  };
  const { error: legacyError } = await supabase
    .from('master_filter_snapshot')
    .upsert(legacyRow, { onConflict: 'calc_date,market' });
  if (legacyError) throw new Error(`master_filter_snapshot upsert error: ${legacyError.message}`);

  return {
    p3Score: primary.result.p3Score,
    state: primary.result.state,
    categories: Object.fromEntries(results.map(({ config, mainSymbol, result }) => [config.category, {
      p3Score: result.p3Score,
      state: result.state,
      benchmarkSymbol: config.benchmarkSymbol,
      sourceSymbol: mainSymbol,
    }])),
    failures,
  };
}

async function snapshotMacro(calcDate: string) {
  // macro_snapshot은 현재 calc_date 단일 키인 US 스냅샷 테이블입니다.
  // KR 매크로는 live API에서 동일 서비스를 사용하되 이 테이블을 덮어쓰지 않습니다.
  const assessment = await fetchMacroAssessment('US');
  const row = buildMacroSnapshotRow(assessment, calcDate);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('macro_snapshot')
    .upsert(row, { onConflict: 'calc_date' });

  if (error) throw new Error(`macro_snapshot upsert error: ${error.message}`);

  return {
    macroScore: assessment.result.macroScore,
    rawScore: assessment.rawScore,
    regime: assessment.result.regime,
    decisionStatus: assessment.quality.status,
    quality: assessment.quality,
    observedAt: assessment.observedAt,
    fetchedAt: assessment.fetchedAt,
    modelVersion: assessment.modelVersion,
    market: assessment.market,
  };
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
