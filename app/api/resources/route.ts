import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '알 수 없는 오류';
}

function apiError(message: string, code: string, status = 400) {
  return NextResponse.json({ message, code, recoverable: status < 500 }, { status });
}

// GET: 투자 링크 목록 조회
export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from('investment_resources')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Fetch Resources Error:', error);
    return apiError(getErrorMessage(error), 'FETCH_RESOURCES_FAILED', 500);
  }
}

// POST: 투자 링크 추가
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const title = String(body.title || '').trim();
    const url = String(body.url || '').trim();
    if (!title || !url) {
      return apiError('제목과 URL을 모두 입력해 주세요.', 'MISSING_FIELDS');
    }

    const category = String(body.category || 'ETC').trim();
    const display_order = typeof body.display_order === 'number' ? body.display_order : 0;

    const { data: userData, error: authError } = await supabaseServer.auth.getUser();
    if (authError || !userData.user) {
      return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
    }

    const { data, error } = await supabaseServer
      .from('investment_resources')
      .insert([
        {
          user_id: userData.user.id,
          title,
          url,
          category,
          display_order,
          updated_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Save Resource Error:', error);
    return apiError(getErrorMessage(error), 'SAVE_RESOURCE_FAILED', 500);
  }
}

// PATCH: 투자 링크 수정
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = String(body.id || '').trim();

    if (!id) {
      return apiError('수정할 링크 ID가 필요합니다.', 'MISSING_ID');
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) update.title = String(body.title).trim();
    if (body.url !== undefined) update.url = String(body.url).trim();
    if (body.category !== undefined) update.category = String(body.category).trim();
    if (body.display_order !== undefined) update.display_order = Number(body.display_order);

    const { data, error } = await supabaseServer
      .from('investment_resources')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: unknown) {
    console.error('Update Resource Error:', error);
    return apiError(getErrorMessage(error), 'UPDATE_RESOURCE_FAILED', 500);
  }
}

// DELETE: 투자 링크 삭제
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();

  if (!id) {
    return apiError('삭제할 링크 ID가 필요합니다.', 'MISSING_ID');
  }

  try {
    const { error } = await supabaseServer.from('investment_resources').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ data: { id } });
  } catch (error: unknown) {
    console.error('Delete Resource Error:', error);
    return apiError(getErrorMessage(error), 'DELETE_RESOURCE_FAILED', 500);
  }
}
