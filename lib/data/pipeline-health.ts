import { supabaseServer } from '../supabase/server.ts';

export async function recordPipelineRun(input: {
  pipeline: string;
  provider: string;
  market?: string | null;
  status: 'SUCCESS' | 'DEGRADED' | 'FAILED';
  observedAt?: string | null;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
  throwOnError?: boolean;
}) {
  const { error } = await supabaseServer.from('data_pipeline_runs').insert({
    pipeline: input.pipeline,
    provider: input.provider,
    market: input.market || null,
    status: input.status,
    observed_at: input.observedAt || null,
    completed_at: new Date().toISOString(),
    fallback_used: Boolean(input.fallbackUsed),
    fallback_reason: input.fallbackReason || null,
    error_message: input.errorMessage || null,
    metadata: input.metadata || {},
  });
  if (error) {
    if (input.throwOnError) throw error;
    if (!String(error.message).includes('data_pipeline_runs')) {
      console.warn('[pipeline-health] 기록 실패:', error.message);
    }
  }
}
