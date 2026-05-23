import { NextResponse } from 'next/server';
import { getYahooDailyPrice, getYahooQuotes, type YahooQuote } from '@/lib/finance/providers/yahoo-api';
import { computeMacroScore } from '@/lib/macro/compute';
import { getHyOas, get5yBreakeven } from '@/lib/data/fred';
import type { OHLCData } from '@/types';

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

export async function GET() {
  try {
    const [quotes, hyOasData, breakeven5yData, ...histories] = await Promise.all([
      getYahooQuotes(MACRO_SYMBOLS),
      getHyOas().catch(() => []),
      get5yBreakeven().catch(() => []),
      ...HISTORY_SYMBOLS.map((sym) => safeHistory(sym)),
    ]);

    const macroData = quotes.reduce((acc, quote) => {
      acc[quote.symbol] = {
        ...quote,
        source: 'Yahoo'
      };
      return acc;
    }, {} as Record<string, YahooQuote & { source?: string }>);

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
    };

    const macroResult = computeMacroScore(macroData, historiesMap, fredData);

    const asOfTime = new Date().toISOString();

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
    });
  } catch (error: unknown) {
    console.error('Fetch Macro Data Error:', error);
    return NextResponse.json({
      message: '매크로 데이터를 불러오는 중 오류가 발생했습니다.',
      code: 'FETCH_MACRO_FAILED',
    }, { status: 500 });
  }
}
