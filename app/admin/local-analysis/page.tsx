'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  LOCAL_ANALYSIS_JOB_TYPES,
  type LocalAnalysisJobAction,
  type LocalAnalysisJobType,
} from '@/lib/local-analysis/contracts';

type ApiEnvelope<T> = {
  data?: T;
  message?: string;
};

interface AnalysisJob {
  id: string;
  job_type: LocalAnalysisJobType;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  priority: number;
  result_summary: Record<string, unknown> | null;
  error_message: string | null;
  attempts: number;
  max_attempts: number;
  run_after: string | null;
  locked_by: string | null;
  locked_at: string | null;
  local_evidence_ref: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface WorkerHeartbeat {
  worker_id: string;
  status: string;
  last_seen_at: string;
  current_job_id: string | null;
  metadata: Record<string, unknown>;
  freshness: {
    state: 'fresh' | 'stale' | 'missing' | 'invalid';
    ageSeconds: number | null;
  };
}

interface WorkerLog {
  id: string;
  supabase_job_id: string | null;
  worker_id: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface LocalAnalysisStatus {
  queue: {
    total: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    cancelled: number;
  };
  jobs: AnalysisJob[];
  localPostgres: {
    available: boolean;
    message: string | null;
    workers: WorkerHeartbeat[];
    recentLogs: WorkerLog[];
    evidenceCounts: Record<string, number>;
  };
}

const JOB_TEMPLATES: Record<LocalAnalysisJobType, Record<string, unknown>> = {
  FINANCIAL_AUDIT: {
    ticker: 'NVDA',
    market: 'US',
    financials: [
      { metric: 'revenue', source: 'SEC', value: 100, currency: 'USD', period: 'latest' },
      { metric: 'revenue', source: 'Yahoo', value: 103, currency: 'USD', period: 'latest' },
    ],
  },
  THESIS_CHECK: {
    ticker: 'NVDA',
    market: 'US',
    assumptions: [{ description: 'AI accelerator demand remains strong.', status: 'HEALTHY' }],
    events: [{ impact: 'STRENGTHENS', summary: 'Management raised data center guidance.' }],
    evidence: [],
  },
  COMMITTEE_REVIEW: {
    ticker: 'NVDA',
    market: 'US',
    agent_votes: [
      { agent_role: 'technical', recommendation: 'BUY', confidence: 0.7, rationale: 'Trend remains constructive.' },
      { agent_role: 'risk', recommendation: 'WATCH', confidence: 0.6, rationale: 'Valuation risk is elevated.' },
    ],
  },
  NEWS_PULSE: {
    ticker: 'NVDA',
    market: 'US',
    news: [{ headline: 'New platform demand update', impact_label: 'STRENGTHENS', source: 'manual' }],
  },
  RECOMMENDATION_BACKTEST: {
    strategy_key: 'daily-top10',
    dataset_key: 'manual-smoke',
    trades: [
      { return_pct: 5.2, excess_return_pct: 1.4 },
      { return_pct: -1.1, excess_return_pct: -0.6 },
    ],
  },
};

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusClass(status: AnalysisJob['status']) {
  if (status === 'succeeded') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
  if (status === 'failed') return 'border-red-400/30 bg-red-500/10 text-red-200';
  if (status === 'running') return 'border-sky-400/30 bg-sky-500/10 text-sky-200';
  if (status === 'cancelled') return 'border-zinc-400/30 bg-zinc-500/10 text-zinc-200';
  return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
}

function logClass(level: WorkerLog['level']) {
  if (level === 'ERROR') return 'text-red-200';
  if (level === 'WARN') return 'text-amber-200';
  if (level === 'DEBUG') return 'text-slate-400';
  return 'text-slate-200';
}

function shortJson(value: unknown) {
  if (!value) return '-';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function LocalAnalysisAdminPage() {
  const [status, setStatus] = useState<LocalAnalysisStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobType, setJobType] = useState<LocalAnalysisJobType>('FINANCIAL_AUDIT');
  const [priority, setPriority] = useState(0);
  const [payloadText, setPayloadText] = useState(JSON.stringify(JOB_TEMPLATES.FINANCIAL_AUDIT, null, 2));
  const [submitting, setSubmitting] = useState(false);
  const [actionJobId, setActionJobId] = useState<string | null>(null);

  const workers = status?.localPostgres.workers ?? [];
  const latestWorker = workers[0] ?? null;
  const queue = status?.queue;

  const evidenceRows = useMemo(
    () => Object.entries(status?.localPostgres.evidenceCounts ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    [status?.localPostgres.evidenceCounts],
  );

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/local-analysis/status', { cache: 'no-store' });
      const json = await response.json() as ApiEnvelope<LocalAnalysisStatus>;
      if (!response.ok || !json.data) throw new Error(json.message || '운영 상태 조회 실패');
      setStatus(json.data);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : '운영 상태 조회 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  function selectJobType(nextJobType: LocalAnalysisJobType) {
    setJobType(nextJobType);
    setPayloadText(JSON.stringify(JOB_TEMPLATES[nextJobType], null, 2));
  }

  async function submitJob() {
    setSubmitting(true);
    try {
      const payload = JSON.parse(payloadText) as Record<string, unknown>;
      const response = await fetch('/api/local-analysis/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ job_type: jobType, priority, payload }),
      });
      const json = await response.json() as ApiEnvelope<AnalysisJob>;
      if (!response.ok) throw new Error(json.message || 'job 생성 실패');
      await fetchStatus();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'job 생성 실패');
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(id: string, action: LocalAnalysisJobAction) {
    setActionJobId(id);
    try {
      const response = await fetch('/api/local-analysis/jobs', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const json = await response.json() as ApiEnvelope<AnalysisJob>;
      if (!response.ok) throw new Error(json.message || 'job 상태 변경 실패');
      await fetchStatus();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'job 상태 변경 실패');
    } finally {
      setActionJobId(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">Operations</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">로컬 분석 큐</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Supabase job queue와 로컬 Postgres worker 상태를 한 화면에서 확인합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-emerald-400/35 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-md border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricPanel icon={<Activity className="h-4 w-4" />} label="대기" value={queue?.queued ?? 0} tone="amber" />
        <MetricPanel icon={<Activity className="h-4 w-4" />} label="실행중" value={queue?.running ?? 0} tone="sky" />
        <MetricPanel icon={<CheckCircle2 className="h-4 w-4" />} label="성공" value={queue?.succeeded ?? 0} tone="emerald" />
        <MetricPanel icon={<XCircle className="h-4 w-4" />} label="실패" value={queue?.failed ?? 0} tone="red" />
        <MetricPanel icon={<Database className="h-4 w-4" />} label="총 job" value={queue?.total ?? 0} tone="slate" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">최근 job</h2>
              <p className="text-xs text-[var(--text-secondary)]">실패 job은 retry, running job은 requeue로 잠금 해제할 수 있습니다.</p>
            </div>
            <span className="text-xs text-[var(--text-muted)]">{status?.jobs.length ?? 0} rows</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)] text-sm">
              <thead className="bg-[var(--surface-soft)] text-xs uppercase text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2 text-left">상태</th>
                  <th className="px-4 py-2 text-left">타입</th>
                  <th className="px-4 py-2 text-left">요약</th>
                  <th className="px-4 py-2 text-left">시각</th>
                  <th className="px-4 py-2 text-right">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {(status?.jobs ?? []).map((job) => (
                  <tr key={job.id} className="align-top">
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(job.status)}`}>
                        {job.status}
                      </span>
                      <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{job.id.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-200">{job.job_type}</td>
                    <td className="max-w-xl px-4 py-3 text-xs text-[var(--text-secondary)]">
                      <p className="line-clamp-2 text-[var(--text-primary)]">
                        {String(job.result_summary?.summary || job.error_message || '-')}
                      </p>
                      <p className="mt-1 line-clamp-1 font-mono text-[10px] text-[var(--text-muted)]">
                        {shortJson(job.local_evidence_ref)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                      <p>생성 {formatDate(job.created_at)}</p>
                      <p>완료 {formatDate(job.completed_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <IconAction
                          label="retry"
                          disabled={actionJobId === job.id || job.status === 'running'}
                          onClick={() => runAction(job.id, 'retry')}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </IconAction>
                        <IconAction
                          label="requeue"
                          disabled={actionJobId === job.id || job.status === 'queued'}
                          onClick={() => runAction(job.id, 'requeue')}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </IconAction>
                        <IconAction
                          label="cancel"
                          disabled={actionJobId === job.id || job.status === 'succeeded' || job.status === 'cancelled'}
                          onClick={() => runAction(job.id, 'cancel')}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </IconAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="flex flex-col gap-5">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">worker</h2>
              <Database className="h-4 w-4 text-sky-300" />
            </div>
            {latestWorker ? (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">{latestWorker.worker_id}</span>
                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                    latestWorker.freshness.state === 'fresh'
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                  }`}>
                    {latestWorker.status} · {latestWorker.freshness.state}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  마지막 heartbeat {formatDate(latestWorker.last_seen_at)}
                  {latestWorker.freshness.ageSeconds !== null ? ` · ${latestWorker.freshness.ageSeconds}s 전` : ''}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                {status?.localPostgres.message || 'worker heartbeat가 없습니다.'}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">smoke job 생성</h2>
            <div className="mt-3 space-y-3">
              <select
                value={jobType}
                onChange={(event) => selectJobType(event.target.value as LocalAnalysisJobType)}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {LOCAL_ANALYSIS_JOB_TYPES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <input
                type="number"
                value={priority}
                onChange={(event) => setPriority(Number(event.target.value))}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--text-primary)]"
                aria-label="priority"
              />
              <textarea
                value={payloadText}
                onChange={(event) => setPayloadText(event.target.value)}
                rows={12}
                className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={submitJob}
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                job 생성
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">로컬 evidence</h2>
            <div className="mt-3 space-y-2 text-sm">
              {evidenceRows.length === 0 ? (
                <p className="text-[var(--text-secondary)]">{status?.localPostgres.message || '카운트 없음'}</p>
              ) : evidenceRows.map(([table, count]) => (
                <div key={table} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-[var(--text-secondary)]">{table}</span>
                  <span className="font-semibold text-[var(--text-primary)]">{count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">최근 worker 로그</h2>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {(status?.localPostgres.recentLogs ?? []).slice(0, 12).map((log) => (
            <div key={log.id} className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[120px_160px_minmax(0,1fr)]">
              <span className="text-[var(--text-muted)]">{formatDate(log.created_at)}</span>
              <span className={`font-mono ${logClass(log.level)}`}>{log.level} · {log.worker_id}</span>
              <span className="text-[var(--text-secondary)]">{log.message}</span>
            </div>
          ))}
          {!status?.localPostgres.recentLogs?.length && (
            <p className="px-4 py-3 text-sm text-[var(--text-secondary)]">표시할 로그가 없습니다.</p>
          )}
        </div>
      </section>
    </main>
  );
}

function MetricPanel({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  tone: 'amber' | 'sky' | 'emerald' | 'red' | 'slate';
}) {
  const toneClass = {
    amber: 'border-amber-400/25 text-amber-200',
    sky: 'border-sky-400/25 text-sky-200',
    emerald: 'border-emerald-400/25 text-emerald-200',
    red: 'border-red-400/25 text-red-200',
    slate: 'border-slate-400/20 text-slate-200',
  }[tone];

  return (
    <div className={`rounded-lg border bg-[var(--surface)] p-4 ${toneClass}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">{value.toLocaleString()}</p>
    </div>
  );
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)] transition-colors hover:border-emerald-400/35 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
