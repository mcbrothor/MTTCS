import { supabaseServer } from '@/lib/supabase/server';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { getTossDailyPrice, isTossInvestConfigured } from '@/lib/finance/providers/toss-api';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { calculateMacroTrendFromData, calculateMansfieldFromData, calculateRSRating, calculateWeightedMomentum } from '@/lib/finance/market/rs-proxy';
import { getStandardScannerUniverse } from '@/lib/finance/market/scanner-universes';
import { computeMdd52w } from '@/lib/finance/core/mdd';
import type { DataQuality, MacroActionLevel, MacroTrend, MarketCode, OHLCData, ScannerConstituent, ScannerUniverse, StockMetric } from '@/types';

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

function isKoreanExchange(exchange: string) {
  return exchange === 'KOSPI' || exchange === 'KOSDAQ';
}

async function fetchDailyBars(ticker: string, exchange: string, bars = 300): Promise<{ data: OHLCData[]; source: string }> {
  const providerOrder = isKoreanExchange(exchange) ? ['KIS', 'Toss Securities'] : ['Toss Securities', 'KIS'];

  for (const provider of providerOrder) {
    if (provider === 'Toss Securities' && !isTossInvestConfigured()) continue;

    try {
      const data = provider === 'KIS'
        ? await getMarketDailyPrice(ticker, exchange, bars)
        : await getTossDailyPrice(ticker, bars);
      if (data.length > 0) return { data, source: `${provider} ${exchange}` };
    } catch {
      // Yahoo fallback below keeps one ticker failure from breaking a whole RS chunk.
    }
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
    close_price: null,
    above_200d: null,
    ibd_proxy_score: null,
    rs_rating: null,
    rs_rank: null,
    rs_universe_size: null,
    mansfield_rs_flag: null,
    mansfield_rs_score: null,
    mdd_52w_pct: null,
    data_quality: 'NA',
    price_source: item.priceSource || null,
    error_message: message.slice(0, 1000),
  };
}

// IBD 정통 RS는 가격 모멘텀 + 신고가 거리 + 거래량 가중을 함께 본다.
// 무료 인프라에서 진정한 IBD RS를 복제하기는 어렵지만,
// 모멘텀 점수에 신고가 거리 보정을 더해 박스권 종목과 신고가 갱신 종목을 분리한다.
function applyNewHighBonus(momentumScore: number | null, data: OHLCData[]): number | null {
  if (momentumScore === null) return null;
  if (data.length < 252) return momentumScore;
  const lastClose = data.at(-1)?.close ?? null;
  const high52w = Math.max(...data.slice(-252).map((d) => d.high));
  if (lastClose === null || high52w <= 0) return momentumScore;
  const distancePct = ((high52w - lastClose) / high52w) * 100; // 0=신고가, 25=25% 아래
  // 신고가 0% 거리 → +5점, 25% 거리 → -2점, 50%+ → -8점 (선형)
  const bonus = distancePct <= 0 ? 5 : distancePct >= 50 ? -8 : 5 - (distancePct / 50) * 13;
  return Math.round((momentumScore + bonus) * 100) / 100;
}

