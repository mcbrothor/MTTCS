import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { supabaseServer } from '@/lib/supabase/server';

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from('data_pipeline_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const latest = new Map<string, Record<string, unknown>>();
    for (const row of data || []) {
      const key = `${row.pipeline}:${row.market || 'ALL'}`;
      if (!latest.has(key)) latest.set(key, row);
    }
    return apiSuccess(Array.from(latest.values()), {
      source: 'data_pipeline_runs', provider: 'Supabase', delay: 'REALTIME', observedAt: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Data health 조회 실패'), 'API_ERROR', 500);
  }
}
