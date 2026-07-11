import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';

const TICKER_PATTERN = /^[A-Z0-9.^_-]{1,20}$/;

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;

  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get('ticker') || '').trim().toUpperCase();
  const market = (searchParams.get('market') || '').trim().toUpperCase();
  const days = Math.min(365, Math.max(1, Number(searchParams.get('days') || 30)));
  if (!TICKER_PATTERN.test(ticker) || !['US', 'KR'].includes(market) || !Number.isInteger(days)) {
    return NextResponse.json({ message: 'Invalid history query.', code: 'INVALID_QUERY' }, { status: 400 });
  }

  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await getSupabaseAdmin()
    .from('stock_metrics')
    .select('calc_date, rs_rating')
    .eq('ticker', ticker)
    .eq('market', market)
    .gte('calc_date', since)
    .order('calc_date', { ascending: true })
    .limit(366);

  if (error) {
    return NextResponse.json({ message: 'Metric history could not be loaded.', code: 'METRIC_HISTORY_FAILED' }, { status: 500 });
  }
  return NextResponse.json({ data: data || [] });
}