export async function computeStockMetric(item: ScannerConstituent, market: MarketCode, calcDate = todayIso(), benchmarkCache = new Map<string, OHLCData[]>()) {
  try {
    const { data: fetchedData, source } = await fetchDailyBars(item.ticker, item.exchange);
    const fetchedBenchmark = await fetchBenchmarkBars(item.exchange, benchmarkCache);
    const data = fetchedData.filter((row) => row.date <= calcDate);
    const benchmark = fetchedBenchmark.filter((row) => row.date <= calcDate);
    const momentum = calculateWeightedMomentum(data);
    const mansfield = calculateMansfieldFromData(data, benchmark);
    const mdd52wPct = computeMdd52w(data.map((d) => d.close));
    const dataQuality = (momentum.rsDataQuality || 'NA') as DataQuality;
    const adjustedMomentum = applyNewHighBonus(momentum.ibdProxyScore, data);
    const latestClose = data.at(-1)?.close ?? null;
    const ma200 = data.length >= 200
      ? data.slice(-200).reduce((sum, row) => sum + row.close, 0) / 200
      : null;
    return {
      ticker: item.ticker,
      market,
      calc_date: calcDate,
      close_price: latestClose,
      above_200d: latestClose !== null && ma200 !== null ? latestClose > ma200 : null,
      ibd_proxy_score: adjustedMomentum,
      rs_rating: null,
      rs_rank: null,
      rs_universe_size: null,
      mansfield_rs_flag: mansfield.mansfieldRsFlag,
      mansfield_rs_score: mansfield.mansfieldRsScore,
      mdd_52w_pct: mdd52wPct,
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

// stock_metrics 신선도 가드: 7일을 초과한 row는 stale로 분류해 RS 평가에서 배제한다.
// (Supabase free tier는 7일 미사용 시 일시정지되므로 현실적 윈도)
const STOCK_METRICS_FRESHNESS_DAYS = 7;

function isFreshCalcDate(calcDate: string | null | undefined): boolean {
  if (!calcDate) return false;
  const calc = new Date(`${calcDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(calc)) return false;
  const ageMs = Date.now() - calc;
  return ageMs <= STOCK_METRICS_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
}

export async function fetchLatestStockMetrics(tickers: string[], market: MarketCode) {
  const unique = Array.from(new Set(tickers.map((ticker) => ticker.toUpperCase()).filter(Boolean)));
  if (unique.length === 0) return new Map<string, StockMetric>();
  // freshness 가드: 7일을 초과한 row는 RS 평가에 사용하지 않는다.
  // 단, UI 표시는 가능하도록 stale 플래그만 붙여서 반환.
  const cutoffIso = new Date(Date.now() - STOCK_METRICS_FRESHNESS_DAYS * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const { data, error } = await supabaseServer
    .from('stock_metrics')
    .select('*')
    .eq('market', market)
    .in('ticker', unique)
    .gte('calc_date', cutoffIso)
    .order('calc_date', { ascending: false });
  if (error) throw error;

  const byTicker = new Map<string, StockMetric>();
  for (const row of (data || []) as StockMetric[]) {
    if (!byTicker.has(row.ticker) && isFreshCalcDate(row.calc_date)) byTicker.set(row.ticker, row);
  }
  return byTicker;
}

export const STOCK_METRICS_FRESHNESS = STOCK_METRICS_FRESHNESS_DAYS;

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

/** 동시성 제한 병렬 실행 헬퍼. 워커 풀 패턴. */
async function parallelLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const RS_CHUNK_CONCURRENCY = 5;

export async function runRsMetricsChunk(input: MetricInput) {
  const chunkSize = input.chunkSize || 50;
  const chunkIndex = input.chunkIndex || 0;
  const universe = await getStandardScannerUniverse(input.market);
  const chunk = universe.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);

  // 벤치마크 데이터를 사전 워밍업하여 병렬 실행 중 경합 방지
  const benchmarkCache = new Map<string, OHLCData[]>();
  const exchangesInChunk = Array.from(new Set(chunk.map((c) => c.exchange)));
  await Promise.all(
    exchangesInChunk.map((exchange) => fetchBenchmarkBars(exchange, benchmarkCache).catch(() => {}))
  );

  // 동시성 5로 병렬 처리 — 개별 종목 실패 시에도 나머지 종목 처리 계속
  const rows = await parallelLimit(
    chunk,
    async (item) => computeStockMetric(item, input.market, input.calcDate, benchmarkCache),
    RS_CHUNK_CONCURRENCY
  );

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
    close_price: row.close_price ?? null,
    above_200d: row.above_200d ?? null,
    ibd_proxy_score: row.ibd_proxy_score,
    rs_rating: row.rs_rating,
    rs_rank: row.rs_rank,
    rs_universe_size: row.rs_universe_size,
    mansfield_rs_flag: row.mansfield_rs_flag,
    mansfield_rs_score: row.mansfield_rs_score,
    mdd_52w_pct: row.mdd_52w_pct ?? null,
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

/**
 * stock_metrics 테이블에서 특정 시장의 가장 최근 계산일(calc_date)과 신선도 유효 여부를 리턴합니다.
 */
export async function getLatestStockMetricsCalcDate(market: MarketCode): Promise<{ calcDate: string | null; isFresh: boolean }> {
  const { data, error } = await supabaseServer
    .from('stock_metrics')
    .select('calc_date')
    .eq('market', market)
    .order('calc_date', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[stock-metrics] Failed to fetch latest stock_metrics calc_date:', error);
    return { calcDate: null, isFresh: false };
  }

  const calcDate = data?.[0]?.calc_date ?? null;
  return {
    calcDate,
    isFresh: isFreshCalcDate(calcDate),
  };
}
