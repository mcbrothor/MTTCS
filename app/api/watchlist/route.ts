import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getServerSession } from '@/lib/auth/session';
import type { InvestmentIdeaStatus, WatchlistPriority } from '@/types';

const IDEA_STATUSES = new Set<InvestmentIdeaStatus>(['DRAFT', 'WATCHING', 'READY', 'INVALIDATED', 'ARCHIVED']);

function ideaStatus(value: unknown): InvestmentIdeaStatus {
  const normalized = String(value || '').toUpperCase() as InvestmentIdeaStatus;
  return IDEA_STATUSES.has(normalized) ? normalized : 'DRAFT';
}

function sourceRefs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === 'string' && /^https?:\/\//i.test(item)) return [{ url: item.slice(0, 2000) }];
    if (!item || typeof item !== 'object') return [];
    const row = item as { url?: unknown; label?: unknown };
    const url = String(row.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return [];
    const label = String(row.label || '').trim();
    return [{ url: url.slice(0, 2000), ...(label ? { label: label.slice(0, 120) } : {}) }];
  }).slice(0, 20);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  // Supabase PostgrestError는 Error 인스턴스가 아니지만 message 필드를 가짐
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '알 수 없는 오류';
}

function apiError(message: string, code: string, status = 400) {
  return NextResponse.json({ message, code, recoverable: status < 500 }, { status });
}

// GET: 관심 종목 목록 조회
export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const session = await getServerSession();
    if (!session) return apiError('로그인이 필요합니다.', 'AUTH_REQUIRED', 401);
    const db = getSupabaseAdmin();
    let { data, error } = await db
      .from('watchlist')
      .select('*')
      .eq('user_id', session.systemId)
      .order('group_name')
      .order('sort_order')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error?.message?.includes('group_name')) {
      const legacy = await db.from('watchlist').select('id,user_id,ticker,exchange,memo,tags,priority,created_at,updated_at').eq('user_id', session.systemId).order('priority', { ascending: false }).order('created_at', { ascending: false });
      data = legacy.data?.map((item) => ({
        ...item, group_name: '기본', sort_order: 0, thesis: null, catalysts: [], invalidation: null,
        review_at: null, idea_status: 'DRAFT', source_refs: [],
      })) || null;
      error = legacy.error;
    }

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Fetch Watchlist Error:', error);
    return apiError(getErrorMessage(error), 'FETCH_WATCHLIST_FAILED', 500);
  }
}

// POST: 관심 종목 추가
export async function POST(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const body = await request.json();

    const ticker = String(body.ticker || '').trim().toUpperCase();
    if (!ticker) {
      return apiError('티커를 입력해 주세요.', 'MISSING_TICKER');
    }

    const exchange = String(body.exchange || 'NAS').trim().toUpperCase();
    const memo = body.memo ? String(body.memo).slice(0, 500) : null;
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((t: unknown) => typeof t === 'string').slice(0, 10)
      : [];
    const priority: WatchlistPriority = [0, 1, 2].includes(Number(body.priority))
      ? (Number(body.priority) as WatchlistPriority)
      : 0;

    const session = await getServerSession();
    if (!session) return apiError('로그인이 필요합니다.', 'AUTH_REQUIRED', 401);
    const systemId = session.systemId;

    const now = new Date().toISOString();
    const group_name = String(body.group_name || '기본').trim().slice(0, 40) || '기본';
    const payload = {
      ticker,
      exchange,
      memo,
      tags,
      priority,
      group_name,
      thesis: body.thesis ? String(body.thesis).slice(0, 5000) : null,
      catalysts: Array.isArray(body.catalysts) ? body.catalysts.filter((value: unknown) => typeof value === 'string').map((value: string) => value.slice(0, 500)).slice(0, 20) : [],
      invalidation: body.invalidation ? String(body.invalidation).slice(0, 3000) : null,
      review_at: body.review_at ? String(body.review_at) : null,
      idea_status: ideaStatus(body.idea_status),
      source_refs: sourceRefs(body.source_refs),
      user_id: systemId,
      updated_at: now,
    };

    const db = getSupabaseAdmin();
    const { data: existingRows, error: lookupError } = await db
      .from('watchlist')
      .select('id')
      .eq('ticker', ticker)
      .eq('user_id', systemId)
      .limit(1);

    if (lookupError) throw lookupError;

    const existingId = existingRows?.[0]?.id;
    const query = existingId
      ? db.from('watchlist').update(payload).eq('id', existingId).eq('user_id', systemId)
      : db.from('watchlist').insert([{ ...payload, created_at: now }]);

    const { data, error } = await query.select().single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Save Watchlist Error:', error);
    return apiError(getErrorMessage(error), 'SAVE_WATCHLIST_FAILED', 500);
  }
}

