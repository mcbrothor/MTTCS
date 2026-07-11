import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';

async function context() {
  const session = await getServerSession();
  return session ? { session, db: getSupabaseAdmin() } : null;
}

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const ctx = await context();
    if (!ctx) return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
    const { data, error } = await ctx.db.from('saved_screens').select('*').eq('user_id', ctx.session.systemId).order('updated_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : '조회 실패' }, { status: 500 }); }
}

export async function POST(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const ctx = await context();
    if (!ctx) return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
    const body = await request.json();
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return NextResponse.json({ message: '저장할 화면 이름이 필요합니다.' }, { status: 400 });
    const payload = { user_id: ctx.session.systemId, name, market: String(body.universe).startsWith('K') ? 'KR' : 'US', universe: body.universe,
      filters: body.filters || {}, sort_key: body.sortKey || 'recommendation', sort_direction: 'desc' };
    const { data, error } = await ctx.db.from('saved_screens').upsert(payload, { onConflict: 'user_id,name' }).select().single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : '저장 실패' }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  const ctx = await context();
  if (!ctx) return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  const { error } = await ctx.db.from('saved_screens').delete().eq('id', id || '').eq('user_id', ctx.session.systemId);
  return error ? NextResponse.json({ message: error.message }, { status: 500 }) : NextResponse.json({ data: { id } });
}
