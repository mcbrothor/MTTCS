import { NextResponse } from 'next/server';
import { getYahooDailyPrice, getYahooQuotes, type YahooQuote } from '@/lib/finance/providers/yahoo-api';
import { computeMacroScore } from '@/lib/macro/compute';
import { getHyOas, get5yBreakeven, getDgs10, getDgs2 } from '@/lib/data/fred';
import type { OHLCData } from '@/types';
import { recordPipelineRun } from '@/lib/data/pipeline-health';

const MACRO_SYMBOLS = [
  'UVXY', '^VIX', 'UUP', 'KRE',
  'SHY', 'TLT', 'HYG', 'IEF',
  'QQQ', 'SPY', '^KS200', 'DIA', 'IWM', 'RSP',
  'GLD', 'CPER', 'USO', 'UNG', 'BTC-USD',
  '^GSPC', '^IXIC', '^KS11', '^KQ11', 'KRW=X',
  '^TNX', '^IRX', 'IEI',
];

// 롤링 계산에 필요한 히스토리 심볼 (최소 25일 필요)
const HISTORY_SYMBOLS = ['HYG', 'IEF', 'CPER', 'GLD', 'IWM', 'RSP', 'SPY'];

async function safeHistory(symbol: string): Promise<OHLCData[]> {
  return getYahooDailyPrice(symbol).catch(() => []);
}

const MACRO_MODEL_VERSION = 'macro-2026.06-v2';

function computeKoreaMacroScore(data: Record<string, YahooQuote & { source?: string }>) {
  const kospi = data['^KS11'];
  const kosdaq = data['^KQ11'];
  const krw = data['KRW=X'];
  const vix = data['^VIX'];
  const components = [
    { label: 'KOSPI 추세', weight: 35, score: kospi && kospi.regularMarketPrice >= kospi.fiftyDayAverage ? 35 : 0, description: 'KOSPI 50일선 기준', rawValue: kospi ? `${kospi.regularMarketPrice}` : '데이터 없음', threshold: '지수 > 50MA' },
    { label: 'KOSDAQ 추세', weight: 25, score: kosdaq && kosdaq.regularMarketPrice >= kosdaq.fiftyDayAverage ? 25 : 0, description: 'KOSDAQ 50일선 기준', rawValue: kosdaq ? `${kosdaq.regularMarketPrice}` : '데이터 없음', threshold: '지수 > 50MA' },
    { label: '원/달러 안정성', weight: 20, score: krw && krw.regularMarketPrice <= krw.fiftyDayAverage ? 20 : krw ? 7 : 0, description: '원화 약세 압력 확인', rawValue: krw ? `${krw.regularMarketPrice}` : '데이터 없음', threshold: 'USD/KRW ≤ 50MA' },
    { label: '글로벌 변동성', weight: 20, score: vix && vix.regularMarketPrice < 20 ? 20 : vix && vix.regularMarketPrice < 25 ? 10 : 0, description: '한국 증시에 영향을 주는 글로벌 위험', rawValue: vix ? `${vix.regularMarketPrice}` : '데이터 없음', threshold: 'VIX < 20' },
  ];
  const score = components.reduce((sum, item) => sum + item.score, 0);
  return {
    score,
    regime: score >= 70 ? 'RISK_ON' as const : score < 45 ? 'RISK_OFF' as const : 'NEUTRAL' as const,
    breakdown: components,
    complete: Boolean(kospi && kosdaq && krw && vix),
  };
}

