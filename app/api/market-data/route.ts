import { NextResponse } from 'next/server';
import { getMarketDailyPrice } from '@/lib/finance/kis-api';
import { getYahooDailyPrice, getYahooFundamentals } from '@/lib/finance/yahoo-api';
import { getSecFundamentals } from '@/lib/finance/sec-edgar-api';
import { analyzeSepa, calculateATR, calculateEntryPrice, calculatePyramidPlan } from '@/lib/finance/calculations';
import { analyzeVcp } from '@/lib/finance/vcp-engine';
import { cacheGet, cacheSet, cacheKey } from '@/lib/cache';
import type { FundamentalSnapshot, MarketAnalysisResponse, OHLCData } from '@/types';

const REQUIRED_SEPA_BARS = 252;
const TARGET_KIS_BARS = 260;
const DEFAULT_TOTAL_EQUITY = 50_000;
const DEFAULT_RISK_PERCENT_INPUT = 3;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류';
}

function apiError(message: string, code: string, status = 500, details?: unknown) {
  return NextResponse.json(
    {
      message,
      code,
      details,
      recoverable: status < 500,
    },
    { status }
  );
}

function chooseLongerData(kisData: OHLCData[], yahooData: OHLCData[]) {
  if (yahooData.length > kisData.length) return yahooData;
  return kisData;
}

function hasAnyFundamentalValue(fundamentals: FundamentalSnapshot | null) {
  if (!fundamentals) return false;
  return [
    fundamentals.epsGrowthPct,
    fundamentals.revenueGrowthPct,
    fundamentals.roePct,
    fundamentals.debtToEquityPct,
  ].some((value) => value !== null);
}

function mergeFundamentals(
  yahoo: FundamentalSnapshot | null,
  sec: FundamentalSnapshot | null
): FundamentalSnapshot | null {
  if (!hasAnyFundamentalValue(yahoo) && !hasAnyFundamentalValue(sec)) return null;
  if (!hasAnyFundamentalValue(yahoo)) return sec;
  if (!hasAnyFundamentalValue(sec)) return yahoo;

  return {
    epsGrowthPct: yahoo?.epsGrowthPct ?? sec?.epsGrowthPct ?? null,
    revenueGrowthPct: yahoo?.revenueGrowthPct ?? sec?.revenueGrowthPct ?? null,
    roePct: yahoo?.roePct ?? sec?.roePct ?? null,
    debtToEquityPct: yahoo?.debtToEquityPct ?? sec?.debtToEquityPct ?? null,
    source: 'Yahoo Finance quoteSummary + SEC EDGAR companyfacts',
  };
}

function getYahooFormattedTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