// PATCH: 관심 종목 수정 (메모, 태그, 우선순위)
export async function PATCH(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const session = await getServerSession();
    if (!session) return apiError('로그인이 필요합니다.', 'AUTH_REQUIRED', 401);
    const body = await request.json();
    const id = String(body.id || '').trim();

    if (!id) {
      return apiError('수정할 관심 종목 ID가 필요합니다.', 'MISSING_ID');
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.memo !== undefined) {
      update.memo = body.memo === null ? null : String(body.memo).slice(0, 500);
    }
    if (body.tags !== undefined && Array.isArray(body.tags)) {
      update.tags = body.tags.filter((t: unknown) => typeof t === 'string').slice(0, 10);
    }
    if (body.priority !== undefined && [0, 1, 2].includes(Number(body.priority))) {
      update.priority = Number(body.priority);
    }
    if (body.exchange !== undefined) {
      update.exchange = String(body.exchange).trim().toUpperCase();
    }
    if (body.group_name !== undefined) update.group_name = String(body.group_name || '기본').trim().slice(0, 40) || '기본';
    if (body.sort_order !== undefined && Number.isInteger(Number(body.sort_order))) update.sort_order = Number(body.sort_order);
    if (body.thesis !== undefined) update.thesis = body.thesis === null ? null : String(body.thesis).slice(0, 5000);
    if (body.catalysts !== undefined && Array.isArray(body.catalysts)) update.catalysts = body.catalysts.filter((value: unknown) => typeof value === 'string').map((value: string) => value.slice(0, 500)).slice(0, 20);
    if (body.invalidation !== undefined) update.invalidation = body.invalidation === null ? null : String(body.invalidation).slice(0, 3000);
    if (body.review_at !== undefined) update.review_at = body.review_at ? String(body.review_at) : null;
    if (body.idea_status !== undefined) update.idea_status = ideaStatus(body.idea_status);
    if (body.source_refs !== undefined) update.source_refs = sourceRefs(body.source_refs);

    const { data, error } = await getSupabaseAdmin()
      .from('watchlist')
      .update(update)
      .eq('id', id)
      .eq('user_id', session.systemId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Update Watchlist Error:', error);
    return apiError(getErrorMessage(error), 'UPDATE_WATCHLIST_FAILED', 500);
  }
}

// DELETE: 관심 종목 삭제
export async function DELETE(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();

  if (!id) {
    return apiError('삭제할 관심 종목 ID가 필요합니다.', 'MISSING_ID');
  }

  try {
    const session = await getServerSession();
    if (!session) return apiError('로그인이 필요합니다.', 'AUTH_REQUIRED', 401);
    const { error } = await getSupabaseAdmin().from('watchlist').delete().eq('id', id).eq('user_id', session.systemId);
    if (error) throw error;

    return NextResponse.json({ data: { id } });
  } catch (error: unknown) {
    console.error('Delete Watchlist Error:', error);
    return apiError(getErrorMessage(error), 'DELETE_WATCHLIST_FAILED', 500);
  }
}
