import { NextResponse } from 'next/server';
import { validateCronRequest } from '@/lib/contest-cron';
import {
  DAILY_SCREENER_SOURCES,
  DAILY_SCREENER_UNIVERSES,
  kstDateString,
  parseDailyScreenerSourceList,
  parseDailyScreenerUniverseList,
} from '@/lib/daily-screeners';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PROVIDER_CHAIN = ['codex-cli', 'local-llm', 'gemini', 'groq', 'cerebras', 'rule-based'];
const DEFAULT_MAX_PER_UNIVERSE = Number(process.env.DAILY_SCREENER_MAX_PER_UNIVERSE || 40);

function boolParam(value: string | null) {
  return value === 'true' || value === '1' || value === 'yes';
}

function dateParam(value: string | null) {
  if (!value) return kstDateString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return null;
}

function limitParam(value: string | null) {
  if (value === 'ALL') return null;
  const raw = value || String(DEFAULT_MAX_PER_UNIVERSE);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 500) return undefined;
  return parsed;
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ success: false, message: 'Unauthorized cron request.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const runDate = dateParam(url.searchParams.get('date'));
  const sources = parseDailyScreenerSourceList(url.searchParams.get('sources'));
  const universes = parseDailyScreenerUniverseList(url.searchParams.get('universes'));
  const dryRun = boolParam(url.searchParams.get('dryRun'));
  const force = boolParam(url.searchParams.get('force'));
  const maxPerUniverse = limitParam(url.searchParams.get('maxPerUniverse') || url.searchParams.get('limit'));

  if (!runDate) {
    return NextResponse.json({ success: false, message: 'date must be YYYY-MM-DD.' }, { status: 400 });
  }
  if (maxPerUniverse === undefined) {
    return NextResponse.json({ success: false, message: 'maxPerUniverse must be a positive integer up to 500, or ALL.' }, { status: 400 });
  }
  if (!sources || !universes) {
    return NextResponse.json({
      success: false,
      message: 'Invalid sources or universes.',
      allowed_sources: DAILY_SCREENER_SOURCES,
      allowed_universes: DAILY_SCREENER_UNIVERSES,
    }, { status: 400 });
  }

  const scope = { sources, universes, force, max_per_universe: maxPerUniverse };

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dry_run: true,
      queued: false,
      run_date: runDate,
      status: 'dry_run',
      scope,
      llm_provider_chain: PROVIDER_CHAIN,
    });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await supabase
    .from('daily_screener_runs')
    .select('id, status, run_date')
    .eq('run_date', runDate)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ success: false, message: existingError.message }, { status: 500 });
  }

  if (existing && !force) {
    return NextResponse.json({
      success: true,
      queued: false,
      run_id: existing.id,
      run_date: existing.run_date,
      status: existing.status,
      message: 'Daily screener run already exists. Use force=true to requeue.',
    });
  }

  if (existing && force) {
    const { error: deleteError } = await supabase
      .from('daily_screener_candidates')
      .delete()
      .eq('run_id', existing.id);
    if (deleteError) return NextResponse.json({ success: false, message: deleteError.message }, { status: 500 });

    const { data, error } = await supabase
      .from('daily_screener_runs')
      .update({
        status: 'pending',
        scope,
        llm_provider_chain: PROVIDER_CHAIN.map((provider) => ({ provider, status: 'pending' })),
        scan_summary: {},
        top5_result: null,
        error_summary: null,
        telegram_sent_at: null,
        completed_at: null,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select('id, run_date, status')
      .single();
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, queued: true, forced: true, run: data });
  }

  const { data, error } = await supabase
    .from('daily_screener_runs')
    .insert({
      run_date: runDate,
      status: 'pending',
      scope,
      llm_provider_chain: PROVIDER_CHAIN.map((provider) => ({ provider, status: 'pending' })),
      updated_at: now,
    })
    .select('id, run_date, status')
    .single();

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  return NextResponse.json({ success: true, queued: true, forced: false, run: data });
}
