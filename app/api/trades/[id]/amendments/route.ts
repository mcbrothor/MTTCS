import { NextResponse } from 'next/server';
import { getRequestSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';

const ALLOWED_FIELDS = new Set([
  'entry_price', 'stoploss_price', 'total_shares', 'entry_targets',
  'trailing_stops', 'plan_note', 'invalidation_note',
]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ message: 'Authentication required.', code: 'AUTH_REQUIRED' }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json();
  const reason = String(body.reason || '').trim();
  const expectedVersion = Number(body.expected_version);
  const patch = Object.fromEntries(Object.entries(body.patch || {}).filter(([key]) => ALLOWED_FIELDS.has(key)));
  if (reason.length < 3 || !Number.isInteger(expectedVersion) || Object.keys(patch).length === 0) {
    return NextResponse.json({ message: 'reason, expected_version and a non-empty allowed patch are required.', code: 'INVALID_AMENDMENT' }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data: trade, error: readError } = await db.from('trades').select('*')
    .eq('id', id).eq('user_id', session.systemId).single();
  if (readError) return NextResponse.json({ message: 'Trade not found.', code: 'TRADE_NOT_FOUND' }, { status: 404 });
  const afterSnapshot = { ...(trade.current_plan_snapshot || trade.entry_snapshot || {}), ...patch };
  const { data, error } = await db.rpc('amend_trade_plan_v2', {
    p_trade_id: id, p_owner_id: session.systemId, p_expected_version: expectedVersion,
    p_reason: reason, p_patch: patch, p_after_snapshot: afterSnapshot,
  });
  if (error) {
    const conflict = error.message.includes('VERSION_CONFLICT');
    return NextResponse.json({ message: conflict ? 'Trade was modified by another request.' : 'Amendment failed.', code: conflict ? 'VERSION_CONFLICT' : 'AMENDMENT_FAILED' }, { status: conflict ? 409 : 500 });
  }
  return NextResponse.json({ data });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ message: 'Authentication required.', code: 'AUTH_REQUIRED' }, { status: 401 });
  const { id } = await context.params;
  const db = getSupabaseAdmin();
  const { data: trade } = await db.from('trades').select('id').eq('id', id).eq('user_id', session.systemId).maybeSingle();
  if (!trade) return NextResponse.json({ message: 'Trade not found.', code: 'TRADE_NOT_FOUND' }, { status: 404 });
  const { data, error } = await db.from('trade_plan_revisions').select('*').eq('trade_id', id).order('revision_no', { ascending: false });
  if (error) return NextResponse.json({ message: 'Revision history failed.', code: 'REVISION_HISTORY_FAILED' }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}
