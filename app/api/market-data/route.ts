import { NextResponse } from 'next/server';
import { getMarketDailyPrice } from '@/lib/finance/providers/kis-api';
import { getYahooDailyPrice, getYahooFundamentals } from '@/lib/finance/providers/yahoo-api';
import { getSecFundamentals } from '@/lib/finance/providers/sec-edgar-api';
import { analyzeSepa } from '@/lib/finance/core/sepa';
import { calculateATR, calculateEntryPrice } from '@/lib/finance/core/moving-average';
import { calculateMinerviniRiskPlan } from '@/lib/finance/core/position-sizing';
import { fetchAggregatedFundamentals } from '@/lib/finance/market/fundamental-fetcher';
import { analyzeVcp } from '@/lib/finance/engines/vcp';
import { cacheGet, cacheKey, cacheSet } from '@/lib/cache';
import { fetchLatestMacroTrend, fetchLatestStockMetrics } from '@/lib/finance/market/stock-metrics';
import type { FundamentalSnapshot, MacroTrend, MarketAnalysisResponse, OHLCData, ProviderAttempt, StockMetric } from '@/types';

const REQUIRED_SEPA_BARS = 252;
const TARGET_KIS_BARS = 260;
const DEFAULT_TOTAL_EQUITY = 50_000;
const DEFAULT_RISK_PERCENT_INPUT = 1;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function getUpstreamStatus(error: unknown) {
  const maybe = error as { response?: { status?: unknown }; status?: unknown };
  const status = maybe.response?.status ?? maybe.status;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

function isTransientError(error: unknown) {
  const status = getUpstreamStatus(error);
  if (status === 429) return true;
  if (status !== null && status >= 500) return true;
  const code = String((error as { code?: unknown }).code || '');
  return code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET';
}

function attempt(provider: string, stage: string, status: ProviderAttempt['status'], message: string, patch: Partial<ProviderAttempt> = {}): ProviderAttempt {
  return {
    provider,
    stage,
    status,
    message,
    upstreamStatus: null,
    attemptedAt: new Date().toISOString(),
    ...patch,
  };
}

async function withRetry<T>(
  provider: string,
  stage: string,
  attempts: ProviderAttempt[],
  fn: () => Promise<T>,
  maxAttempts = 2
) {
  let lastError: unknown;
  for (let index = 1; index <= maxAttempts; index += 1) {
    try {
      const result = await fn();
      attempts.push(attempt(provider, stage, 'success', `${provider} ${stage} succeeded on attempt ${index}.`));
      return result;
    } catch (error) {
      lastError = error;
      const upstreamStatus = getUpstreamStatus(error);
      const retryable = isTransientError(error);
      attempts.push(attempt(
        provider,
        stage,
        'failed',
        `${provider} ${stage} failed on attempt ${index}: ${getErrorMessage(error)}`,
        { upstreamStatus }
      ));

      if (!retryable || index === maxAttempts) break;
      await sleep(300 * index);
    }
  }

  throw lastError;
}

function apiError(message: string, code: string, status = 500, details?: unknown, recoverable = status < 500) {
  return NextResponse.json(
    {
      message,
      code,
      details,
      recoverable,
    },
    { status }
  );
}

function chooseLongerData(kisData: OHLCData[], yahooData: OHLCData[]) {
  if (yahooData.length > kisData.length) return yahooData;
  return kisData;
}

function getYahooFormattedTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

function marketForExchange(exchange: string) {
  return exchange === 'KOSPI' || exchange === 'KOSDAQ' ? 'KR' as const : 'US' as const;
}

function primaryMacroIndexForExchange(exchange: string) {
  if (exchange === 'KOSPI') return '^KS200';
  if (exchange === 'KOSDAQ') return '^KQ150';
  if (exchange === 'NAS' || exchange === 'NASDAQ') return 'QQQ';
  return 'SPY';
}

async function loadStandardMetrics(ticker: string, exchange: string) {
  try {
    const market = marketForExchange(exchange);
    const [metrics, macroTrend] = await Promise.all([
      fetchLatestStockMetrics([ticker], market),
      fetchLatestMacroTrend(market, primaryMacroIndexForExchange(exchange)),
    ]);
    return { metric: metrics.get(ticker) || null, macroTrend };
  } catch {
    return { metric: null, macroTrend: null };
  }
}

function mergeStandardMetrics(response: MarketAnalysisResponse, metric: StockMetric | null, macroTrend: MacroTrend | null): MarketAnalysisResponse {
  const standardRs = metric?.rs_rating ?? null;
  return {
    ...response,
    sepaEvidence: {
      ...response.sepaEvidence,
      metrics: {
        ...response.sepaEvidence.metrics,
        rsRating: standardRs,
        rsSource: standardRs !== null ? ('UNIVERSE' as const) : (response.sepaEvidence.metrics.rsSource ?? null),
        internalRsRating: standardRs,
        rsRank: metric?.rs_rank ?? null,
        rsUniverseSize: metric?.rs_universe_size ?? null,
        rsPercentile: metric?.rs_rank && metric?.rs_universe_size
          ? Math.round((1 - ((metric.rs_rank - 1) / Math.max(1, metric.rs_universe_size - 1))) * 100)
          : null,
        ibdProxyScore: metric?.ibd_proxy_score ?? response.sepaEvidence.metrics.ibdProxyScore ?? null,
        weightedMomentumScore: metric?.ibd_proxy_score ?? response.sepaEvidence.metrics.weightedMomentumScore ?? null,
        mansfieldRsFlag: metric?.mansfield_rs_flag ?? response.sepaEvidence.metrics.mansfieldRsFlag ?? null,
        mansfieldRsScore: metric?.mansfield_rs_score ?? response.sepaEvidence.metrics.mansfieldRsScore ?? null,
        rsDataQuality: metric?.data_quality ?? response.sepaEvidence.metrics.rsDataQuality ?? 'NA',
        macroActionLevel: macroTrend?.action_level ?? response.sepaEvidence.metrics.macroActionLevel ?? null,
      },
    },
  };
}

function getBenchmarkCandidates(exchange: string) {
  if (exchange === 'KOSPI') return ['^KS200', '^KS11'];
  if (exchange === 'KOSDAQ') return ['^KQ150', '^KQ11'];
  if (exchange === 'NAS' || exchange === 'NASDAQ') return ['QQQ', '^NDX'];
  return ['SPY', '^GSPC'];
}

function isValidTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI' || exchange === 'KOSDAQ') return /^\d{6}$/.test(ticker);
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker);
}

