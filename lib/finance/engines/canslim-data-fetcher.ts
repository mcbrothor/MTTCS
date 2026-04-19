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
import type { CanslimStockData, MarketCode } from '@/types';
import { DATA_QUALITY } from './canslim-criteria';
import { getDartCorpCode, getDartFinancialData, type FundamentalMetrics } from '../providers/dart-api';
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
  ticker: string,
  market: MarketCode
): Promise<{ data: Partial<CanslimStockData>; warnings: string[] }> {
  const warnings: string[] = [];

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

    const fundamentalData: Partial<CanslimStockData> = {
      symbol: ticker,
      market,
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
    };

    // ── KR 마켓 특화 보강 (DART) ──────────────────────────────
    if (market === 'KR') {
      await augmentWithDartData(ticker, fundamentalData, warnings);
    }

    // ── US 마켓 특화 보강 (EDGAR) ──────────────────────────────
    if (market === 'US') {
      await augmentWithEdgarData(ticker, fundamentalData, warnings);
    }

    return {
      data: fundamentalData,
      warnings,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    warnings.push(`FETCH_FAILED:${msg}`);
    return {
      data: {
        symbol: ticker,
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
      },
      warnings,
    };
  }
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

/**
 * DART API를 사용하여 한국 종목의 부족한 펀더멘털 데이터를 보충합니다.
 */
async function augmentWithDartData(
  ticker: string,
  data: Partial<CanslimStockData>,
  warnings: string[]
) {
  try {
    const corpCode = await getDartCorpCode(ticker);
    if (!corpCode) return;

    // 현재 시점 기준으로 최신 분기 판단 (단순화를 위해 현재 연도와 이전 연도 조사)
    const now = new Date();
    const currentYear = now.getFullYear();
    const lastYear = currentYear - 1;

    // DART 보고서 코드: 11013(1Q), 11012(2Q), 11014(3Q), 11011(4Q/사업)
    const checkPeriods = [
      { year: currentYear, code: '11014' }, // 3Q
      { year: currentYear, code: '11012' }, // 2Q
      { year: currentYear, code: '11013' }, // 1Q
      { year: lastYear, code: '11011' },    // Annual (Previous Year)
    ];

    let latestMetrics: FundamentalMetrics | null = null;
    let yearAgoMetrics: FundamentalMetrics | null = null;

    // 1. 최신 가용 분기 찾기
    for (const p of checkPeriods) {
      const m = await getDartFinancialData(corpCode, String(p.year), p.code);
      if (m && m.netIncome !== undefined) {
        latestMetrics = m;
        // 2. 1년 전 동일 분기 데이터 가져오기
        yearAgoMetrics = await getDartFinancialData(corpCode, String(p.year - 1), p.code);
        break;
      }
    }

    if (latestMetrics && yearAgoMetrics) {
      // EPS 성장률 (Net Income 기반)
      if (latestMetrics.netIncome !== undefined && yearAgoMetrics.netIncome !== undefined && yearAgoMetrics.netIncome !== 0) {
        const growth = round(((latestMetrics.netIncome - yearAgoMetrics.netIncome) / Math.abs(yearAgoMetrics.netIncome)) * 100);
        data.currentQtrEpsGrowth = growth;
        data.epsGrowthLast3Qtrs = [growth, data.epsGrowthLast3Qtrs?.[1] ?? null, data.epsGrowthLast3Qtrs?.[2] ?? null];
      }

      // 매출 성장률
      if (latestMetrics.revenue !== undefined && yearAgoMetrics.revenue !== undefined && yearAgoMetrics.revenue !== 0) {
        data.currentQtrSalesGrowth = round(((latestMetrics.revenue - yearAgoMetrics.revenue) / Math.abs(yearAgoMetrics.revenue)) * 100);
      }

      console.log(`✅ [DART] ${ticker} 데이터 보강 완료: EPS ${data.currentQtrEpsGrowth}%, Sales ${data.currentQtrSalesGrowth}%`);
    } else {
      warnings.push('DART_DATA_UNAVAILABLE');
    }
  } catch (err) {
    console.error(`[DART Augmentation Error] ${ticker}:`, err);
    warnings.push('DART_SYNC_FAILED');
  }
}

/**
 * SEC EDGAR API를 사용하여 미국 종목의 부족한 펀더멘털 데이터를 보충합니다.
 */
async function augmentWithEdgarData(
  ticker: string,
  data: Partial<CanslimStockData>,
  warnings: string[]
) {
  try {
    // Yahoo 데이터가 충분하다면 스킵 (보수적으로 1개라도 없으면 시도)
    const needsAugment = data.currentQtrEpsGrowth === null || data.roe === null || data.currentQtrSalesGrowth === null;
    if (!needsAugment) return;

    const edgar = await getSecFundamentals(ticker);
    if (edgar) {
      if (data.currentQtrEpsGrowth === null && edgar.epsGrowthPct !== null) {
        data.currentQtrEpsGrowth = edgar.epsGrowthPct;
      }
      if (data.currentQtrSalesGrowth === null && edgar.revenueGrowthPct !== null) {
        data.currentQtrSalesGrowth = edgar.revenueGrowthPct;
      }
      if (data.roe === null && edgar.roePct !== null) {
        data.roe = edgar.roePct;
      }
      console.log(`✅ [EDGAR] ${ticker} 데이터 보강 완료: ${edgar.source}`);
    }
  } catch (err) {
    console.error(`[EDGAR Augmentation Error] ${ticker}:`, err);
  }
}
