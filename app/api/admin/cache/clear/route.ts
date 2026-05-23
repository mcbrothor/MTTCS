import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * 펀더멘털 캐시 전체 삭제 (Admin용)
 * DART 동기화 후 최신 데이터를 즉시 반영할 때 사용합니다.
 */
export async function POST() {
  try {
    const { error, count } = await supabaseAdmin
      .from('fundamental_cache')
      .delete({ count: 'exact' })
      .neq('ticker', '');   // 전체 삭제

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: count ?? 0,
      message: `펀더멘털 캐시 ${count ?? 0}건이 삭제되었습니다. 다음 스캔 시 최신 데이터로 갱신됩니다.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