async function fetchBenchmarkData(exchange: string, warnings: string[], attempts: ProviderAttempt[]) {
  const candidates = getBenchmarkCandidates(exchange);
  for (const ticker of candidates) {
    try {
      const data = await withRetry('Yahoo Finance', `benchmark ${ticker}`, attempts, () => getYahooDailyPrice(ticker), 2);
      if (data.length > 0) {
        if (ticker !== candidates[0]) {
          warnings.push(`Primary RS benchmark ${candidates[0]} was unavailable; using ${ticker} fallback.`);
        }
        return { ticker, data };
      }
      attempts.push(attempt('Yahoo Finance', `benchmark ${ticker}`, 'warning', `Benchmark ${ticker} returned no bars.`, { bars: 0 }));
    } catch (error: unknown) {
      warnings.push(`RS benchmark ${ticker} fetch failed: ${getErrorMessage(error)}.`);
    }
  }
  return { ticker: candidates[0], data: [] };
}

async function fetchFundamentals(ticker: string, exchange: string, warnings: string[]) {
  return fetchAggregatedFundamentals(ticker, exchange, warnings);
}

function missingFundamentalLabels(fundamentals: FundamentalSnapshot | null) {
  if (!fundamentals) {
    return ['EPS growth', 'Revenue growth', 'ROE', 'Debt ratio', 'Institutional ownership', 'Official RS Rating'];
  }

  const missing: string[] = ['Institutional ownership', 'Official RS Rating'];
  if (fundamentals.epsGrowthPct === null) missing.push('EPS growth');
  if (fundamentals.revenueGrowthPct === null) missing.push('Revenue growth');
  if (fundamentals.roePct === null) missing.push('ROE');
  if (fundamentals.debtToEquityPct === null) missing.push('Debt ratio');
  return missing;
}

