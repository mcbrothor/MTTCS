import { NextResponse } from 'next/server';
import { cacheGet, cacheKey, cacheSet } from '@/lib/cache';
import { getYahooSecurityProfile } from '@/lib/finance/providers/yahoo-api';

interface SecurityLookupResponse {
  ticker: string;
  exchange: string;
  symbol: string;
  name: string | null;
  exchangeName: string | null;
  currency: string | null;
  source: string;
}

function apiError(message: string, code: string, status = 400) {
  return NextResponse.json({ message, code, recoverable: status < 500 }, { status });
}

function getYahooFormattedTicker(ticker: string, exchange: string) {
  if (exchange === 'KOSPI') return `${ticker}.KS`;
  if (exchange === 'KOSDAQ') return `${ticker}.KQ`;
  return ticker;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('ticker')?.trim().toUpperCase();
  const exchange = searchParams.get('exchange')?.trim().toUpperCase() || 'NAS';

  if (!ticker) {
    return apiError('티커를 입력해 주세요.', 'MISSING_TICKER', 400);
  }

  const cacheId = cacheKey('security-lookup', ticker, exchange);
  const cached = cacheGet<SecurityLookupResponse>(cacheId);
  if (cached) {
    return NextResponse.json(cached);
  }

  const yahooTicker = getYahooFormattedTicker(ticker, exchange);
  const profile = await getYahooSecurityProfile(yahooTicker);

  if (!profile?.name) {
    return apiError('종목명을 찾을 수 없습니다.', 'SECURITY_NOT_FOUND', 404);
  }

  const response: SecurityLookupResponse = {
    ticker,
    exchange,
    symbol: profile.symbol,
    name: profile.name,
    exchangeName: profile.exchangeName,
    currency: profile.currency,
    source: profile.source,
  };

  cacheSet(cacheId, response);

  return NextResponse.json(response);
}
