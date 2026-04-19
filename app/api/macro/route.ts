import { NextResponse } from 'next/server';
import { getYahooQuotes, type YahooQuote } from '@/lib/finance/providers/yahoo-api';

const MACRO_SYMBOLS = [
  'UVXY', '^VIX', 'UUP', 'KRE', // 위험 & 유동성 (UVXY or ^VIX 로 가져옴)
  'SHY', 'TLT', 'HYG', 'IEF',   // 채권
  'QQQ', 'SPY', 'DIA', 'IWM', 'RSP', // 주식
  'GLD', 'CPER', 'USO', 'UNG', 'BTC-USD' // 실물 자산 및 코인
];

export async function GET() {
  try {
    const quotes = await getYahooQuotes(MACRO_SYMBOLS);
    
    // Convert array to Record<symbol, quote> for easier access on frontend
    const macroData = quotes.reduce((acc, quote) => {
      acc[quote.symbol] = quote;
      return acc;
    }, {} as Record<string, YahooQuote>);

    return NextResponse.json({ data: macroData });
  } catch (error: unknown) {
    console.error('Fetch Macro Data Error:', error);
    return NextResponse.json({ 
      message: '매크로 데이터를 불러오는 중 오류가 발생했습니다.', 
      code: 'FETCH_MACRO_FAILED' 
    }, { status: 500 });
  }
}
