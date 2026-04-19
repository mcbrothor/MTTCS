import axios from 'axios';
import { getYahooFundamentals } from '../providers/yahoo-api';
import { getDartCorpCode, getDartFinancialData, type FundamentalMetrics } from '../providers/dart-api';
import { getSecFundamentals } from '../providers/sec-edgar-api';
import type { FundamentalSnapshot } from '@/types';

/**
 * 전역 펀더멘털 데이터 수집기
 * Yahoo Finance를 기본으로 하되, 국가별 공식 공시(DART/EDGAR) 데이터를 병합하여 신뢰도를 높입니다.
 */
export async function fetchAggregatedFundamentals(
  ticker: string,
  exchange: string,
  warnings: string[] = []
): Promise<FundamentalSnapshot | null> {
  const isKR = exchange === 'KOSPI' || exchange === 'KOSDAQ';
  const yahooTicker = isKR ? `${ticker}.${exchange === 'KOSPI' ? 'KS' : 'KQ'}` : ticker;

  try {
    // 1. Yahoo Finance 기본 데이터 가져오기
    const yahoo = await getYahooFundamentals(yahooTicker);

    // 2. 국가별 공식 데이터 보강 (DART / EDGAR)
    let augmented: FundamentalSnapshot | null = null;

    if (isKR) {
      augmented = await augmentWithDart(ticker, yahoo, warnings);
    } else {
      augmented = await augmentWithEdgar(ticker, yahoo, warnings);
    }

    return augmented || yahoo;
  } catch (err) {
    console.error(`[FundamentalFetcher] Error for ${ticker}:`, err);
    warnings.push(`FUNDAMENTAL_FETCH_ERROR: ${err instanceof Error ? err.message : 'Unknown'}`);
    return null;
  }
}

/**
 * DART API를 사용하여 한국 종목의 펀더멘털 데이터를 보충/교체합니다.
 */
async function augmentWithDart(
  ticker: string,
  yahoo: FundamentalSnapshot | null,
  warnings: string[]
): Promise<FundamentalSnapshot | null> {
  try {
    const corpCode = await getDartCorpCode(ticker);
    if (!corpCode) return yahoo;

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

    let latest: FundamentalMetrics | null = null;
    let yearAgo: FundamentalMetrics | null = null;

    for (const p of checkPeriods) {
      const m = await getDartFinancialData(corpCode, String(p.year), p.code);
      if (m && m.netIncome !== undefined) {
        latest = m;
        yearAgo = await getDartFinancialData(corpCode, String(p.year - 1), p.code);
        break;
      }
    }

    if (latest && yearAgo) {
      const epsGrowth = yearAgo.netIncome ? Number((((latest.netIncome! - yearAgo.netIncome) / Math.abs(yearAgo.netIncome)) * 100).toFixed(2)) : null;
      const revenueGrowth = yearAgo.revenue ? Number((((latest.revenue! - yearAgo.revenue) / Math.abs(yearAgo.revenue)) * 100).toFixed(2)) : null;

      if (yahoo) {
        warnings.push('DART 공식 공시 데이터를 Yahoo 데이터와 병합했습니다.');
        return {
          ...yahoo,
          epsGrowthPct: epsGrowth ?? yahoo.epsGrowthPct,
          revenueGrowthPct: revenueGrowth ?? yahoo.revenueGrowthPct,
          source: `DART (${latest.date}) + Yahoo`,
        };
      }

      return {
        epsGrowthPct: epsGrowth,
        revenueGrowthPct: revenueGrowth,
        roePct: null,
        debtToEquityPct: null,
        source: `DART (${latest.date})`,
      };
    }

    return yahoo;
  } catch (err) {
    warnings.push(`DART 보강 실패: ${err instanceof Error ? err.message : 'Unknown'}`);
    return yahoo;
  }
}

/**
 * SEC EDGAR API를 사용하여 미국 종목의 펀더멘털 데이터를 보충합니다.
 */
async function augmentWithEdgar(
  ticker: string,
  yahoo: FundamentalSnapshot | null,
  warnings: string[]
): Promise<FundamentalSnapshot | null> {
  try {
    const edgar = await getSecFundamentals(ticker);
    if (!edgar) return yahoo;

    if (!yahoo) return edgar;

    const hasAnyVal = (f: FundamentalSnapshot | null) => 
      f && (f.epsGrowthPct !== null || f.revenueGrowthPct !== null || f.roePct !== null);

    if (!hasAnyVal(yahoo) && hasAnyVal(edgar)) {
      warnings.push('Yahoo 데이터가 부족하여 SEC EDGAR 공식 데이터를 사용했습니다.');
    } else if (hasAnyVal(yahoo) && hasAnyVal(edgar)) {
      warnings.push('Yahoo 데이터를 SEC EDGAR 공식 수치로 보강했습니다.');
    }

    return {
      epsGrowthPct: yahoo.epsGrowthPct ?? edgar.epsGrowthPct,
      revenueGrowthPct: yahoo.revenueGrowthPct ?? edgar.revenueGrowthPct,
      roePct: yahoo.roePct ?? edgar.roePct,
      debtToEquityPct: yahoo.debtToEquityPct ?? edgar.debtToEquityPct,
      source: `${edgar.source} + Yahoo`,
    };
  } catch {
    return yahoo;
  }
}
