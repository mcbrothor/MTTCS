import { NextResponse } from 'next/server';
import { supabaseAnon } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = (searchParams.get('market')?.toUpperCase() || 'US') as 'US' | 'KR';
  const days = Math.min(90, Math.max(7, Number(searchParams.get('days') || 30)));

  const { data, error } = await supabaseAnon
    .from('master_filter_snapshot')
    .select('calc_date, p3_score, state')
    .eq('market', market)
    .order('calc_date', { ascending: true })
    .limit(days);

  if (error) {
    return NextResponse.json({ message: error.message, code: 'DB_ERROR' }, { status: 500 });
  }

  const result = (data ?? []).map((row) => ({
    date: row.calc_date,
    p3Score: row.p3_score,
    state: row.state as 'GREEN' | 'YELLOW' | 'RED',
  }));

  return NextResponse.json({ data: result });
}