async function fetchFundamentals(ticker: string, exchange: string, warnings: string[]) {
  const yahooTicker = getYahooFormattedTicker(ticker, exchange);
  const yahooFundamentals = await getYahooFundamentals(yahooTicker);
  const needsSecFallback = !yahooFundamentals || [
    yahooFundamentals.epsGrowthPct,
    yahooFundamentals.revenueGrowthPct,
    yahooFundamentals.roePct,
    yahooFundamentals.debtToEquityPct,
  ].some((value) => value === null);

  if (!needsSecFallback) return yahooFundamentals;

  const secFundamentals = await getSecFundamentals(ticker);
  const merged = mergeFundamentals(yahooFundamentals, secFundamentals);

  if (!hasAnyFundamentalValue(yahooFundamentals) && hasAnyFundamentalValue(secFundamentals)) {
    warnings.push('Yahoo 기본적 데이터가 부족해 SEC EDGAR 공식 재무제표로 보완했습니다.');
  } else if (hasAnyFundamentalValue(yahooFundamentals) && hasAnyFundamentalValue(secFundamentals)) {
    warnings.push('Yahoo 기본적 데이터의 빈 항목을 SEC EDGAR 공식 재무제표로 보완했습니다.');
  } else if (!merged) {
    warnings.push('Yahoo와 SEC EDGAR에서도 충분한 기본적 데이터를 확보하지 못해 정보 항목으로 표시합니다.');
  }

  return merged;
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
}> {
  const warnings: string[] = [];
  let kisData: OHLCData[] = [];

  try {
    kisData = await getMarketDailyPrice(ticker, exchange, TARGET_KIS_BARS);
    if (kisData.length >= REQUIRED_SEPA_BARS) {
      return {
        data: kisData,
        providerUsed: `KIS (${kisData.length} daily bars)`,
        warnings,
      };
    }

    warnings.push(
      `KIS 일봉은 ${kisData.length}개만 확보했습니다. 52주/장기 이동평균 판정에는 ${REQUIRED_SEPA_BARS}개 이상이 필요해 Yahoo 보완을 시도합니다.`
    );
  } catch (error: unknown) {
    warnings.push(`KIS 조회 실패: ${getErrorMessage(error)}. Yahoo 보완을 시도합니다.`);
  }

  try {
    const yahooTicker = getYahooFormattedTicker(ticker, exchange);
    const yahooData = await getYahooDailyPrice(yahooTicker);
    const data = chooseLongerData(kisData, yahooData);
    const providerUsed =
      data === yahooData
        ? `Yahoo Finance (${yahooData.length} daily bars)`
        : `KIS partial (${kisData.length} daily bars)`;

    if (data.length < REQUIRED_SEPA_BARS) {
      warnings.push(
        `보완 후에도 일봉은 ${data.length}개입니다. 부족한 장기 지표는 저장 차단이 아닌 정보 항목으로 표시합니다.`
      );
    }

    return { data, providerUsed, warnings };
  } catch (error: unknown) {
    if (kisData.length > 0) {
      warnings.push(`Yahoo 보완 실패: ${getErrorMessage(error)}. KIS 부분 데이터로 분석합니다.`);
      return {
        data: kisData,
        providerUsed: `KIS partial (${kisData.length} daily bars)`,
        warnings,
      };
    }

    throw error;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.trim().toUpperCase();
  const exchange = searchParams.get('exchange')?.trim().toUpperCase() || 'NAS';
  const totalEquity = Number(searchParams.get('totalEquity') || DEFAULT_TOTAL_EQUITY);
  const riskPercentInput = Number(searchParams.get('riskPercent') || DEFAULT_RISK_PERCENT_INPUT);
  const riskPercent = riskPercentInput / 100;

  if (!ticker) {
    return apiError('티커를 입력해 주세요.', 'MISSING_TICKER', 400);
  }

  if (!Number.isFinite(totalEquity) || totalEquity <= 0) {
    return apiError('총 자본은 0보다 큰 숫자여야 합니다.', 'INVALID_TOTAL_EQUITY', 400);
  }

  if (!Number.isFinite(riskPercentInput) || riskPercentInput <= 0 || riskPercentInput > 10) {
    return apiError('허용 손실은 0보다 크고 10% 이하인 숫자여야 합니다.', 'INVALID_RISK_PERCENT', 400);
  }

  try {
    // I-3: 동일 티커 중복 호출 방지용 캐시
    const cacheId = cacheKey('market-data', ticker, exchange, totalEquity, riskPercentInput);
    const cached = cacheGet<MarketAnalysisResponse>(cacheId);
    if (cached) {
      return NextResponse.json(cached);
    }

    const { data, providerUsed, warnings } = await fetchPriceData(ticker, exchange);

    let benchmarkTicker = 'SPY';
    if (exchange === 'KOSPI') benchmarkTicker = '^KS11';
    if (exchange === 'KOSDAQ') benchmarkTicker = '^KQ11';

    const [benchmarkData, fundamentals] = await Promise.all([
      getYahooDailyPrice(benchmarkTicker).catch(() => []),
      fetchFundamentals(ticker, exchange, warnings),
    ]);

    const atr = calculateATR(data);
    const entryPrice = calculateEntryPrice(data);
    const sepaEvidence = analyzeSepa(data, { benchmarkData, fundamentals });

    // VCP 분석 — SEPA 필터 후 매수 타점 정밀 분석
    const vcpAnalysis = analyzeVcp(data, entryPrice);

    // VCP 피벗이 있으면 그쪽 기준으로 피라미딩 계획도 생성
    const effectiveEntry = vcpAnalysis.recommendedEntry;
    const riskPlan = calculatePyramidPlan(totalEquity, effectiveEntry, atr, riskPercent);

    if (data.length < REQUIRED_SEPA_BARS) {
      warnings.push('장기 이동평균과 52주 고점 계산에 필요한 가격 데이터가 부족할 수 있습니다.');
    }
    if (sepaEvidence.summary.info > 0) {
      warnings.push('일부 보조 지표는 데이터 제공 상황에 따라 정보 항목으로 표시됩니다.');
    }

    const response: MarketAnalysisResponse = {
      ticker,
      exchange,
      providerUsed,
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

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error('Market Data API Error:', error);
    return apiError(
      getErrorMessage(error) || '시장 데이터를 불러오는 중 오류가 발생했습니다.',
      'MARKET_DATA_FETCH_FAILED',
      500
    );
  }
}
