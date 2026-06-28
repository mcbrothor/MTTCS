import crypto from 'node:crypto';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getServerSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SUPPORTED_JOB_TYPES = new Set([
  'FINANCIAL_AUDIT',
  'THESIS_CHECK',
  'COMMITTEE_REVIEW',
  'NEWS_PULSE',
  'RECOMMENDATION_BACKTEST',
]);

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

function normalizePayload(jobType: string, payload: Record<string, unknown>) {
  const ticker = String(payload.ticker || '').trim().toUpperCase();
  const market = payload.market === 'KR' ? 'KR' : payload.market === 'US' ? 'US' : null;
  if (jobType === 'THESIS_CHECK') {
    const thesisId = payload.thesis_id || payload.thesisId || null;
    if (!ticker && !thesisId) throw new Error('THESIS_CHECK requires ticker or thesis_id.');
    return {
      ...payload,
      ticker,
      market,
      thesis_id: thesisId,
      assumptions: Array.isArray(payload.assumptions) ? payload.assumptions : [],
      events: Array.isArray(payload.events) ? payload.events : [],
      evidence: Array.isArray(payload.evidence) ? payload.evidence : [],
    };
  }
  if (jobType === 'COMMITTEE_REVIEW') {
    if (!ticker) throw new Error('COMMITTEE_REVIEW requires ticker.');
    return {
      ...payload,
      ticker,
      market,
      agent_votes: Array.isArray(payload.agent_votes) ? payload.agent_votes : Array.isArray(payload.agents) ? payload.agents : [],
    };
  }
  if (jobType === 'NEWS_PULSE') {
    if (!ticker) throw new Error('NEWS_PULSE requires ticker.');
    return {
      ...payload,
      ticker,
      market,
      news: Array.isArray(payload.news) ? payload.news : [],
    };
  }
  if (jobType === 'RECOMMENDATION_BACKTEST') {
    const strategyKey = String(payload.strategy_key || payload.strategyKey || '').trim();
    if (!strategyKey) throw new Error('RECOMMENDATION_BACKTEST requires strategy_key.');
    return {
      ...payload,
      strategy_key: strategyKey,
      dataset_key: payload.dataset_key || payload.datasetKey || null,
      trades: Array.isArray(payload.trades) ? payload.trades : Array.isArray(payload.picks) ? payload.picks : [],
    };
  }

  if (!ticker) throw new Error('FINANCIAL_AUDIT requires ticker.');
  const financials = Array.isArray(payload.financials) ? payload.financials : [];
  return {
    ...payload,
    ticker,
    market,
    financials,
  };
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return apiError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    const db = getSupabaseAdmin();
    let query = db
      .from('analysis_jobs')
      .select('id, job_type, status, priority, result_summary, error_message, attempts, max_attempts, run_after, locked_by, locked_at, local_evidence_ref, created_at, updated_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(20);
    if (id) query = query.eq('id', id).limit(1);
    const { data, error } = await query;
    if (error) throw error;
    return apiSuccess(id ? (data?.[0] ?? null) : data, { source: 'MTN local analysis queue', provider: 'Supabase', delay: 'REALTIME' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Local analysis job query failed.'), 'API_ERROR', 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session) return apiError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
    const body = await request.json();
    const jobType = String(body.job_type || body.jobType || 'FINANCIAL_AUDIT').trim().toUpperCase();
    if (!SUPPORTED_JOB_TYPES.has(jobType)) {
      return apiError(`job_type must be one of: ${Array.from(SUPPORTED_JOB_TYPES).join(', ')}`, 'INVALID_JOB_TYPE', 400);
    }
    const payload = normalizePayload(jobType, (body.payload && typeof body.payload === 'object' ? body.payload : body) as Record<string, unknown>);
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
