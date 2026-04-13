import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import type { WatchlistPriority } from '@/types';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류';
}

function apiError(message: string, code: string, status = 400) {
  return NextResponse.json({ message, code, recoverable: status < 500 }, { status });
}

// GET: 관심 종목 목록 조회
export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from('watchlist')
      .select('*')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Fetch Watchlist Error:', error);
    return apiError(getErrorMessage(error), 'FETCH_WATCHLIST_FAILED', 500);
  }
}

// POST: 관심 종목 추가
export async function POST(request: Request) {
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

    const { data, error } = await supabaseServer
      .from('watchlist')
      .upsert(
        [{ ticker, exchange, memo, tags, priority, updated_at: new Date().toISOString() }],
        { onConflict: 'ticker' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Save Watchlist Error:', error);
    return apiError(getErrorMessage(error), 'SAVE_WATCHLIST_FAILED', 500);
  }
}

// PATCH: 관심 종목 수정 (메모, 태그, 우선순위)
export async function PATCH(request: Request) {
  try {
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

    const { data, error } = await supabaseServer
      .from('watchlist')
      .update(update)
      .eq('id', id)
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
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();

  if (!id) {
    return apiError('삭제할 관심 종목 ID가 필요합니다.', 'MISSING_ID');
  }

  try {
    const { error } = await supabaseServer.from('watchlist').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ data: { id } });
  } catch (error: unknown) {
    console.error('Delete Watchlist Error:', error);
    return apiError(getErrorMessage(error), 'DELETE_WATCHLIST_FAILED', 500);
  }
}
