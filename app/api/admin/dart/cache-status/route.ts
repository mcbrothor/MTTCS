import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

async function getCountAndLastUpdated(table: string, market?: string) {
  if (!supabaseAdmin) {
    throw new Error('Supabase Admin client is not configured');
  }

  let countQuery = supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true });

  let latestQuery = supabaseAdmin
    .from(table)
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (market) {
    countQuery = countQuery.eq('market', market);
    latestQuery = latestQuery.eq('market', market);
  }

  const [{ count, error: countError }, { data, error: latestError }] = await Promise.all([
    countQuery,
    latestQuery,
  ]);

  if (countError) throw new Error(countError.message);
  if (latestError) throw new Error(latestError.message);

  return {
    count: count ?? 0,
    lastUpdated: data?.[0]?.updated_at ?? null,
  };
}

export async function GET() {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase Admin client is not configured' }, { status: 500 });
  }

  try {
    const [dart, fundamentals] = await Promise.all([
      getCountAndLastUpdated('dart_corp_codes'),
      getCountAndLastUpdated('fundamental_cache', 'KR'),
    ]);

    return NextResponse.json({
      dartCount: dart.count,
      dartLastUpdated: dart.lastUpdated,
      fundamentalCount: fundamentals.count,
      fundamentalLastUpdated: fundamentals.lastUpdated,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
