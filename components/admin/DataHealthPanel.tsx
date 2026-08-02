'use client';

import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import SystemEvidencePanel, { SystemFailurePanel } from '@/components/ui/SystemEvidencePanel';
import { safeDisplayError, type DisplayFailure } from '@/components/ui/system-evidence';
import type { DataSourceMeta } from '@/types';

export interface PipelineHealthRow {
  id: string;
  pipeline: string;
  provider: string;
  market: string | null;
  status: 'SUCCESS' | 'DEGRADED' | 'FAILED';
  recorded_status?: 'SUCCESS' | 'DEGRADED' | 'FAILED';
  observed_at: string | null;
  completed_at: string | null;
  fallback_used: boolean;
  error_message: string | null;
  freshness_status?: 'FRESH' | 'STALE' | 'UNKNOWN';
  freshness_at?: string | null;
  age_seconds?: number | null;
  expected_max_age_seconds?: number;
  next_expected_at?: string | null;
  last_success_at?: string | null;
  stale_reason?: string | null;
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '미측정';
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}초`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}분`;
  if (seconds < 48 * 3_600) return `${Math.floor(seconds / 3_600)}시간`;
  return `${Math.floor(seconds / 86_400)}일`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '미측정';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_VIEW = {
  SUCCESS: {
    label: '정상',
    icon: CheckCircle2,
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  },
  DEGRADED: {
    label: '부분 장애',
    icon: AlertTriangle,
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  },
  FAILED: {
    label: '실패',
    icon: ShieldAlert,
    tone: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
  },
} as const;

function rowNextAction(row: PipelineHealthRow) {
  if (row.freshness_status === 'UNKNOWN') return '원천 관측시각을 복구하기 전에는 신규 투자 판단에 사용하지 마세요.';
  if (row.freshness_status === 'STALE') return '파이프라인을 재실행하고 원천 관측시각이 SLA 안으로 돌아왔는지 확인하세요.';
  if (row.status === 'FAILED') return '신규 투자 판단을 중단하고 파이프라인을 재실행하세요.';
  if (row.status === 'DEGRADED') return '대체 데이터의 범위와 영향을 확인하고 신규 판단은 보수적으로 제한하세요.';
  return '다음 예정 실행과 신선도 상태를 계속 관찰하세요.';
}

function lastSuccess(row: PipelineHealthRow) {
  if (row.last_success_at !== undefined) return formatDate(row.last_success_at);
  if (row.status !== 'SUCCESS') return '미측정';
  return formatDate(row.completed_at || row.observed_at);
}

export default function DataHealthPanel({
  rows,
  meta,
  failure,
  loading = false,
  onRefresh,
}: {
  rows: PipelineHealthRow[];
  meta: DataSourceMeta | null;
  failure: DisplayFailure | null;
  loading?: boolean;
  onRefresh: () => void;
}) {
  const counts = rows.reduce(
    (result, row) => ({ ...result, [row.status]: result[row.status] + 1 }),
    { SUCCESS: 0, DEGRADED: 0, FAILED: 0 },
  );

  return (
    <section aria-label="Data Health" className="min-w-0 rounded-xl border border-slate-700 bg-slate-900/60 p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <Activity className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            Data Health
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">원천 데이터의 기준시각, 마지막 성공, 대체 데이터, 장애 상태를 확인합니다.</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Data Health 새로고침"
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 outline-none transition-colors hover:border-slate-500 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          새로고침
        </button>
      </div>

      {!failure && (
        <div aria-label="파이프라인 상태 요약" className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-100">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> 정상 {counts.SUCCESS}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-100">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> 부분 장애 {counts.DEGRADED}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-rose-100">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> 실패 {counts.FAILED}
          </span>
        </div>
      )}

      {failure ? (
        <SystemFailurePanel
          title="Data Health를 불러오지 못했습니다"
          failure={failure}
          nextAction="신규 투자 판단을 중단하고 운영 로그를 확인한 뒤 다시 불러오세요."
          onRetry={onRefresh}
          className="mt-4"
        />
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/45 p-4 text-sm leading-6 text-slate-400">
          기록된 파이프라인 실행이 없습니다. 상태와 마지막 성공은 <strong className="text-slate-200">미측정</strong>입니다.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => {
            const view = STATUS_VIEW[row.status];
            const StatusIcon = view.icon;
            return (
              <article key={row.id} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-white">{row.pipeline} · {row.market || 'ALL'}</h3>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-500">출처 {row.provider || '미측정'} · 원천 관측 {formatDate(row.freshness_at || row.observed_at)}</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-xs font-bold ${view.tone}`}>
                    <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    상태: {view.label}
                  </span>
                </div>

                <dl className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                    <dt className="text-[11px] text-slate-500">마지막 성공</dt>
                    <dd className="mt-1 break-words text-xs font-semibold text-slate-200">{lastSuccess(row)}</dd>
                  </div>
                  <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                    <dt className="text-[11px] text-slate-500">대체 데이터</dt>
                    <dd className="mt-1 text-xs font-semibold text-slate-200">{row.fallback_used ? '사용' : '미사용'}</dd>
                  </div>
                  <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                    <dt className="text-[11px] text-slate-500">신선도 / SLA</dt>
                    <dd className="mt-1 break-words text-xs font-semibold text-slate-200">
                      {row.freshness_status === 'FRESH' ? '정상' : row.freshness_status === 'STALE' ? '지연' : '미측정'}
                      {' · '}{formatDuration(row.age_seconds)} / {formatDuration(row.expected_max_age_seconds)}
                    </dd>
                  </div>
                  <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
                    <dt className="text-[11px] text-slate-500">다음 기대시각</dt>
                    <dd className="mt-1 break-words text-xs font-semibold text-slate-200">{formatDate(row.next_expected_at)}</dd>
                  </div>
                </dl>

                {row.recorded_status && row.recorded_status !== row.status && (
                  <p className="mt-3 break-words rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100">
                    저장 상태 {row.recorded_status}였으나 신선도 검증 결과 {row.status}로 제한했습니다.
                  </p>
                )}

                {row.stale_reason && row.freshness_status !== 'FRESH' && (
                  <p className="mt-3 break-words rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-100">
                    <strong>신선도 제한</strong> {row.stale_reason}
                  </p>
                )}

                {row.error_message && row.status !== 'SUCCESS' && (
                  <p className="mt-3 break-words rounded-lg border border-slate-800 bg-slate-900/45 px-3 py-2 text-xs leading-5 text-slate-300">
                    <strong>장애 요약</strong> {safeDisplayError(row.error_message)}
                  </p>
                )}
                <p className="mt-3 break-words rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs leading-5 text-sky-100">
                  <strong>다음 조치</strong> {rowNextAction(row)}
                </p>
              </article>
            );
          })}
        </div>
      )}

      {!failure && meta && (
        <SystemEvidencePanel
          ariaLabel="Data Health 응답 근거"
          title="상태 조회 근거"
          meta={meta}
          nextAction="표시된 파이프라인별 상태와 원천 관측시각을 함께 확인하세요."
          className="mt-4"
        />
      )}
    </section>
  );
}
