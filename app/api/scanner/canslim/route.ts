/**
 * CAN SLIM 스캐너 API 엔드포인트
 *
 * GET /api/scanner/canslim?ticker=AAPL&exchange=NASDAQ
 *
 * 개별 종목에 대해 CAN SLIM 7 Pillar 평가를 실행하고,
 * 기존 VCP 엔진 결과와 교차 비교하여 이중 검증 티어를 반환합니다.
 */

import { NextResponse } from 'next/server';
import { getYahooDailyPrice } from '@/lib/finance/providers/yahoo-api';
import { fetchCanslimFundamentals } from '@/lib/finance/engines/canslim-data-fetcher';
import { evaluateCanslim, determineDualScreenerTier } from '@/lib/finance/engines/canslim-engine';
import { detectBasePattern } from '@/lib/finance/engines/base-pattern-engine';
import { analyzeVcp } from '@/lib/finance/engines/vcp-engine';
import { analyzeSepa, calculateMovingAverage } from '@/lib/finance/core/calculations';
import { MACRO_CRITERIA } from '@/lib/finance/engines/canslim-criteria';
import type {
  CanslimMacroMarketData,
  CanslimScannerResult,
  CanslimStockData,
  MarketCode,
  OHLCData,
} from '@/types';

export const dynamic = 'force-dynamic';

const round = (v: number, d = 2) => Number(v.toFixed(d));

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
      // IBD 원칙: 거래량이 50일 평균보다 높아야 기관 매도(분배)로 판정
      const volumeAboveAverage = curr.volume > avgVolume50;
      
      if (priceDroppedSignificantly && volumeAboveAverage) {
        distributionDayCount++;
      }
    }

    // FTD 감지 (간이 버전)
    let followThroughDay = false;
    let lastFTDDate: string | null = null;
    const lookback = mainData.slice(-30);
    if (lookback.length >= 10) {
      for (let i = 5; i < lookback.length; i++) {
        const prev = lookback[i - 1];
        const curr = lookback[i];
        const gainPct = ((curr.close - prev.close) / prev.close) * 100;
        if (gainPct >= MACRO_CRITERIA.FTD_MIN_GAIN_PCT && curr.volume > prev.volume) {
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
    
    // 오닐의 원칙: 분배일이 과다하거나 이평선을 하회할 때 단계적 축소
    if (!aboveMa200 || distributionDayCount >= MACRO_CRITERIA.DISTRIBUTION_DAY_HALT_THRESHOLD) {
      actionLevel = 'HALT';
    } else if (!aboveMa50 || distributionDayCount >= MACRO_CRITERIA.DISTRIBUTION_DAY_REDUCED_THRESHOLD) {
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

    const [priceData, fundamentalResult, macro] = await Promise.all([
      getYahooDailyPrice(yahooTicker),
      fetchCanslimFundamentals(yahooTicker, market),
      loadMacroData(market, normalizedExchange),
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
        debtToEquityPct: null, // 현재 CanslimStockData에 부채 비율 필드 미포함
        source: 'Yahoo Finance',
      },
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
    const stockData = buildStockData(
      ticker,
      market,
      priceData,
      fundamentalResult.data,
      sepaEvidence.metrics.rsRating,
      sepaEvidence.metrics.mansfieldRsFlag ?? null,
      basePattern?.pivotPoint ?? vcpAnalysis.pivotPrice ?? null,
      basePattern?.type ?? null,
      basePattern?.weeksForming ?? null
    );

    // 5. CAN SLIM 7 Pillar 평가
    const canslimResult = evaluateCanslim(stockData, macro, false, stockData.currentPrice);

    // 6. 이중 검증 티어
    const dualTier = determineDualScreenerTier(canslimResult.pass, vcpAnalysis.grade);

    // 7. 데이터 경고 합산
    const dataWarnings = [...fundamentalResult.warnings];
    if (!macro.followThroughDay && macro.distributionDayCount >= 4) {
      dataWarnings.push('MACRO_PRESSURE');
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
      rsRating: sepaEvidence.metrics.rsRating,
      mansfieldRsFlag: sepaEvidence.metrics.mansfieldRsFlag ?? null,
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
