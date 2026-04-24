/**
 * CAN SLIM 펀더멘털 데이터 패처
 *
 * Yahoo Finance quoteSummary API를 활용하여 CAN SLIM 평가에 필요한
 * 분기/연간 EPS, 매출, ROE, 기관 보유 데이터를 확보합니다.
 *
 * 제약 사항:
 * - Yahoo API는 비공식이므로 필드 누락이 빈번합니다
 * - 확보 불가한 필드는 null로 처리하고 DATA_PARTIAL 경고를 발생시킵니다
 * - 추후 SEC 13F / DART 연동 시 이 파일을 확장합니다
 */

import axios from 'axios';
import type { CanslimAnalysisCoverage, CanslimPillarKey, CanslimStockData, MarketCode } from '@/types';
import { DATA_QUALITY } from './canslim-criteria';
import { fetchAggregatedFundamentals } from '../market/fundamental-fetcher';
import { getSecFundamentals } from '../providers/sec-edgar-api';


/** Yahoo quoteSummary에서 추출 가능한 원시 응답 구조 */
interface YahooEarningsTrendItem {
  period?: string;
  growth?: { raw?: number };
  earningsEstimate?: {
    avg?: { raw?: number };
    growth?: { raw?: number };
  };
}

interface YahooQuoteSummaryResult {
  financialData?: Record<string, unknown>;
  defaultKeyStatistics?: Record<string, unknown>;
  earningsTrend?: { trend?: YahooEarningsTrendItem[] };
  earningsHistory?: { history?: { epsActual?: { raw?: number }; epsDifference?: { raw?: number }; quarter?: { raw?: number } }[] };
  incomeStatementHistory?: { incomeStatementHistory?: { totalRevenue?: { raw?: number }; netIncome?: { raw?: number } }[] };
  institutionOwnership?: { ownershipList?: { position?: { raw?: number }; reportDate?: { fmt?: string } }[] };
  majorHoldersBreakdown?: Record<string, unknown>;
}

type FundamentalSourceKey =
  | 'currentQtrEpsGrowth'
  | 'priorQtrEpsGrowth'
  | 'epsGrowthLast3Qtrs'
  | 'currentQtrSalesGrowth'
  | 'annualEpsGrowthEachYear'
  | 'hadNegativeEpsInLast3Yr'
  | 'roe'
  | 'floatShares'
  | 'sharesBuyback'
  | 'institutionalSponsorshipTrend'
  | 'institutionalOwnershipPct'
  | 'numInstitutionalHolders';

type FundamentalSourceMap = Partial<Record<FundamentalSourceKey, string>>;

/** Yahoo raw 필드에서 숫자 추출 */
function rawNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value && 'raw' in value) {
    const raw = (value as { raw?: unknown }).raw;
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  }
  return null;
}

/** 퍼센트 변환 (0.25 → 25) */
function toPct(value: number | null): number | null {
  if (value === null) return null;
  return Number((value * 100).toFixed(2));
}

const round = (v: number, d = 2) => Number(v.toFixed(d));

/**
 * Yahoo Finance에서 CAN SLIM 평가에 필요한 펀더멘털 데이터를 패칭합니다.
 *
 * 왜 여러 모듈을 한 번에 요청하는가?
 * - API 호출 수를 최소화하기 위해 한 번의 quoteSummary에서 모든 모듈을 가져옵니다
 * - 개별 모듈이 실패해도 다른 모듈의 데이터는 유지합니다
 */
