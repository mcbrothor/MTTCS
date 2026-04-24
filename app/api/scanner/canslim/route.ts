/**
 * CAN SLIM 스캐너 API 엔드포인트
 *
 * GET /api/scanner/canslim?ticker=AAPL&exchange=NASDAQ
 *
 * 개별 종목에 대해 CAN SLIM 7 Pillar 평가를 실행하고,
 * 기존 VCP 엔진 결과와 교차 비교하여 이중 검증 티어를 반환합니다.
 */

import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { fetchCanslimFundamentals } from '@/lib/finance/engines/canslim-data-fetcher';
import { evaluateCanslim, determineDualScreenerTier } from '@/lib/finance/engines/canslim-engine';
import { enforceCanslimAnalysisCoverage } from '@/lib/finance/engines/canslim-coverage';
import { detectBasePattern } from '@/lib/finance/engines/base-pattern-engine';
import { analyzeVcp } from '@/lib/finance/engines/vcp';
import { analyzeSepa } from '@/lib/finance/core/sepa';
import { calculateMovingAverage } from '@/lib/finance/core/moving-average';
import { MACRO_CRITERIA } from '@/lib/finance/engines/canslim-criteria';
import type {
  CanslimMacroMarketData,
  CanslimScannerResult,
  CanslimStockData,
  MarketCode,
  OHLCData,
} from '@/types';

export const dynamic = 'force-dynamic';

/**
 * 왜 master-filter에서 매크로 데이터를 직접 가져오지 않는가?
 * - master-filter API는 전체 시장 분석용으로 응답이 무겁습니다
 * - CAN SLIM에서는 분배일 수와 FTD 여부만 필요합니다
 * - 향후 Supabase에 캐시된 매크로 데이터를 직접 조회하는 것으로 개선 가능
 */

function getYahooTicker(ticker: string, exchange: string): string {
  const upper = ticker.toUpperCase();
  const ex = (exchange || '').toUpperCase();
  
  // 이미 접미사가 붙어있는 경우 그대로 반환
  if (upper.includes('.') && (upper.endsWith('.KS') || upper.endsWith('.KQ'))) return upper;
  
  // 한국 시장 접미사 처리
  if (ex === 'KOSPI' || ex === 'KS') return `${upper}.KS`;
  if (ex === 'KOSDAQ' || ex === 'KQ') return `${upper}.KQ`;
  
  return upper;
}

