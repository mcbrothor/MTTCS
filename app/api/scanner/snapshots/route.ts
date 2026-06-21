import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getServerSession } from '@/lib/auth/session';
import { DAILY_SCREENER_SOURCES, DAILY_SCREENER_UNIVERSES, type DailyScreenerSource } from '@/lib/daily-screeners';
import { toDailyScannerSnapshot } from '@/lib/scanner/daily-snapshot';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { ScannerUniverse } from '@/types';

const MAX_RUN_LOOKBACK = 5;
const MAX_CANDIDATES = 500;

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session) return apiError('로그인이 필요합니다.', 'AUTH_REQUIRED', 401);

  const url = new URL(request.url);
  const source = url.searchParams.get('source') as DailyScreenerSource | null;
  const universe = url.searchParams.get('universe') as ScannerUniverse | null;

  if (!source || !DAILY_SCREENER_SOURCES.includes(source)) {
    return apiError('지원하지 않는 스캐너입니다.', 'INVALID_INPUT', 400, { allowed: DAILY_SCREENER_SOURCES });
  }
  if (!universe || !DAILY_SCREENER_UNIVERSES.includes(universe)) {
    return apiError('지원하지 않는 유니버스입니다.', 'INVALID_INPUT', 400, { allowed: DAILY_SCREENER_UNIVERSES });
  }

  try {
    const db = getSupabaseAdmin();
    const { data: runs, error: runError } = await db
      .from('daily_screener_runs')
      .select('id,run_date,status,completed_at,updated_at,error_summary')
      .in('status', ['completed', 'failed'])
      .order('run_date', { ascending: false })
      .limit(MAX_RUN_LOOKBACK);
    if (runError) throw runError;

    for (const run of runs ?? []) {
      const { data: candidates, error: candidateError } = await db
        .from('daily_screener_candidates')
        .select('source,universe,ticker,exchange,name,score,grade,source_rank,price,price_as_of,reason,raw_metrics,raw')
        .eq('run_id', run.id)
        .eq('source', source)
        .eq('universe', universe)
        .order('source_rank', { ascending: true, nullsFirst: false })
        .order('score', { ascending: false })
        .limit(MAX_CANDIDATES);
      if (candidateError) throw candidateError;
      if (!candidates?.length) continue;

      const snapshot = toDailyScannerSnapshot(run, candidates);
      return apiSuccess(snapshot, {
        observedAt: run.completed_at || run.updated_at,
        source: 'daily_screener_candidates',
        provider: 'Supabase',
        delay: 'EOD',
        fallbackUsed: run.status === 'failed',
        warnings: run.status === 'failed' && run.error_summary ? [run.error_summary] : [],
        modelVersion: 'daily-screener-v1',
      });
    }

    return apiSuccess(toDailyScannerSnapshot(null, []), {
      source: 'daily_screener_candidates',
      provider: 'Supabase',
      delay: 'EOD',
      warnings: ['사용 가능한 일일 스캐너 스냅샷이 없습니다.'],
    });
  } catch (error) {
    return apiError(getErrorMessage(error, '스캐너 스냅샷을 불러오지 못했습니다.'), 'API_ERROR', 500);
  }
}
