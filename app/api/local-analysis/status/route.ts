import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import pg from 'pg';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { getServerSession } from '@/lib/auth/session';
import { buildLocalAnalysisQueueSummary, classifyWorkerFreshness } from '@/lib/local-analysis/contracts';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface WorkerHeartbeatRow {
  worker_id: string;
  status: string;
  last_seen_at: string | Date;
  current_job_id: string | null;
  metadata: Record<string, unknown>;
}

interface WorkerLogRow {
  id: string;
  supabase_job_id: string | null;
  worker_id: string;
  level: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string | Date;
}

interface EvidenceCountRow {
  table_name: string;
  row_count: number;
}

function isoString(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

async function readLocalPostgresStatus() {
  const url = process.env.LOCAL_POSTGRES_URL;
  if (!url) {
    return {
      available: false,
      message: 'LOCAL_POSTGRES_URL is not configured.',
      workers: [],
      recentLogs: [],
      evidenceCounts: {},
    };
  }

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const [workerResult, logResult, evidenceResult] = await Promise.all([
      client.query<WorkerHeartbeatRow>(
        `select worker_id, status, last_seen_at, current_job_id, metadata
         from worker_heartbeats
         order by last_seen_at desc
         limit 10`,
      ),
      client.query<WorkerLogRow>(
        `select id, supabase_job_id, worker_id, level, message, metadata, created_at
         from worker_job_logs
         order by created_at desc
         limit 20`,
      ),
      client.query<EvidenceCountRow>(
        `select 'financial_audit_findings' as table_name, count(*)::int as row_count from financial_audit_findings
         union all
         select 'research_evidence' as table_name, count(*)::int as row_count from research_evidence
         union all
         select 'news_events' as table_name, count(*)::int as row_count from news_events
         union all
         select 'committee_agent_outputs' as table_name, count(*)::int as row_count from committee_agent_outputs
         union all
         select 'backtest_runs' as table_name, count(*)::int as row_count from backtest_runs`,
      ),
    ]);

    return {
      available: true,
      message: null,
      workers: workerResult.rows.map((row) => ({
        ...row,
        last_seen_at: isoString(row.last_seen_at),
        freshness: classifyWorkerFreshness(isoString(row.last_seen_at)),
      })),
      recentLogs: logResult.rows.map((row) => ({ ...row, created_at: isoString(row.created_at) })),
      evidenceCounts: Object.fromEntries(evidenceResult.rows.map((row) => [row.table_name, row.row_count])),
    };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  try {
    const session = await getServerSession();
    if (!session) return apiError('로그인이 필요합니다.', 'UNAUTHORIZED', 401);
    const db = getSupabaseAdmin();
    const { data: jobs, error } = await db
      .from('analysis_jobs')
      .select('id, job_type, status, priority, result_summary, error_message, attempts, max_attempts, run_after, locked_by, locked_at, local_evidence_ref, created_at, updated_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;

    const localPostgres = await readLocalPostgresStatus().catch((error) => ({
      available: false,
      message: getErrorMessage(error, 'Local Postgres status query failed.'),
      workers: [],
      recentLogs: [],
      evidenceCounts: {},
    }));

    return apiSuccess(
      {
        queue: buildLocalAnalysisQueueSummary(jobs || []),
        jobs: jobs || [],
        localPostgres,
      },
      { source: 'MTN local analysis operations', provider: 'Supabase + Local Postgres', delay: 'REALTIME' },
    );
  } catch (error) {
    return apiError(getErrorMessage(error, 'Local analysis status query failed.'), 'API_ERROR', 500);
  }
}