async function loadMacroData(market: MarketCode, exchange?: string): Promise<CanslimMacroMarketData> {
  try {
    // 유니버스에 맞는 벤치마크 선택 — 나스닥이면 QQQ, 한국이면 ^KS200
    const mainSymbol = market === 'KR'
      ? (exchange === 'KOSDAQ' ? '^KQ150' : '^KS200')
      : (exchange === 'NASDAQ' || exchange === 'NAS' ? 'QQQ' : 'SPY');
    const mainData = await getYahooDailyPrice(mainSymbol);

    // 분배일 계산 (최근 25거래일 = 5주)
    // IBD 원칙: 가격이 0.2% 이상 하락 + 거래량이 50일 평균보다 높을 때만 분배일
    let distributionDayCount = 0;
    const dropThreshold = MACRO_CRITERIA.DISTRIBUTION_DAY_DROP_PCT / 100;
    const lookbackStart = Math.max(1, mainData.length - 25);

    for (let i = lookbackStart; i < mainData.length; i++) {
      const prev = mainData[i - 1];
      const curr = mainData[i];
      
      // 50일 평균 거래량 계산 (IBD 분배일 기준의 핵심)
      const vol50Start = Math.max(0, i - 50);
      const vol50Slice = mainData.slice(vol50Start, i);
      const avgVolume50 = vol50Slice.length > 0
        ? vol50Slice.reduce((sum, d) => sum + d.volume, 0) / vol50Slice.length
        : curr.volume;
      
      const priceDroppedSignificantly = curr.close < prev.close * (1 - dropThreshold);
      // 오닐/IBD 이론: 당일 하락 시 거래량이 평소(50일 평균)보다 많아야 본격적인 분배일로 간주
      const volumeHigherThanAvg = curr.volume > avgVolume50;
      
      if (priceDroppedSignificantly && volumeHigherThanAvg) {
        distributionDayCount++;
      }
    }

    // FTD 감지 — IBD 원전 기준:
    // 1) 랠리 시도 시작일(저점) 탐색
    // 2) 시작일로부터 최소 4거래일 이후
    // 3) 당일 +1.5% 이상 상승
    // 4) 당일 거래량 > 전일 거래량 AND > 50일 평균 거래량
    let followThroughDay = false;
    let lastFTDDate: string | null = null;
    const ftdLookback = mainData.slice(-60);
    const avg50Vol = mainData.length >= 50
      ? mainData.slice(-50).reduce((sum, d) => sum + d.volume, 0) / 50
      : 0;

    // 랠리 시도 시작일: 최근 60일 내 최저가 형성 후 당일 낙폭이 전일 대비 줄어드는 첫 날
    let rallyStartIdx = -1;
    for (let i = 1; i < ftdLookback.length; i++) {
      const prev = ftdLookback[i - 1];
      const curr = ftdLookback[i];
      if (curr.close > prev.close) {
        rallyStartIdx = i;
        break;
      }
    }

    if (rallyStartIdx >= 0) {
      for (let i = rallyStartIdx + MACRO_CRITERIA.FTD_EARLIEST_DAY; i < ftdLookback.length; i++) {
        const prev = ftdLookback[i - 1];
        const curr = ftdLookback[i];
        const gainPct = ((curr.close - prev.close) / prev.close) * 100;
        const volumeAboveAvg = avg50Vol > 0 ? curr.volume > avg50Vol : curr.volume > prev.volume;
        if (gainPct >= MACRO_CRITERIA.FTD_MIN_GAIN_PCT && curr.volume > prev.volume && volumeAboveAvg) {
          followThroughDay = true;
          lastFTDDate = curr.date;
        }
      }
    }

    // actionLevel 결정
    const lastClose = mainData.at(-1)?.close ?? 0;
    const ma50 = calculateMovingAverage(mainData, 50);
    const ma200 = calculateMovingAverage(mainData, 200);
    const aboveMa50 = ma50 !== null && lastClose > ma50;
    const aboveMa200 = ma200 !== null && lastClose > ma200;

    let actionLevel: CanslimMacroMarketData['actionLevel'] = 'FULL';
    
    // 사용자 피드백 반영: 분배일은 경고용이며, REDUCED/HALT 판정은 오직 이평선 이탈 기준으로만 수행
    if (!aboveMa200) {
      actionLevel = 'HALT';
    } else if (!aboveMa50) {
      actionLevel = 'REDUCED';
    }

    return { actionLevel, distributionDayCount, followThroughDay, lastFTDDate, benchmarkData: mainData };
  } catch {
    // 매크로 패치 실패 시 보수적으로 REDUCED 처리
    return {
      actionLevel: 'REDUCED',
      distributionDayCount: 0,
      followThroughDay: false,
      lastFTDDate: null,
      benchmarkData: [],
    };
  }
}

/**
 * 일봉 데이터에서 CAN SLIM StockData 구조를 구성합니다.
 * 펀더멘털 데이터는 별도 패처에서 확보합니다.
 */
