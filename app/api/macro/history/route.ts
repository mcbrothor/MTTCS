import { NextResponse } from 'next/server';
import { supabaseAnon } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(7, Number(searchParams.get('days') || 30)));

  const { data, error } = await supabaseAnon
    .from('macro_snapshot')
    .select('calc_date, macro_score, regime')
    .order('calc_date', { ascending: true })
    .limit(days);

  if (error) {
    return NextResponse.json({ message: error.message, code: 'DB_ERROR' }, { status: 500 });
  }

  const result = (data ?? []).map((row) => ({
    date: row.calc_date,
    macroScore: row.macro_score,
    regime: row.regime as 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL',
  }));

  return NextResponse.json({ data: result });
}
