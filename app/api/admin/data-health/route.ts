import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { buildPipelineHealthRows, type PipelineRunRow } from '@/lib/data/pipeline-status';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const { data, error } = await supabaseServer
      .from('data_pipeline_runs')
      .select('id, pipeline, provider, market, status, observed_at, fetched_at, completed_at, created_at, fallback_used, fallback_reason, error_message, metadata')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const healthRows = buildPipelineHealthRows((data || []) as PipelineRunRow[]);
    const observedAt = healthRows
      .map((row) => row.freshness_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    const staleRows = healthRows.filter((row) => row.status === 'FAILED');
    return apiSuccess(healthRows, {
      source: 'data_pipeline_runs',
      provider: 'Supabase',
      delay: 'UNKNOWN',
      observedAt,
      expectedDelaySeconds: healthRows.length
        ? Math.max(...healthRows.map((row) => row.expected_max_age_seconds))
        : 0,
      isStale: staleRows.length > 0,
      staleReason: staleRows.length
        ? `${staleRows.length}개 파이프라인이 실패·지연·관측시각 미측정 상태입니다.`
        : null,
      warnings: staleRows.map((row) => `${row.pipeline}:${row.market || 'ALL'} ${row.stale_reason || row.status}`),
    });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Data health 조회 실패'), 'API_ERROR', 500);
  }
}
