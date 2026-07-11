import { NextResponse } from 'next/server';
import { validateCronRequest } from '@/lib/contest-cron';
import { getMarketDataForCron } from '@/app/api/market-data/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ success: false, message: 'Unauthorized cron request.' }, { status: 401 });
  }
  const source = new URL(request.url);
  const ticker = source.searchParams.get('ticker');
  const exchange = source.searchParams.get('exchange');
  const includeFundamentals = source.searchParams.get('includeFundamentals') === 'true';
  if (!ticker || !exchange) {
    return NextResponse.json({ success: false, message: 'ticker and exchange are required.' }, { status: 400 });
  }
  const target = new URL('/api/market-data', source.origin);
  target.searchParams.set('ticker', ticker);
  target.searchParams.set('exchange', exchange);
  target.searchParams.set('includeFundamentals', String(includeFundamentals));
  target.searchParams.set('skipStandardMetrics', 'false');
  return getMarketDataForCron(new Request(target));
}
