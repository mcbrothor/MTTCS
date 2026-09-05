import { apiError, apiSuccess } from '@/lib/api/response';
import { getRequestSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { ClosingRepository } from '@/lib/closing-bet/repository';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!await getRequestSession(request)) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  const query = new URL(request.url).searchParams;
  const date = query.get('date') || undefined;
  const mode = query.get('mode') || undefined;
  if ((date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) || (mode && mode !== 'LIVE' && mode !== 'REPLAY')) return apiError('잘못된 날짜 또는 모드입니다.', 'INVALID_REQUEST', 400);
  try {
    const client = getSupabaseAdmin();
    const repo = new ClosingRepository(client);
    const history = await client.from('closing_bet_snapshots').select('trade_date,mode').order('trade_date', { ascending: false }).limit(180);
    if (history.error) throw new Error('추천 이력 조회 실패');
    const dates = [...new Set((history.data || []).map((row) => row.trade_date as string))];
    const preferred = mode === 'LIVE' || mode === 'REPLAY' ? mode : (history.data?.some((row) => row.mode === 'LIVE') ? 'LIVE' : 'REPLAY');
    const targetDate = date ?? history.data?.find((row) => row.mode === preferred)?.trade_date;
    const snapshots = targetDate ? await repo.list(targetDate, preferred) : [];
    const evaluations = await repo.evaluations(snapshots.map((row) => row.id));
    return apiSuccess({ snapshots, evaluations, dates }, { source: 'KIS · MTN 종가베팅', provider: 'KIS', warnings: ['기존 KOSPI200·KOSDAQ150 풀 유지. REPLAY는 과거 검토용이며 실전 추천과 분리됩니다.'] });
  } catch {
    return apiError('종가베팅 저장 결과를 불러오지 못했습니다.', 'CLOSING_BET_UNAVAILABLE', 503);
  }
}
