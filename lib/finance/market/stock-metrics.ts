import { supabaseServer } from '@/lib/supabase/server';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { calculateMacroTrendFromData, calculateMansfieldFromData, calculateRSRating, calculateWeightedMomentum } from '@/lib/finance/market/rs-proxy';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';
import type { DataQuality, MacroActionLevel, MacroTrend, MarketCode, OHLCData, ScannerConstituent, ScannerUniverse, StockMetric } from '@/types';

export const REDUCED_RS_THRESHOLD = 80;

interface MetricInput {
  market: MarketCode;
  calcDate: string;
  chunkIndex?: number;
  chunkSize?: number;
}

type MetricRow = Omit<StockMetric, 'created_at' | 'updated_at'>;

type MacroRow = Omit<MacroTrend, 'created_at' | 'updated_at'>;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function marketForUniverse(universe: ScannerUniverse): MarketCode {
  return universe === 'KOSPI200' || universe === 'KOSDAQ150' ? 'KR' : 'US';
}

export function benchmarkCandidatesForExchange(exchange: string) {
  if (exchange === 'KOSPI') return ['^KS200', '^KS11'];
  if (exchange === 'KOSDAQ') return ['^KQ150', '^KQ11'];
  if (exchange === 'NAS' || exchange === 'NASDAQ') return ['QQQ', '^NDX'];
  return ['SPY', '^GSPC'];
}

export function macroIndexForUniverse(universe: ScannerUniverse) {
  if (universe === 'KOSPI200') return '^KS200';
  if (universe === 'KOSDAQ150') return '^KQ150';
  if (universe === 'NASDAQ100') return 'QQQ';
  return 'SPY';
}

function yahooTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

async function fetchDailyBars(ticker: string, exchange: string, bars = 300): Promise<{ data: OHLCData[]; source: string }> {
  try {
    const data = await getMarketDailyPrice(ticker, exchange, bars);
    if (data.length > 0) return { data, source: `KIS ${exchange}` };
  } catch {
    // Yahoo fallback below keeps one ticker failure from breaking a whole RS chunk.
  }

  const formatted = yahooTicker(ticker, exchange);
  const data = await getYahooDailyPrice(formatted);
  return { data, source: `Yahoo Finance ${formatted}` };
}

async function fetchBenchmarkBars(exchange: string, cache: Map<string, OHLCData[]>) {
  const candidates = benchmarkCandidatesForExchange(exchange);
  for (const candidate of candidates) {
    if (cache.has(candidate)) return cache.get(candidate) || [];
    try {
      const data = await getYahooDailyPrice(candidate);
      if (data.length > 0) {
        cache.set(candidate, data);
        return data;
      }
    } catch {
      cache.set(candidate, []);
    }
  }
  return [];
}

function emptyMetric(item: ScannerConstituent, market: MarketCode, calcDate: string, message: string): MetricRow {
  return {
    ticker: item.ticker,
    market,
    calc_date: calcDate,
    ibd_proxy_score: null,
    rs_rating: null,
    rs_rank: null,
    rs_universe_size: null,
    mansfield_rs_flag: null,
    mansfield_rs_score: null,
    data_quality: 'NA',
    price_source: item.priceSource || null,
    error_message: message.slice(0, 1000),
  };
}

export async function computeStockMetric(item: ScannerConstituent, market: MarketCode, calcDate = todayIso(), benchmarkCache = new Map<string, OHLCData[]>()) {
  try {
    const { data, source } = await fetchDailyBars(item.ticker, item.exchange);
    const benchmark = await fetchBenchmarkBars(item.exchange, benchmarkCache);
    const momentum = calculateWeightedMomentum(data);
    const mansfield = calculateMansfieldFromData(data, benchmark);
    const dataQuality = (momentum.rsDataQuality || 'NA') as DataQuality;
    return {
      ticker: item.ticker,
      market,
      calc_date: calcDate,
      ibd_proxy_score: momentum.ibdProxyScore,
      rs_rating: null,
      rs_rank: null,
      rs_universe_size: null,
      mansfield_rs_flag: mansfield.mansfieldRsFlag,
      mansfield_rs_score: mansfield.mansfieldRsScore,
      data_quality: dataQuality,
      price_source: source,
      error_message: dataQuality === 'NA' ? 'Insufficient price history for IBD Proxy score.' : null,
    } satisfies MetricRow;
  } catch (error) {
    return emptyMetric(item, market, calcDate, error instanceof Error ? error.message : 'Unknown metric fetch error');
  }
}

export async function upsertStockMetrics(rows: MetricRow[]) {
  if (rows.length === 0) return { count: 0 };
  const { error } = await supabaseServer
    .from('stock_metrics')
    .upsert(rows, { onConflict: 'ticker,market,calc_date' });
  if (error) throw error;
  return { count: rows.length };
}