export async function GET(request: Request) {
  try {
    const market = new URL(request.url).searchParams.get('market') === 'KR' ? 'KR' : 'US';
    const [quotes, hyOasData, breakeven5yData, dgs10Data, dgs2Data, ...histories] = await Promise.all([
      getYahooQuotes(MACRO_SYMBOLS),
      getHyOas().catch(() => []),
      get5yBreakeven().catch(() => []),
      getDgs10().catch(() => []),
      getDgs2().catch(() => []),
      ...HISTORY_SYMBOLS.map((sym) => safeHistory(sym)),
    ]);

    const macroData = quotes.reduce((acc, quote) => {
      acc[quote.symbol] = {
        ...quote,
        source: 'Yahoo'
      };
      return acc;
    }, {} as Record<string, YahooQuote & { source?: string }>);
    if (macroData['USDKRW=X'] && !macroData['KRW=X']) macroData['KRW=X'] = macroData['USDKRW=X'];
    if (macroData['KRW=X'] && !macroData['USDKRW=X']) macroData['USDKRW=X'] = macroData['KRW=X'];

    // KIS API에서 최우선으로 지수 정보를 가져와 덮어씌움 (Yahoo 데이터 오류 방지)
    const kisIndexQuotes = await import('@/lib/finance/providers/kis-api').then((m) => m.getKisIndexQuotes()).catch(() => ({}));
    for (const [symbol, kisQuote] of Object.entries(kisIndexQuotes)) {
      if (macroData[symbol]) {
        macroData[symbol].regularMarketPrice = kisQuote.regularMarketPrice;
        macroData[symbol].regularMarketChangePercent = kisQuote.regularMarketChangePercent;
        macroData[symbol].source = 'KIS';
      } else {
        macroData[symbol] = {
          symbol,
          regularMarketPrice: kisQuote.regularMarketPrice,
          regularMarketChangePercent: kisQuote.regularMarketChangePercent,
          fiftyDayAverage: kisQuote.regularMarketPrice,
          source: 'KIS',
        };
      }
    }

    const historiesMap: Record<string, OHLCData[]> = {};
    HISTORY_SYMBOLS.forEach((sym, i) => {
      historiesMap[sym] = histories[i];
    });

    const fredData = {
      hyOas: hyOasData,
      breakeven5y: breakeven5yData,
      dgs10: dgs10Data,
      dgs2: dgs2Data,
    };

    const usMacroResult = computeMacroScore(macroData, historiesMap, fredData);
    const krMacroResult = computeKoreaMacroScore(macroData);
    const macroResult = market === 'KR' ? {
      ...usMacroResult,
      macroScore: krMacroResult.score,
      regime: krMacroResult.regime,
      breakdown: krMacroResult.breakdown,
    } : usMacroResult;
    const observedDates = [hyOasData.at(-1)?.date, dgs10Data.at(-1)?.date, dgs2Data.at(-1)?.date].filter(Boolean) as string[];
    const observedAt = observedDates.length ? `${observedDates.sort()[0]}T23:59:59.000Z` : null;
    const decisionStatus = market === 'KR'
      ? krMacroResult.complete ? 'VALID' : 'BLOCKED'
      : !dgs10Data.length || !dgs2Data.length ? 'DEGRADED' : 'VALID';
    const asOfTime = observedAt || new Date().toISOString();
    await recordPipelineRun({
      pipeline: 'macro', provider: 'Yahoo+FRED+KIS', market, status: decisionStatus === 'VALID' ? 'SUCCESS' : 'DEGRADED',
      observedAt: asOfTime, fallbackUsed: decisionStatus !== 'VALID', fallbackReason: decisionStatus !== 'VALID' ? '필수 매크로 입력 일부 누락' : null,
      metadata: { modelVersion: MACRO_MODEL_VERSION, score: macroResult.macroScore, regime: macroResult.regime },
    }).catch(() => undefined);

    return NextResponse.json({
      data: macroData,
      score: macroResult.macroScore,
      regime: macroResult.regime,
      breakdown: macroResult.breakdown,
      spyAbove50ma: macroResult.spyAbove50ma,
      hygIefDiff: macroResult.hygIefDiff,
      vixLevel: macroResult.vixLevel,
      asOf: asOfTime, // 업데이트 시간 표시용
      updatedAt: asOfTime,
      market,
      decisionStatus,
      modelVersion: MACRO_MODEL_VERSION,
      globalOverlay: market === 'KR' ? {
        score: usMacroResult.macroScore,
        regime: usMacroResult.regime,
        decisionStatus: !dgs10Data.length || !dgs2Data.length ? 'DEGRADED' : 'VALID',
        modelVersion: MACRO_MODEL_VERSION,
      } : null,
    });
  } catch (error: unknown) {
    console.error('Fetch Macro Data Error:', error);
    return NextResponse.json({
      message: '매크로 데이터를 불러오는 중 오류가 발생했습니다.',
      code: 'FETCH_MACRO_FAILED',
    }, { status: 500 });
  }
}