function buildStockData(
  ticker: string,
  market: MarketCode,
  priceData: OHLCData[],
  fundamentals: Partial<CanslimStockData>,
  rsRating: number | null,
  mansfieldRsFlag: boolean | null,
  pivotPoint: number | null,
  detectedBasePattern: CanslimStockData['detectedBasePattern'],
  weeksBuildingBase: number | null
): CanslimStockData {
  const latest = priceData.at(-1);
  const currentPrice = latest?.close ?? 0;
  const high52w = priceData.length >= 252
    ? Math.max(...priceData.slice(-252).map((d) => d.high))
    : Math.max(...priceData.map((d) => d.high));
  const avg50Volume = priceData.length >= 50
    ? priceData.slice(-50).reduce((sum, d) => sum + d.volume, 0) / 50
    : priceData.reduce((sum, d) => sum + d.volume, 0) / Math.max(priceData.length, 1);

  return {
    symbol: ticker,
    market,
    marketCap: fundamentals.marketCap ?? null,
    currentPrice,
    price52WeekHigh: high52w,
    dailyVolume: latest?.volume ?? 0,
    avgVolume50: avg50Volume,
    pivotPoint,
    weeksBuildingBase,
    detectedBasePattern,
    rsRating,
    mansfieldRsFlag,
    // 펀더멘털 데이터 (패처에서 확보)
    currentQtrEpsGrowth: fundamentals.currentQtrEpsGrowth ?? null,
    priorQtrEpsGrowth: fundamentals.priorQtrEpsGrowth ?? null,
    nextQtrEpsEstimate: fundamentals.nextQtrEpsEstimate ?? null,
    epsGrowthLast3Qtrs: fundamentals.epsGrowthLast3Qtrs ?? [null, null, null],
    currentQtrSalesGrowth: fundamentals.currentQtrSalesGrowth ?? null,
    annualEpsGrowthEachYear: fundamentals.annualEpsGrowthEachYear ?? [null, null, null],
    hadNegativeEpsInLast3Yr: fundamentals.hadNegativeEpsInLast3Yr ?? null,
    roe: fundamentals.roe ?? null,
    floatShares: fundamentals.floatShares ?? null,
    sharesBuyback: fundamentals.sharesBuyback ?? null,
    institutionalSponsorshipTrend: fundamentals.institutionalSponsorshipTrend ?? null,
    institutionalOwnershipPct: fundamentals.institutionalOwnershipPct ?? null,
    numInstitutionalHolders: fundamentals.numInstitutionalHolders ?? null,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase();
    const exchange = searchParams.get('exchange') || '';

    if (!ticker) {
      return NextResponse.json(
        { message: 'ticker 파라미터가 필요합니다.', code: 'INVALID_INPUT', recoverable: true },
        { status: 400 }
      );
    }

    // 시장 판별
    const market: MarketCode = exchange.includes('KS') || exchange.includes('KQ') || exchange.includes('KOSPI') || exchange.includes('KOSDAQ') ? 'KR' : 'US';
    // 벤치마크 선택을 위한 거래소 표준화
    const normalizedExchange = exchange.includes('KOSDAQ') || exchange.includes('KQ') ? 'KOSDAQ'
      : exchange.includes('KOSPI') || exchange.includes('KS') ? 'KOSPI'
      : exchange.includes('NAS') || exchange.includes('NDQ') ? 'NASDAQ'
      : 'NYSE';

    // 1. 가격 데이터 + 펀더멘털 + 매크로를 병렬 패칭
    const yahooTicker = getYahooTicker(ticker, exchange);

    const [priceData, fundamentalResult, macro, dbMetric] = await Promise.all([
      getYahooDailyPrice(yahooTicker),
      fetchCanslimFundamentals(yahooTicker, market),
      loadMacroData(market, normalizedExchange),
      supabaseServer
        .from('stock_metrics')
        .select('rs_rating')
        .eq('ticker', ticker)
        .eq('market', market)
        .maybeSingle()
        .then(res => res.data)
    ]);

    if (priceData.length < 50) {
      return NextResponse.json(
        { message: `${ticker} 가격 데이터가 부족합니다 (${priceData.length}일).`, code: 'NO_DATA', recoverable: false },
        { status: 400 }
      );
    }

    // 2. SEPA/VCP 분석 (기존 엔진 재활용)
    const breakoutPrice = Math.max(...priceData.slice(-50).map((d) => d.high));
    const sepaEvidence = analyzeSepa(priceData, {
      benchmarkData: macro.benchmarkData,
      fundamentals: {
        epsGrowthPct: fundamentalResult.data.currentQtrEpsGrowth ?? null,
        revenueGrowthPct: fundamentalResult.data.currentQtrSalesGrowth ?? null,
        roePct: fundamentalResult.data.roe ?? null,
        debtToEquityPct: null,
        source: fundamentalResult.data.roe ? 'Yahoo Finance + Snapshot' : 'Calculated',
      },
      preCalculatedRs: dbMetric?.rs_rating ?? undefined,
      rsSourceHint: dbMetric?.rs_rating !== undefined && dbMetric?.rs_rating !== null ? 'DB_BATCH' : undefined,
      market,
      exchange: normalizedExchange,
    });
    const vcpAnalysis = analyzeVcp(priceData, breakoutPrice, {
      rsRating: sepaEvidence.metrics.rsRating ?? null,
    });

    // 3. 베이스 패턴 감지
    const vcpBasePattern = vcpAnalysis.grade === 'strong' || vcpAnalysis.grade === 'forming'
      ? {
        type: 'VCP' as const,
        pivotPoint: vcpAnalysis.pivotPrice ?? vcpAnalysis.recommendedEntry,
        weeksForming: Math.ceil(vcpAnalysis.baseLength / 5),
        depthPct: vcpAnalysis.contractions[0]?.depthPct ?? 0,
        isValid: true,
        confidence: vcpAnalysis.grade === 'strong' ? 'HIGH' as const : 'MEDIUM' as const,
      }
      : null;
    const basePattern = detectBasePattern(priceData, vcpBasePattern);

    // 4. CAN SLIM 평가용 StockData 구성
    // CAN SLIM RS pass/fail은 유니버스 백분위 DB값만 사용. proxy RS는 info 표시용으로만.
    const stockData = buildStockData(
      ticker,
      market,
      priceData,
      fundamentalResult.data,
      dbMetric?.rs_rating ?? null,
      sepaEvidence.metrics.mansfieldRsFlag ?? null,
      basePattern?.pivotPoint ?? vcpAnalysis.pivotPrice ?? null,
      basePattern?.type ?? null,
      basePattern?.weeksForming ?? null
    );

    // 5. CAN SLIM 7 Pillar 평가
    const canslimResult = enforceCanslimAnalysisCoverage(
      evaluateCanslim(stockData, macro, false, stockData.currentPrice),
      fundamentalResult.analysisCoverage
    );

    // 6. 이중 검증 티어
    const dualTier = determineDualScreenerTier(canslimResult.pass, vcpAnalysis.grade);

    // 7. 데이터 경고 합산
    const dataWarnings = [...fundamentalResult.warnings];
    if (!macro.followThroughDay && macro.distributionDayCount >= 4) {
      dataWarnings.push('MACRO_PRESSURE');
    }
    if (!fundamentalResult.analysisCoverage.complete) {
      dataWarnings.push(`CANSLIM_ANALYSIS_INCOMPLETE:${fundamentalResult.analysisCoverage.missingFields.join(',')}`);
    }

    const result: CanslimScannerResult = {
      ticker,
      exchange,
      name: ticker, // 추후 security-lookup에서 보강
      market,
      currentPrice: stockData.currentPrice,
      marketCap: fundamentalResult.data.marketCap ?? null,
      currency: market === 'KR' ? 'KRW' : 'USD',
      canslimResult,
      basePattern,
      vcpGrade: vcpAnalysis.grade,
      vcpScore: vcpAnalysis.score,
      dualTier,
      rsRating: sepaEvidence.metrics.rsRating ?? sepaEvidence.metrics.benchmarkRelativeScore ?? null,
      rsSource: sepaEvidence.metrics.rsSource ?? null,
      benchmarkRelativeScore: sepaEvidence.metrics.benchmarkRelativeScore ?? null,
      mansfieldRsFlag: sepaEvidence.metrics.mansfieldRsFlag ?? null,
      dataSources: {
        M: [`Yahoo Finance chart ${market === 'KR' ? (normalizedExchange === 'KOSDAQ' ? '^KQ150' : '^KS200') : (normalizedExchange === 'NASDAQ' ? 'QQQ' : 'SPY')}`],
        C: fundamentalResult.pillarSources.C,
        A: fundamentalResult.pillarSources.A,
        N: ['Yahoo Finance chart price history', 'Base pattern engine'],
        S: [...new Set(['Yahoo Finance chart volume history', ...(fundamentalResult.pillarSources.S ?? [])])],
        L: [
          dbMetric?.rs_rating !== undefined && dbMetric?.rs_rating !== null ? 'Supabase stock_metrics.rs_rating' : 'SEPA benchmark-relative RS',
        ],
        I: fundamentalResult.pillarSources.I,
      },
      analysisCoverage: fundamentalResult.analysisCoverage,
      status: 'done',
      analyzedAt: new Date().toISOString(),
      errorMessage: null,
      dataWarnings,
    };

    return NextResponse.json({
      result,
      macro,
      vcpAnalysis: {
        score: vcpAnalysis.score,
        grade: vcpAnalysis.grade,
        pivotPrice: vcpAnalysis.pivotPrice,
        recommendedEntry: vcpAnalysis.recommendedEntry,
      },
    });
  } catch (error) {
    console.error(`[CAN SLIM Engine Error] ${error instanceof Error ? error.stack : error}`);
    const message = error instanceof Error ? error.message : 'CAN SLIM 분석 중 오류가 발생했습니다.';
    return NextResponse.json(
      { message, code: 'SCAN_FAILED', recoverable: true },
      { status: 500 }
    );
  }
}