export async function fetchLatestStockMetrics(tickers: string[], market: MarketCode) {
  const unique = Array.from(new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean)));
  if (unique.length === 0) return new Map<string, StockMetric>();
  const { data, error } = await supabaseServer
    .from('stock_metrics')
    .select('*')
    .eq('market', market)
    .in('ticker', unique)
    .order('calc_date', { ascending: false });
  if (error) throw error;

  const byTicker = new Map<string, StockMetric>();
  for (const row of (data || []) as StockMetric[]) {
    if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, row);
  }
  return byTicker;
}

export async function fetchLatestMacroTrend(market: MarketCode, indexCode?: string | null) {
  let query = supabaseServer
    .from('macro_trend')
    .select('*')
    .eq('market', market)
    .order('calc_date', { ascending: false })
    .limit(1);
  if (indexCode) query = query.eq('index_code', indexCode);
  const { data, error } = await query;
  if (error) throw error;
  return ((data || [])[0] || null) as MacroTrend | null;
}

export async function computeMacroTrend(indexCode: string, market: MarketCode, calcDate = todayIso()): Promise<MacroRow> {
  try {
    const data = await getYahooDailyPrice(indexCode);
    const trend = calculateMacroTrendFromData(data);
    return {
      index_code: indexCode,
      market,
      calc_date: calcDate,
      index_price: trend.indexPrice,
      ma_50: trend.ma50,
      ma_200: trend.ma200,
      is_uptrend_50: trend.isUptrend50,
      is_uptrend_200: trend.isUptrend200,
      action_level: trend.actionLevel,
    };
  } catch {
    return {
      index_code: indexCode,
      market,
      calc_date: calcDate,
      index_price: null,
      ma_50: null,
      ma_200: null,
      is_uptrend_50: null,
      is_uptrend_200: null,
      action_level: 'HALT' as MacroActionLevel,
    };
  }
}

export async function upsertMacroTrend(row: MacroRow) {
  const { error } = await supabaseServer
    .from('macro_trend')
    .upsert(row, { onConflict: 'index_code,calc_date' });
  if (error) throw error;
  return row;
}

export async function runRsMetricsChunk(input: MetricInput) {
  const chunkSize = input.chunkSize || 50;
  const chunkIndex = input.chunkIndex || 0;
  const universe = await getStandardScannerUniverse(input.market);
  const chunk = universe.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
  const benchmarkCache = new Map<string, OHLCData[]>();
  const rows: MetricRow[] = [];
  for (const item of chunk) {
    rows.push(await computeStockMetric(item, input.market, input.calcDate, benchmarkCache));
  }
  await upsertStockMetrics(rows);
  return {
    market: input.market,
    calcDate: input.calcDate,
    chunkIndex,
    chunkSize,
    total: universe.length,
    processed: rows.length,
    nextChunkIndex: (chunkIndex + 1) * chunkSize < universe.length ? chunkIndex + 1 : null,
  };
}

export async function finalizeRsMetrics(market: MarketCode, calcDate = todayIso()) {
  const { data, error } = await supabaseServer
    .from('stock_metrics')
    .select('*')
    .eq('market', market)
    .eq('calc_date', calcDate)
    .not('ibd_proxy_score', 'is', null)
    .order('ibd_proxy_score', { ascending: false });
  if (error) throw error;

  // 티커 중복 제거 (데이터 정합성 확보)
  const uniqueTickerMap = new Map<string, StockMetric>();
  for (const row of (data || []) as StockMetric[]) {
    if (!uniqueTickerMap.has(row.ticker)) {
      uniqueTickerMap.set(row.ticker, row);
    }
  }

  const rows = Array.from(uniqueTickerMap.values());
  const universeSize = rows.length;
  const ranked = rows.map((row, index) => ({
    ...row,
    rs_rank: index + 1,
    rs_universe_size: universeSize,
    rs_rating: calculateRSRating(index + 1, universeSize),
  }));
  await upsertStockMetrics(ranked.map((row) => ({
    ticker: row.ticker,
    market: row.market,
    calc_date: row.calc_date,
    ibd_proxy_score: row.ibd_proxy_score,
    rs_rating: row.rs_rating,
    rs_rank: row.rs_rank,
    rs_universe_size: row.rs_universe_size,
    mansfield_rs_flag: row.mansfield_rs_flag,
    mansfield_rs_score: row.mansfield_rs_score,
    data_quality: row.data_quality,
    price_source: row.price_source,
    error_message: row.error_message,
  })));

  const macroIndexes = market === 'KR' ? ['^KS200', '^KQ150'] : ['SPY', 'QQQ'];
  const macro = [];
  for (const indexCode of macroIndexes) {
    macro.push(await upsertMacroTrend(await computeMacroTrend(indexCode, market, calcDate)));
  }

  return { market, calcDate, ranked: ranked.length, universeSize, macro };
}
