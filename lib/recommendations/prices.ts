import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { BENCHMARK_FALLBACKS } from './config';
import { markPriceAnomalies } from './core';
import type { RecommendationBar, RecommendationMarket, RecommendationQuality } from './types';

export interface RecommendationPriceSeries {
  instrument: string;
  source: string;
  adjustmentType: 'PROVIDER_ADJUSTED' | 'RAW' | 'DERIVED';
  qualityStatus: RecommendationQuality;
  bars: RecommendationBar[];
}

export interface RecommendationPriceRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_RECOMMENDATION_PRICE_TIMEOUT_MS = 12_000;

function providerSignal(options: RecommendationPriceRequestOptions) {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_RECOMMENDATION_PRICE_TIMEOUT_MS);
  return options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
}

function throwIfShardCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason || new DOMException('Recommendation price refresh cancelled.', 'AbortError');
  }
}

function yahooTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

export function normalizeRecommendationBarDate(value: string) {
  const compact = value.replaceAll('-', '');
  if (!/^\d{8}$/.test(compact)) return value;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function withQuality(bars: RecommendationBar[], qualityStatus: RecommendationQuality) {
  return markPriceAnomalies(bars.map((bar) => ({ ...bar, date: normalizeRecommendationBarDate(bar.date), qualityStatus })));
}

export async function fetchRecommendationSecurityBars(input: {
  ticker: string;
  exchange: string;
  market: RecommendationMarket;
  targetBars?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<RecommendationPriceSeries> {
  try {
    const options = { signal: providerSignal(input), timeoutMs: input.timeoutMs };
    const bars = await getMarketDailyPrice(input.ticker, input.exchange, input.targetBars || 120, options);
    if (bars.length > 0) {
      return {
        instrument: input.ticker,
        source: `KIS ${input.exchange}`,
        adjustmentType: 'PROVIDER_ADJUSTED',
        qualityStatus: 'FULL',
        bars: withQuality(bars, 'FULL'),
      };
    }
  } catch {
    throwIfShardCancelled(input.signal);
    // Yahoo fallback below.
  }
  const symbol = yahooTicker(input.ticker, input.exchange);
  const bars = await getYahooDailyPrice(symbol, {
    signal: providerSignal(input),
    timeoutMs: input.timeoutMs,
  });
  return {
    instrument: input.ticker,
    source: `Yahoo Finance ${symbol}`,
    adjustmentType: 'RAW',
    qualityStatus: 'FALLBACK',
    bars: withQuality(bars, 'FALLBACK'),
  };
}

export async function fetchRecommendationBenchmarkBars(
  symbol: string,
  options: RecommendationPriceRequestOptions = {},
): Promise<RecommendationPriceSeries> {
  const koreanEtf = symbol === '^KS200' ? '069500' : symbol === '^KQ150' ? '229200' : null;
  if (koreanEtf) {
    try {
      const bars = await getMarketDailyPrice(koreanEtf, 'KOSPI', 120, {
        signal: providerSignal(options),
        timeoutMs: options.timeoutMs,
      });
      if (bars.length > 0) {
        return {
          instrument: symbol,
          source: `KIS KOSPI ${koreanEtf}`,
          adjustmentType: 'DERIVED',
          qualityStatus: 'FALLBACK',
          bars: withQuality(bars, 'FALLBACK'),
        };
      }
    } catch {
      throwIfShardCancelled(options.signal);
      // Yahoo index/ETF candidates below remain available as a fallback.
    }
  }
  const available: RecommendationPriceSeries[] = [];
  for (const candidate of [symbol, BENCHMARK_FALLBACKS[symbol as keyof typeof BENCHMARK_FALLBACKS]].filter(Boolean)) {
    try {
      const bars = await getYahooDailyPrice(candidate, {
        signal: providerSignal(options),
        timeoutMs: options.timeoutMs,
      });
      if (bars.length > 0) {
        available.push({
          instrument: symbol,
          source: `Yahoo Finance ${candidate}`,
          adjustmentType: candidate === symbol ? 'RAW' : 'DERIVED',
          qualityStatus: candidate === symbol ? 'FULL' : 'FALLBACK',
          bars: withQuality(bars, candidate === symbol ? 'FULL' : 'FALLBACK'),
        });
      }
    } catch {
      throwIfShardCancelled(options.signal);
      // Try the configured fallback.
    }
  }
  available.sort((a, b) => {
    const dateOrder = (b.bars.at(-1)?.date || '').localeCompare(a.bars.at(-1)?.date || '');
    if (dateOrder !== 0) return dateOrder;
    return a.qualityStatus === 'FULL' ? -1 : 1;
  });
  if (available[0]) return available[0];
  throw new Error(`No benchmark price data for ${symbol}.`);
}

export function recommendationPriceRows(
  market: RecommendationMarket,
  series: RecommendationPriceSeries,
  instrumentType: 'SECURITY' | 'BENCHMARK'
) {
  return series.bars.map((bar) => ({
    market,
    instrument: series.instrument,
    instrument_type: instrumentType,
    trade_date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    provider: series.source,
    adjustment_type: series.adjustmentType,
    adjustment_factor: null,
    quality_status: bar.qualityStatus || series.qualityStatus,
    observed_at: new Date().toISOString(),
  }));
}
