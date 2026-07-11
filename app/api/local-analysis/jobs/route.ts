import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import crypto from 'node:crypto';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getServerSession } from '@/lib/auth/session';
import {
  LOCAL_ANALYSIS_JOB_TYPES,
  isLocalAnalysisJobType,
  normalizeLocalAnalysisAction,
  normalizeLocalAnalysisPayload,
} from '@/lib/local-analysis/contracts';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function idempotencyKey(jobType: string, payload: unknown) {
  const hash = crypto.createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 24);
  return `api-${jobType.toLowerCase()}-${hash}`;
}

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const session = await getServerSession();
    if (!session) return apiError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    const status = params.get('status');
    const jobType = String(params.get('job_type') || params.get('jobType') || '').trim().toUpperCase();
    const limit = Math.min(100, Math.max(1, Number(params.get('limit') || 20)));
    const db = getSupabaseAdmin();
    let query = db
      .from('analysis_jobs')
      .select('id, job_type, status, priority, result_summary, error_message, attempts, max_attempts, run_after, locked_by, locked_at, local_evidence_ref, created_at, updated_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (id) query = query.eq('id', id).limit(1);
    if (status) query = query.eq('status', status);
    if (jobType && isLocalAnalysisJobType(jobType)) query = query.eq('job_type', jobType);
    const { data, error } = await query;
    if (error) throw error;
    return apiSuccess(id ? (data?.[0] ?? null) : data, { source: 'MTN local analysis queue', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Local analysis job query failed.'), 'API_ERROR', 500);
  }
}

export async function POST(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const session = await getServerSession();
    if (!session) return apiError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
    const body = await request.json();
    const jobType = String(body.job_type || body.jobType || 'FINANCIAL_AUDIT').trim().toUpperCase();
    if (!isLocalAnalysisJobType(jobType)) {
      return apiError(`job_type must be one of: ${LOCAL_ANALYSIS_JOB_TYPES.join(', ')}`, 'INVALID_JOB_TYPE', 400);
    }
    const payload = normalizeLocalAnalysisPayload(jobType, (body.payload && typeof body.payload === 'object' ? body.payload : body) as Record<string, unknown>);
    const key = String(body.idempotency_key || body.idempotencyKey || idempotencyKey(jobType, payload));
    const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0;
    const { data, error } = await getSupabaseAdmin()
      .from('analysis_jobs')
      .upsert({
        job_type: jobType,
        status: 'queued',
        priority,
        payload,
        attempts: 0,
        locked_by: null,
        locked_at: null,
        error_message: null,
        completed_at: null,
        idempotency_key: key,
        created_by: session.systemId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'job_type,idempotency_key' })
      .select('id, job_type, status, priority, payload, created_at, updated_at')
      .single();
    if (error) throw error;
    return apiSuccess(data, { source: 'MTN local analysis queue', provider: 'Supabase', delay: 'REALTIME' }, 202);
  } catch (error) {
    return apiError(getErrorMessage(error, 'Local analysis job creation failed.'), 'API_ERROR', 500);
  }
}

export async function PATCH(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const session = await getServerSession();
    if (!session) return apiError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
    const body = await request.json();
    const id = String(body.id || '').trim();
    if (!id) return apiError('id is required.', 'INVALID_REQUEST', 400);
    const action = normalizeLocalAnalysisAction(body.action);
    const db = getSupabaseAdmin();
    const { data: job, error: fetchError } = await db
      .from('analysis_jobs')
      .select('id, status, attempts, max_attempts')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;
    if (!job) return apiError('Job not found.', 'NOT_FOUND', 404);

    const now = new Date().toISOString();
    const patch = action === 'cancel'
      ? {
          status: 'cancelled',
          locked_by: null,
          locked_at: null,
          error_message: body.reason ? String(body.reason) : 'Cancelled by operator.',
          completed_at: now,
          updated_at: now,
        }
      : {
          status: 'queued',
          attempts: action === 'retry' ? 0 : job.attempts,
          locked_by: null,
          locked_at: null,
          error_message: null,
          completed_at: null,
          run_after: now,
          updated_at: now,
        };

    const { data, error } = await db
      .from('analysis_jobs')
      .update(patch)
      .eq('id', id)
      .select('id, job_type, status, priority, result_summary, error_message, attempts, max_attempts, run_after, locked_by, locked_at, local_evidence_ref, created_at, updated_at, completed_at')
      .single();
    if (error) throw error;
    return apiSuccess(data, { source: 'MTN local analysis queue', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Local analysis job update failed.'), 'API_ERROR', 500);
  }
}
