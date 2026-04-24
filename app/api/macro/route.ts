import { NextResponse } from 'next/server';
import { getYahooQuotes, type YahooQuote } from '@/lib/finance/providers/yahoo-api';
import { computeMacroScore } from '@/lib/macro/compute';

const MACRO_SYMBOLS = [
  'UVXY', '^VIX', 'UUP', 'KRE',
  'SHY', 'TLT', 'HYG', 'IEF',
  'QQQ', 'SPY', '^KS200', 'DIA', 'IWM', 'RSP',
  'GLD', 'CPER', 'USO', 'UNG', 'BTC-USD',
  '^GSPC', '^IXIC', '^KS11', '^KQ11', 'KRW=X',
];

export async function GET() {
  try {
    const quotes = await getYahooQuotes(MACRO_SYMBOLS);

    const macroData = quotes.reduce((acc, quote) => {
      acc[quote.symbol] = quote;
      return acc;
    }, {} as Record<string, YahooQuote>);

    const macroResult = computeMacroScore(macroData);

    return NextResponse.json({
      data: macroData,
      score: macroResult.macroScore,
      regime: macroResult.regime,
      breakdown: macroResult.breakdown,
      spyAbove50ma: macroResult.spyAbove50ma,
      hygIefDiff: macroResult.hygIefDiff,
      vixLevel: macroResult.vixLevel,
      asOf: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Fetch Macro Data Error:', error);
    return NextResponse.json({
      message: '매크로 데이터를 불러오는 중 오류가 발생했습니다.',
      code: 'FETCH_MACRO_FAILED',
    }, { status: 500 });
  }
}
