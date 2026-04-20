import { getYahooFundamentals } from '../providers/yahoo-api';
import { getDartCorpCode, getDartFinancialData, type FundamentalMetrics } from '../providers/dart-api';
import { getSecFundamentals } from '../providers/sec-edgar-api';
import type { FundamentalSnapshot } from '@/types';
import { supabaseServer } from '@/lib/supabase/server';

const CACHE_VALID_DAYS = 90;


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
  const market = isKR ? 'KR' : 'US';

  try {
    // 1. 캐시 확인
    try {
      const { data: cacheData, error } = await supabaseServer
        .from('fundamental_cache')
        .select('*')
        .eq('ticker', ticker)
        .eq('market', market)
        .single();

      if (!error && cacheData) {
        const lastUpdated = new Date(cacheData.updated_at).getTime();
        const now = Date.now();
        const daysSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60 * 24);

        if (daysSinceUpdate < CACHE_VALID_DAYS) {
          return {
            epsGrowthPct: cacheData.eps_growth_pct !== null ? Number(cacheData.eps_growth_pct) : null,
            revenueGrowthPct: cacheData.revenue_growth_pct !== null ? Number(cacheData.revenue_growth_pct) : null,
            roePct: cacheData.roe_pct !== null ? Number(cacheData.roe_pct) : null,
            debtToEquityPct: cacheData.debt_to_equity_pct !== null ? Number(cacheData.debt_to_equity_pct) : null,
            source: cacheData.source || 'Cache',
          };
        }
      }
    } catch {
      // 캐시 에러 무시하고 진행
    }

    // 2. Yahoo Finance 기본 데이터 가져오기
    const yahoo = await getYahooFundamentals(yahooTicker);

    // 3. 국가별 공식 데이터 보강 (DART / EDGAR)
    let augmented: FundamentalSnapshot | null = null;
    if (isKR) {
      augmented = await augmentWithDart(ticker, yahoo, warnings);
    } else {
      augmented = await augmentWithEdgar(ticker, yahoo, warnings);
    }

    const finalResult = augmented || yahoo;

    // 4. 캐시에 저장
    if (finalResult && (finalResult.epsGrowthPct !== null || finalResult.revenueGrowthPct !== null || finalResult.roePct !== null)) {
      try {
        await supabaseServer.from('fundamental_cache').upsert({
          ticker,
          market,
          eps_growth_pct: finalResult.epsGrowthPct,
          revenue_growth_pct: finalResult.revenueGrowthPct,
          roe_pct: finalResult.roePct,
          debt_to_equity_pct: finalResult.debtToEquityPct,
          source: finalResult.source,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'ticker,market' });
      } catch {
        // 저장 실패 무시
      }
    }

    return finalResult;
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
    const checkPeriods: { year: number; code: string }[] = [];
    
    // 올해 1~3Q 시도
    checkPeriods.push({ year: currentYear, code: '11014' });
    checkPeriods.push({ year: currentYear, code: '11012' });
    checkPeriods.push({ year: currentYear, code: '11013' });
    
    // 작년 1~4Q 시도
    checkPeriods.push({ year: currentYear - 1, code: '11011' });
    checkPeriods.push({ year: currentYear - 1, code: '11014' });
    checkPeriods.push({ year: currentYear - 1, code: '11012' });
    checkPeriods.push({ year: currentYear - 1, code: '11013' });

    let latest: FundamentalMetrics | null = null;
    let yearAgo: FundamentalMetrics | null = null;

    for (const p of checkPeriods) {
      // 1. 연결재무제표(CFS) 먼저 시도
      let m = await getDartFinancialData(corpCode, String(p.year), p.code, 'CFS');
      
      // 2. 연결이 없으면 개별재무제표(OFS) 시도
      if (!m || (!m.netIncome && !m.revenue)) {
        m = await getDartFinancialData(corpCode, String(p.year), p.code, 'OFS');
      }

      if (m && m.netIncome !== undefined) {
        latest = m;
        // yearAgo도 같은 fsDiv로 시도해야 공정한 비교가 됨
        const fsDiv = (m as any).fs_div === 'OFS' ? 'OFS' : 'CFS';
        yearAgo = await getDartFinancialData(corpCode, String(p.year - 1), p.code, fsDiv as any);
        
        // yearAgo도 반대 케이스 시도
        if (!yearAgo || (!yearAgo.netIncome && !yearAgo.revenue)) {
           yearAgo = await getDartFinancialData(corpCode, String(p.year - 1), p.code, fsDiv === 'CFS' ? 'OFS' : 'CFS');
        }
        break;
      }
    }

    if (latest) {
      const epsGrowth = (latest && yearAgo && yearAgo.netIncome) 
        ? Number((((latest.netIncome! - yearAgo.netIncome) / Math.abs(yearAgo.netIncome)) * 100).toFixed(2)) 
        : null;
      
      const revenueGrowth = (latest && yearAgo && yearAgo.revenue) 
        ? Number((((latest.revenue! - yearAgo.revenue) / Math.abs(yearAgo.revenue)) * 100).toFixed(2)) 
        : null;

      // ROE 계산: (당기순이익 / 자본) * 100
      // 연율화는 생략하고 해당 시점 스냅샷 기준으로 계산 (11011 사업보고서면 연간 ROE)
      const roe = (latest.netIncome && latest.equity && latest.equity !== 0)
        ? Number(((latest.netIncome / latest.equity) * 100).toFixed(2))
        : null;

      // 부채비율 계산: (부채 / 자본) * 100
      const debtToEquity = (latest.debt && latest.equity && latest.equity !== 0)
        ? Number(((latest.debt / latest.equity) * 100).toFixed(2))
        : null;

      if (yahoo) {
        return {
          ...yahoo,
          epsGrowthPct: epsGrowth ?? yahoo.epsGrowthPct,
          revenueGrowthPct: revenueGrowth ?? yahoo.revenueGrowthPct,
          roePct: roe ?? yahoo.roePct,
          debtToEquityPct: debtToEquity ?? yahoo.debtToEquityPct,
          source: `DART (${latest.date}) + Yahoo`,
        };
      }

      return {
        epsGrowthPct: epsGrowth,
        revenueGrowthPct: revenueGrowth,
        roePct: roe,
        debtToEquityPct: debtToEquity,
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