export async function fetchCanslimFundamentals(
  ticker: string, // Yahoo용 풀 티커 (예: 005930.KS)
  market: MarketCode
): Promise<{
  data: Partial<CanslimStockData>;
  warnings: string[];
  pillarSources: Partial<Record<CanslimPillarKey, string[]>>;
  analysisCoverage: CanslimAnalysisCoverage;
}> {
  const warnings: string[] = [];
  const sourceMap: FundamentalSourceMap = {};

  // DART/EDGAR용 순수 티커 추출 (접미사 제거)
  const baseTicker = ticker.split('.')[0];
  const isKR = market === 'KR';
  // 거래소 추정
  const exchange = isKR ? (ticker.endsWith('.KQ') ? 'KOSDAQ' : 'KOSPI') : 'NAS';

  // 빈 기본 데이터 — Yahoo 실패 시에도 DART/EDGAR로 보강 가능
  const fundamentalData: Partial<CanslimStockData> = {
    symbol: baseTicker,
    market,
    currentQtrEpsGrowth: null,
    priorQtrEpsGrowth: null,
    epsGrowthLast3Qtrs: [null, null, null],
    currentQtrSalesGrowth: null,
    annualEpsGrowthEachYear: [null, null, null],
    hadNegativeEpsInLast3Yr: null,
    roe: null,
    floatShares: null,
    sharesBuyback: null,
    institutionalSponsorshipTrend: null,
    institutionalOwnershipPct: null,
    numInstitutionalHolders: null,
  };

  // ── Phase 1: Yahoo Finance quoteSummary (독립 try-catch) ──────────────────
  // 왜 별도 try-catch인가? Yahoo는 비공식 API라 자주 실패하지만,
  // DART/EDGAR는 공식 API이므로 Yahoo 실패가 전체를 차단하면 안 됨
  let yahooSucceeded = false;
  try {
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`,
      {
        params: {
          modules: [
            'financialData',
            'defaultKeyStatistics',
            'earningsTrend',
            'earningsHistory',
            'incomeStatementHistory',
            'institutionOwnership',
            'majorHoldersBreakdown',
          ].join(','),
        },
        headers: { 'user-agent': 'MTN/4.0' },
        timeout: 15000,
      }
    );

    const result: YahooQuoteSummaryResult =
      response.data?.quoteSummary?.result?.[0] || {};

    // ── C: 분기 EPS/매출 성장률 ────────────────────────────────
    const { currentQtrEpsGrowth, priorQtrEpsGrowth, epsGrowthLast3Qtrs } =
      extractQuarterlyEps(result, warnings);
    const currentQtrSalesGrowth = extractSalesGrowth(result, warnings);

    // ── A: 연간 EPS/ROE ──────────────────────────────────────
    const { annualEpsGrowthEachYear, hadNegativeEpsInLast3Yr } =
      extractAnnualEps(result, warnings);
    const roe = extractRoe(result, warnings);

    // ── I: 기관 보유 ─────────────────────────────────────────
    const institutional = extractInstitutional(result, warnings);

    // ── S: Float / 자사주 ────────────────────────────────────
    const floatShares = rawNum(result.defaultKeyStatistics?.floatShares);
    const sharesBuyback = extractBuyback(result);
    if (floatShares === null) warnings.push(DATA_QUALITY.PARTIAL_LABEL + ':floatShares');

    // Yahoo 데이터로 기본값 업데이트
    Object.assign(fundamentalData, {
      currentQtrEpsGrowth,
      priorQtrEpsGrowth,
      epsGrowthLast3Qtrs,
      currentQtrSalesGrowth,
      annualEpsGrowthEachYear,
      hadNegativeEpsInLast3Yr,
      roe,
      floatShares,
      sharesBuyback,
      ...institutional,
    });
    if (currentQtrEpsGrowth !== null) sourceMap.currentQtrEpsGrowth = 'Yahoo Finance quoteSummary';
    if (priorQtrEpsGrowth !== null) sourceMap.priorQtrEpsGrowth = 'Yahoo Finance quoteSummary';
    if (epsGrowthLast3Qtrs.some((value) => value !== null)) sourceMap.epsGrowthLast3Qtrs = 'Yahoo Finance earningsHistory';
    if (currentQtrSalesGrowth !== null) sourceMap.currentQtrSalesGrowth = 'Yahoo Finance financialData';
    if (annualEpsGrowthEachYear.some((value) => value !== null)) sourceMap.annualEpsGrowthEachYear = 'Yahoo Finance incomeStatementHistory';
    if (hadNegativeEpsInLast3Yr !== null) sourceMap.hadNegativeEpsInLast3Yr = 'Yahoo Finance incomeStatementHistory';
    if (roe !== null) sourceMap.roe = 'Yahoo Finance financialData';
    if (floatShares !== null) sourceMap.floatShares = 'Yahoo Finance defaultKeyStatistics';
    if (sharesBuyback !== null) sourceMap.sharesBuyback = 'Yahoo Finance defaultKeyStatistics';
    if (institutional.institutionalSponsorshipTrend !== null) sourceMap.institutionalSponsorshipTrend = 'Yahoo Finance institutionOwnership';
    if (institutional.institutionalOwnershipPct !== null) sourceMap.institutionalOwnershipPct = 'Yahoo Finance majorHoldersBreakdown';
    if (institutional.numInstitutionalHolders !== null) sourceMap.numInstitutionalHolders = 'Yahoo Finance institutionOwnership';
    yahooSucceeded = true;
  } catch (yahooError) {
    // Yahoo 실패 — 경고만 남기고 Phase 2로 계속 진행
    const msg = yahooError instanceof Error ? yahooError.message : 'Unknown error';
    warnings.push(`YAHOO_FAILED:${msg}`);
    console.warn(`[CAN SLIM Fetcher] Yahoo quoteSummary 실패 (${ticker}): ${msg} — DART/EDGAR로 대체 시도`);
  }

  // ── Phase 2: DART / EDGAR 공식 데이터 보강 (Yahoo 성공 여부와 무관하게 실행) ──
  // 왜 항상 실행하는가? 공식 공시 데이터가 Yahoo보다 정확하므로,
  // Yahoo가 성공해도 공식 데이터로 덮어쓰는 것이 올바름
  try {
    const fundamentalSnapshot = await fetchAggregatedFundamentals(
      baseTicker,
      exchange,
      warnings
    );
    const richSecSnapshot = market === 'US'
      ? await getSecFundamentals(baseTicker)
      : null;
    const mergedSnapshot = richSecSnapshot
      ? {
          ...fundamentalSnapshot,
          ...richSecSnapshot,
          source: richSecSnapshot.source,
        }
      : fundamentalSnapshot;

    if (mergedSnapshot) {
      const officialSource = mergedSnapshot.source;
      if (mergedSnapshot.epsGrowthPct !== null) {
        fundamentalData.currentQtrEpsGrowth = mergedSnapshot.epsGrowthPct;
        if (fundamentalData.epsGrowthLast3Qtrs) {
          fundamentalData.epsGrowthLast3Qtrs[0] = mergedSnapshot.epsGrowthPct;
        }
        sourceMap.currentQtrEpsGrowth = officialSource;
        sourceMap.epsGrowthLast3Qtrs = officialSource;
      }
      if (mergedSnapshot.currentQtrEpsGrowth !== null && mergedSnapshot.currentQtrEpsGrowth !== undefined) {
        fundamentalData.currentQtrEpsGrowth = mergedSnapshot.currentQtrEpsGrowth;
        sourceMap.currentQtrEpsGrowth = officialSource;
      }
      if (mergedSnapshot.priorQtrEpsGrowth !== null && mergedSnapshot.priorQtrEpsGrowth !== undefined) {
        fundamentalData.priorQtrEpsGrowth = mergedSnapshot.priorQtrEpsGrowth;
        sourceMap.priorQtrEpsGrowth = officialSource;
      }
      if (mergedSnapshot.epsGrowthLast3Qtrs?.some((value) => value !== null)) {
        fundamentalData.epsGrowthLast3Qtrs = mergedSnapshot.epsGrowthLast3Qtrs;
        sourceMap.epsGrowthLast3Qtrs = officialSource;
      }
      if (mergedSnapshot.revenueGrowthPct !== null) {
        fundamentalData.currentQtrSalesGrowth = mergedSnapshot.revenueGrowthPct;
        sourceMap.currentQtrSalesGrowth = officialSource;
      }
      if (mergedSnapshot.currentQtrSalesGrowth !== null && mergedSnapshot.currentQtrSalesGrowth !== undefined) {
        fundamentalData.currentQtrSalesGrowth = mergedSnapshot.currentQtrSalesGrowth;
        sourceMap.currentQtrSalesGrowth = officialSource;
      }
      if (mergedSnapshot.annualEpsGrowthEachYear?.some((value) => value !== null)) {
        fundamentalData.annualEpsGrowthEachYear = mergedSnapshot.annualEpsGrowthEachYear;
        sourceMap.annualEpsGrowthEachYear = officialSource;
      }
      if (mergedSnapshot.hadNegativeEpsInLast3Yr !== null && mergedSnapshot.hadNegativeEpsInLast3Yr !== undefined) {
        fundamentalData.hadNegativeEpsInLast3Yr = mergedSnapshot.hadNegativeEpsInLast3Yr;
        sourceMap.hadNegativeEpsInLast3Yr = officialSource;
      }
      if (mergedSnapshot.floatShares !== null && mergedSnapshot.floatShares !== undefined) {
        fundamentalData.floatShares = mergedSnapshot.floatShares;
        sourceMap.floatShares = officialSource;
      }
      if (mergedSnapshot.sharesBuyback !== null && mergedSnapshot.sharesBuyback !== undefined) {
        fundamentalData.sharesBuyback = mergedSnapshot.sharesBuyback;
        sourceMap.sharesBuyback = officialSource;
      }
      if (mergedSnapshot.roePct !== null) {
        fundamentalData.roe = mergedSnapshot.roePct;
        sourceMap.roe = officialSource;
      }
    }
  } catch (augmentError) {
    // DART/EDGAR도 실패하면 경고만 남김
    const msg = augmentError instanceof Error ? augmentError.message : 'Unknown';
    warnings.push(`AUGMENT_FAILED:${msg}`);
    console.warn(`[CAN SLIM Fetcher] DART/EDGAR 보강 실패 (${ticker}): ${msg}`);
  }

  // Yahoo와 DART/EDGAR 모두 실패한 경우 최종 경고
  if (!yahooSucceeded && fundamentalData.currentQtrEpsGrowth === null) {
    warnings.push('ALL_SOURCES_FAILED: Yahoo + DART/EDGAR 모두 펀더멘탈 데이터 확보 실패');
  }

  return {
    data: fundamentalData,
    warnings,
    pillarSources: buildPillarSources(sourceMap),
    analysisCoverage: assessCanslimFundamentalCoverage(fundamentalData),
  };
}

export function assessCanslimFundamentalCoverage(data: Partial<CanslimStockData>): CanslimAnalysisCoverage {
  const missingFields: string[] = [];
  const quarterlySeries = data.epsGrowthLast3Qtrs ?? [];
  const validQuarterlySeries = quarterlySeries.filter((value): value is number => value !== null);
  const annualSeries = data.annualEpsGrowthEachYear ?? [];
  const validAnnualSeries = annualSeries.filter((value): value is number => value !== null);

  if (data.currentQtrEpsGrowth === null || data.currentQtrEpsGrowth === undefined) missingFields.push('C.currentQtrEpsGrowth');
  if (data.currentQtrSalesGrowth === null || data.currentQtrSalesGrowth === undefined) missingFields.push('C.currentQtrSalesGrowth');
  if (validQuarterlySeries.length < 3) missingFields.push('C.epsGrowthLast3Qtrs');

  if (data.hadNegativeEpsInLast3Yr === null || data.hadNegativeEpsInLast3Yr === undefined) missingFields.push('A.hadNegativeEpsInLast3Yr');
  if (data.roe === null || data.roe === undefined) missingFields.push('A.roe');
  if (validAnnualSeries.length < 2) missingFields.push('A.annualEpsGrowthEachYear');

  if (data.institutionalOwnershipPct === null || data.institutionalOwnershipPct === undefined) missingFields.push('I.institutionalOwnershipPct');
  if (data.numInstitutionalHolders === null || data.numInstitutionalHolders === undefined) missingFields.push('I.numInstitutionalHolders');

  return {
    complete: missingFields.length === 0,
    missingFields,
  };
}

export function buildPillarSources(
  sourceMap: FundamentalSourceMap
): Partial<Record<CanslimPillarKey, string[]>> {
  const pillars: Partial<Record<CanslimPillarKey, string[]>> = {};
  const append = (pillar: CanslimPillarKey, source?: string) => {
    if (!source) return;
    const current = pillars[pillar] ?? [];
    if (!current.includes(source)) current.push(source);
    pillars[pillar] = current;
  };

  append('C', sourceMap.currentQtrEpsGrowth);
  append('C', sourceMap.priorQtrEpsGrowth);
  append('C', sourceMap.epsGrowthLast3Qtrs);
  append('C', sourceMap.currentQtrSalesGrowth);

  append('A', sourceMap.annualEpsGrowthEachYear);
  append('A', sourceMap.hadNegativeEpsInLast3Yr);
  append('A', sourceMap.roe);

  append('S', sourceMap.floatShares);
  append('S', sourceMap.sharesBuyback);

  append('I', sourceMap.institutionalSponsorshipTrend);
  append('I', sourceMap.institutionalOwnershipPct);
  append('I', sourceMap.numInstitutionalHolders);

  return pillars;
}

// === 내부 추출 함수들 ===

/**
 * 분기 EPS 성장률 추출
 *
 * earningsTrend.trend에서 +1q(다음 분기)와 0q(현재 분기) 예상치를 추출합니다.
 * earningsHistory.history에서 실제 EPS 실적 데이터를 추출하여 YoY 성장률을 계산합니다.
 */
function extractQuarterlyEps(
  result: YahooQuoteSummaryResult,
  warnings: string[]
): {
  currentQtrEpsGrowth: number | null;
  priorQtrEpsGrowth: number | null;
  epsGrowthLast3Qtrs: (number | null)[];
} {
  // earningsTrend에서 성장률 직접 확보
  const trends = result.earningsTrend?.trend || [];
  const currentTrend = trends.find((t) => t.period === '0q');
  const nextTrend = trends.find((t) => t.period === '+1q');

  const currentQtrEpsGrowth = toPct(rawNum(currentTrend?.growth)) ??
    toPct(rawNum(result.defaultKeyStatistics?.earningsQuarterlyGrowth));
  const priorQtrEpsGrowth = toPct(rawNum(nextTrend?.growth));

  if (currentQtrEpsGrowth === null) {
    warnings.push(DATA_QUALITY.PARTIAL_LABEL + ':currentQtrEpsGrowth');
  }

  // earningsHistory에서 최근 3분기 실적 추출 시도
  const history = result.earningsHistory?.history || [];
  const epsGrowthLast3Qtrs: (number | null)[] = [
    currentQtrEpsGrowth,
    priorQtrEpsGrowth,
    null, // 2분기 전 — Yahoo에서 직접 제공하지 않는 경우가 많음
  ];

  // history에 4개 이상 분기가 있으면 YoY 성장률 계산 시도
  if (history.length >= 4) {
    for (let i = 0; i < Math.min(3, history.length - 1); i++) {
      const current = rawNum(history[i]?.epsActual);
      const yearAgo = rawNum(history[i + 4 < history.length ? i + 4 : history.length - 1]?.epsActual);
      if (current !== null && yearAgo !== null && yearAgo !== 0) {
        epsGrowthLast3Qtrs[i] = round(((current - yearAgo) / Math.abs(yearAgo)) * 100);
      }
    }
  }

  if (epsGrowthLast3Qtrs.some((v) => v === null)) {
    warnings.push(DATA_QUALITY.PARTIAL_LABEL + ':epsGrowthLast3Qtrs');
  }

  return { currentQtrEpsGrowth, priorQtrEpsGrowth, epsGrowthLast3Qtrs };
}

/** 분기 매출 성장률 추출 */
function extractSalesGrowth(
  result: YahooQuoteSummaryResult,
  warnings: string[]
): number | null {
  const growth = toPct(rawNum(result.financialData?.revenueGrowth));
  if (growth === null) warnings.push(DATA_QUALITY.PARTIAL_LABEL + ':salesGrowth');
  return growth;
}

/**
 * 연간 EPS 성장률 추출
 *
 * incomeStatementHistory에서 연도별 순이익(netIncome)을 추출하여
 * 각 연도의 YoY 성장률을 독립적으로 계산합니다.
 * v2.0 핵심: 평균이 아닌 각 연도 독립 검증
 */
function extractAnnualEps(
  result: YahooQuoteSummaryResult,
  warnings: string[]
): {
  annualEpsGrowthEachYear: (number | null)[];
  hadNegativeEpsInLast3Yr: boolean | null;
} {
  const statements = result.incomeStatementHistory?.incomeStatementHistory || [];

  if (statements.length < 2) {
    warnings.push(DATA_QUALITY.PARTIAL_LABEL + ':annualEpsGrowth');
    return {
      annualEpsGrowthEachYear: [null, null, null],
      hadNegativeEpsInLast3Yr: null,
    };
  }

  const netIncomes = statements.map((s) => rawNum(s.netIncome));
  const growths: (number | null)[] = [];
  let hadNegative = false;

  // 최근 3년간 각 연도 독립 성장률 계산
  for (let i = 0; i < Math.min(3, netIncomes.length - 1); i++) {
    const current = netIncomes[i];
    const prev = netIncomes[i + 1];

    if (current !== null && current < 0) hadNegative = true;
    if (prev !== null && prev < 0) hadNegative = true;

    if (current !== null && prev !== null && prev !== 0) {
      growths.push(round(((current - prev) / Math.abs(prev)) * 100));
    } else {
      growths.push(null);
    }
  }

  // 3개 미만이면 null로 패딩
  while (growths.length < 3) growths.push(null);

  if (growths.some((v) => v === null)) {
    warnings.push(DATA_QUALITY.PARTIAL_LABEL + ':annualEpsGrowthIndividual');
  }

  return {
    annualEpsGrowthEachYear: growths,
    hadNegativeEpsInLast3Yr: hadNegative,
  };
}

/** ROE 추출 */
function extractRoe(
  result: YahooQuoteSummaryResult,
  warnings: string[]
): number | null {
  const roe = toPct(rawNum(result.financialData?.returnOnEquity));
  if (roe === null) warnings.push(DATA_QUALITY.PARTIAL_LABEL + ':roe');
  return roe;
}

/**
 * 기관 보유 데이터 추출
 *
 * 현재: Yahoo institutionOwnership + majorHoldersBreakdown
 * 추후: SEC 13F / DART API로 교체 예정 (미국/국내 별도)
 */
function extractInstitutional(
  result: YahooQuoteSummaryResult,
  warnings: string[]
): Pick<CanslimStockData, 'institutionalSponsorshipTrend' | 'institutionalOwnershipPct' | 'numInstitutionalHolders'> {
  const holders = result.institutionOwnership?.ownershipList || [];
  const numInstitutionalHolders = holders.length > 0 ? holders.length : null;

  // majorHoldersBreakdown에서 기관 보유 비율 추출
  const breakdown = result.majorHoldersBreakdown || {};
  const institutionsHoldPct = rawNum(breakdown.institutionsPercentHeld);
  const institutionalOwnershipPct = toPct(institutionsHoldPct);

  // 추세 판정 — Yahoo에서 추세 데이터를 직접 제공하지 않으므로 INFO 처리
  // 향후 SEC 13F 분기별 비교로 정확한 추세 산출 예정
  let institutionalSponsorshipTrend: CanslimStockData['institutionalSponsorshipTrend'] = null;
  if (holders.length >= 2) {
    // 보유 기관이 많으면 FLAT으로 기본 설정 (정확한 추세 산출 불가)
    institutionalSponsorshipTrend = 'FLAT';
  }

  if (numInstitutionalHolders === null || institutionalOwnershipPct === null) {
    warnings.push(DATA_QUALITY.PARTIAL_LABEL + ':institutional');
  }

  return {
    institutionalSponsorshipTrend,
    institutionalOwnershipPct,
    numInstitutionalHolders,
  };
}

/** 자사주 매입 여부 추출 — Yahoo에서 직접 제공하지 않으므로 null 기본 */
function extractBuyback(result: YahooQuoteSummaryResult): boolean | null {
  // sharesOutstanding vs floatShares 차이로 간접 추정 가능하나
  // 정확도가 낮아 현재는 null 처리
  const sharesOutstanding = rawNum(result.defaultKeyStatistics?.sharesOutstanding);
  const floatShares = rawNum(result.defaultKeyStatistics?.floatShares);

  if (sharesOutstanding !== null && floatShares !== null && sharesOutstanding > 0) {
    // 유통 비율이 80% 미만이면 자사주 보유 가능성 있으나, 매입 '실시' 여부와는 다름
    // 정확한 판정 불가 → null
    return null;
  }
  return null;
}