async function fetchPriceData(ticker: string, exchange: string): Promise<{
  data: OHLCData[];
  providerUsed: string;
  warnings: string[];
  providerAttempts: ProviderAttempt[];
}> {
  const warnings: string[] = [];
  const providerAttempts: ProviderAttempt[] = [];
  let kisData: OHLCData[] = [];

  try {
    kisData = await withRetry('KIS', 'daily price', providerAttempts, () => getMarketDailyPrice(ticker, exchange, TARGET_KIS_BARS), 2);
    const last = providerAttempts.at(-1);
    if (last && last.provider === 'KIS') last.bars = kisData.length;

    if (kisData.length >= REQUIRED_SEPA_BARS) {
      return {
        data: kisData,
        providerUsed: `KIS (${kisData.length} daily bars)`,
        warnings,
        providerAttempts,
      };
    }

    warnings.push(`KIS returned only ${kisData.length} daily bars; Yahoo fallback will be tried for long moving-average and 52-week checks.`);
    providerAttempts.push(attempt('KIS', 'daily price coverage', 'warning', `Only ${kisData.length} bars were available from KIS.`, { bars: kisData.length }));
  } catch (error: unknown) {
    warnings.push(`KIS fetch failed: ${getErrorMessage(error)}. Yahoo fallback will be tried.`);
  }

  try {
    const yahooTicker = getYahooFormattedTicker(ticker, exchange);
    const yahooData = await withRetry('Yahoo Finance', `daily price ${yahooTicker}`, providerAttempts, () => getYahooDailyPrice(yahooTicker), 2);
    const last = providerAttempts.at(-1);
    if (last && last.provider === 'Yahoo Finance') last.bars = yahooData.length;

    const data = chooseLongerData(kisData, yahooData);
    const providerUsed =
      data === yahooData
        ? `Yahoo Finance (${yahooData.length} daily bars)`
        : `KIS partial (${kisData.length} daily bars)`;

    if (data.length < REQUIRED_SEPA_BARS) {
      warnings.push(`Only ${data.length} daily bars were available after fallback; long-window SEPA checks can be less reliable.`);
    }

    return { data, providerUsed, warnings, providerAttempts };
  } catch (error: unknown) {
    if (kisData.length > 0) {
      warnings.push(`Yahoo fallback failed: ${getErrorMessage(error)}. Analysis will use partial KIS data.`);
      return {
        data: kisData,
        providerUsed: `KIS partial (${kisData.length} daily bars)`,
        warnings,
        providerAttempts,
      };
    }

    throw Object.assign(error instanceof Error ? error : new Error(getErrorMessage(error)), { providerAttempts });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.trim().toUpperCase();
  const exchange = searchParams.get('exchange')?.trim().toUpperCase() || 'NAS';
  const totalEquity = Number(searchParams.get('totalEquity') || DEFAULT_TOTAL_EQUITY);
  const riskPercentInput = Number(searchParams.get('riskPercent') || DEFAULT_RISK_PERCENT_INPUT);
  const includeFundamentals = searchParams.get('includeFundamentals') !== 'false';
  // Scanner batch passes skipStandardMetrics=true to avoid N+1 single-ticker
  // stock_metrics/macro_trend fetches — those are re-applied in a single .in()
  // query via /api/scanner/metrics after the scan completes.
  const skipStandardMetrics = searchParams.get('skipStandardMetrics') === 'true';
  const riskPercent = riskPercentInput / 100;

  if (!ticker) {
    return apiError('티커를 입력해 주세요.', 'MISSING_TICKER', 400);
  }

  if (!isValidTicker(ticker, exchange)) {
    return apiError('지원하지 않는 티커 형식입니다. 미국 종목은 GOOG/BRK-B 형식, 한국 종목은 6자리 코드를 사용해 주세요.', 'INVALID_TICKER', 400);
  }

  if (!Number.isFinite(totalEquity) || totalEquity <= 0) {
    return apiError('총 자본은 0보다 큰 숫자여야 합니다.', 'INVALID_TOTAL_EQUITY', 400);
  }

  if (!Number.isFinite(riskPercentInput) || riskPercentInput <= 0 || riskPercentInput > 10) {
    return apiError('허용 손실은 0보다 크고 10% 이하여야 합니다.', 'INVALID_RISK_PERCENT', 400);
  }

  try {
    const cacheId = cacheKey('market-data', ticker, exchange, totalEquity, riskPercentInput, includeFundamentals ? 'fundamentals' : 'price-only');
    const cached = cacheGet<MarketAnalysisResponse>(cacheId);
    if (cached) {
      const { metric, macroTrend } = skipStandardMetrics
        ? { metric: null as StockMetric | null, macroTrend: null as MacroTrend | null }
        : await loadStandardMetrics(ticker, exchange);
      const mergedCached = mergeStandardMetrics(cached, metric, macroTrend);
      return NextResponse.json({
        ...mergedCached,
        data: mergedCached,
        meta: {
          asOf: new Date().toISOString(),
          source: mergedCached.providerUsed,
          provider: mergedCached.providerUsed,
          delay: 'EOD',
          fallbackUsed: mergedCached.warnings.some((warning) => warning.includes('fallback') || warning.includes('Yahoo') || warning.includes('KIS')),
          warnings: mergedCached.warnings,
          providerAttempts: mergedCached.providerAttempts || [],
        },
      });
    }

    const { data, providerUsed, warnings, providerAttempts } = await fetchPriceData(ticker, exchange);

    const [benchmark, fundamentals] = await Promise.all([
      fetchBenchmarkData(exchange, warnings, providerAttempts),
      includeFundamentals ? fetchFundamentals(ticker, exchange, warnings) : Promise.resolve(null),
    ]);

    const { metric, macroTrend } = skipStandardMetrics
      ? { metric: null as StockMetric | null, macroTrend: null as MacroTrend | null }
      : await loadStandardMetrics(ticker, exchange);

    const atr = calculateATR(data);
    const entryPrice = calculateEntryPrice(data, 50);
    let sepaEvidence = analyzeSepa(data, { 
      benchmarkData: benchmark.data, 
      benchmarkTicker: benchmark.ticker,
      fundamentals 
    });
    const standardRsRating = metric?.rs_rating ?? null;
    sepaEvidence = mergeStandardMetrics({
      ticker,
      exchange,
      providerUsed,
      providerAttempts,
      priceData: data,
      sepaEvidence,
      riskPlan: {} as never,
      vcpAnalysis: {} as never,
      fundamentals,
      dataQuality: { bars: data.length, hasEnoughForAtr: false, hasEnoughForLongMa: false, missingFundamentals: [] },
      warnings,
    }, metric, macroTrend).sepaEvidence;
    const vcpAnalysis = analyzeVcp(data, entryPrice, { rsRating: standardRsRating });
    const effectiveEntry = vcpAnalysis.recommendedEntry;
    const riskPlan = calculateMinerviniRiskPlan(
      totalEquity,
      effectiveEntry,
      atr,
      riskPercent,
      vcpAnalysis.invalidationPrice,
      data,
      {
        strategy: vcpAnalysis.baseType === 'High_Tight_Flag' ? 'HIGH_TIGHT_FLAG' : 'MINERVINI_VCP',
        highTightFlag: vcpAnalysis.highTightFlag,
      }
    );

    if (data.length < REQUIRED_SEPA_BARS) {
      warnings.push('장기 이동평균과 52주 고점 계산에 필요한 가격 데이터가 부족할 수 있습니다.');
    }
    if (sepaEvidence.summary.info > 0) {
      warnings.push('일부 보조 지표는 데이터 제공 상황에 따라 정보 항목으로 표시됩니다.');
    }
    if (vcpAnalysis.entrySource === 'RECENT_HIGH_FALLBACK') {
      warnings.push('VCP 피벗이 확정되지 않아 최근 고점을 참고가로 사용했습니다.');
    }
    if (vcpAnalysis.breakoutVolumeStatus === 'weak') {
      warnings.push('돌파 거래량이 아직 충분히 강하지 않습니다.');
    }

    providerAttempts.push(attempt('MTN Engine', 'SEPA/VCP calculation', 'success', 'SEPA, VCP and risk plan were calculated.'));

    const response: MarketAnalysisResponse = {
      ticker,
      exchange,
      providerUsed,
      providerAttempts,
      priceData: data,
      sepaEvidence,
      riskPlan,
      vcpAnalysis,
      fundamentals,
      dataQuality: {
        bars: data.length,
        hasEnoughForAtr: data.length >= 21,
        hasEnoughForLongMa: data.length >= 221,
        missingFundamentals: missingFundamentalLabels(fundamentals),
      },
      warnings,
    };

    cacheSet(cacheId, response);

    return NextResponse.json({
      ...response,
      data: response,
      meta: {
        asOf: new Date().toISOString(),
        source: providerUsed,
        provider: providerUsed,
        delay: 'EOD',
        fallbackUsed: warnings.some((warning) => warning.includes('fallback') || warning.includes('Yahoo') || warning.includes('KIS')),
        warnings,
        providerAttempts,
      },
    });
  } catch (error: unknown) {
    const providerAttempts = (error as { providerAttempts?: ProviderAttempt[] }).providerAttempts || [];
    const upstreamStatus = getUpstreamStatus(error);
    const recoverable = isTransientError(error);
    console.error('Market Data API Error:', error);
    return apiError(
      getErrorMessage(error) || '시장 데이터를 불러오는 중 오류가 발생했습니다.',
      'MARKET_DATA_FETCH_FAILED',
      upstreamStatus && upstreamStatus >= 500 ? 503 : 500,
      { upstreamStatus, providerAttempts },
      recoverable
    );
  }
}
