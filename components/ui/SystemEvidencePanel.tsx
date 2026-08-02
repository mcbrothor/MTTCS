import { AlertTriangle, CheckCircle2, Database, ShieldAlert } from 'lucide-react';
import type { DataSourceMeta } from '@/types';
import {
  deriveEvidenceState,
  describeFreshness,
  safeDisplayError,
  type DisplayFailure,
  type EvidenceState,
} from '@/components/ui/system-evidence';

export interface EvidenceItem {
  label: string;
  value: string;
  detail?: string | null;
}

interface SystemEvidencePanelProps {
  ariaLabel: string;
  title: string;
  meta?: Partial<DataSourceMeta> | null;
  state?: EvidenceState;
  items?: EvidenceItem[];
  nextAction: string;
  showStandardMeta?: boolean;
  className?: string;
}

const STATE_VIEW = {
  ready: {
    label: '사용 가능',
    description: '현재 제공된 근거 범위 안에서 사용할 수 있습니다.',
    icon: CheckCircle2,
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  },
  limited: {
    label: '제한 사용',
    description: '지연·대체 데이터·경고를 확인한 뒤 보수적으로 사용하세요.',
    icon: AlertTriangle,
    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  },
  blocked: {
    label: '사용 중단',
    description: '차단 근거를 해소하기 전 신규 투자 판단에 사용하지 마세요.',
    icon: ShieldAlert,
    tone: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
  },
  waiting: {
    label: '검증 대기',
    description: '측정되지 않은 항목이 있어 결과를 확정적으로 해석할 수 없습니다.',
    icon: Database,
    tone: 'border-slate-600 bg-slate-800/55 text-slate-200',
  },
} as const;

function formatDateTime(value: string | null | undefined) {
  if (!value) return '미측정';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function metaItems(meta: Partial<DataSourceMeta> | null | undefined): EvidenceItem[] {
  const freshness = describeFreshness(meta?.isStale, meta?.staleReason);
  const fallback = meta?.fallbackUsed === true
    ? { value: '사용', detail: meta.fallbackReason || '대체 데이터 사용 사유가 제공되지 않았습니다.' }
    : meta?.fallbackUsed === false
      ? { value: '미사용', detail: 'API가 대체 데이터 미사용으로 표시했습니다.' }
      : { value: '미측정', detail: 'API가 대체 데이터 사용 여부를 제공하지 않았습니다.' };

  return [
    {
      label: '기준시각',
      value: formatDateTime(meta?.observedAt || meta?.asOf),
      detail: meta?.observedAt ? '원천 관측시각' : meta?.asOf ? 'API 응답 기준시각' : 'API 미제공',
    },
    {
      label: '출처',
      value: [meta?.provider, meta?.source].filter(Boolean).join(' · ') || '미측정',
      detail: meta?.delay ? `지연 등급 ${meta.delay}` : '지연 등급 미측정',
    },
    { label: '신선도', value: freshness.label, detail: freshness.detail },
    { label: '대체 데이터', ...fallback },
  ];
}

export default function SystemEvidencePanel({
  ariaLabel,
  title,
  meta,
  state,
  items = [],
  nextAction,
  showStandardMeta = true,
  className = '',
}: SystemEvidencePanelProps) {
  const resolvedState = state || deriveEvidenceState(meta);
  const view = STATE_VIEW[resolvedState];
  const StatusIcon = view.icon;
  const evidence = [...(showStandardMeta ? metaItems(meta) : []), ...items];
  const warnings = meta?.warnings || [];

  return (
    <section aria-label={ariaLabel} className={`min-w-0 rounded-xl border border-slate-800 bg-slate-950/55 p-4 sm:p-5 ${className}`}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">{view.description}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-bold ${view.tone}`}>
          <StatusIcon className="h-4 w-4" aria-hidden="true" />
          상태: {view.label}
        </span>
      </div>

      {evidence.length > 0 && (
        <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {evidence.map((item, index) => (
            <div key={`${item.label}-${index}`} className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/45 p-3">
              <dt className="text-[11px] font-semibold text-slate-500">{item.label}</dt>
              <dd className="mt-1 break-words text-sm font-bold text-slate-100">{item.value}</dd>
              {item.detail && <p className="mt-1 break-words text-[11px] leading-5 text-slate-500">{item.detail}</p>}
            </div>
          ))}
        </dl>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
          <p className="font-bold">데이터 경고 {warnings.length}건</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {warnings.map((warning, index) => <li key={`${warning}-${index}`}>{safeDisplayError(warning)}</li>)}
          </ul>
        </div>
      )}

      <p className="mt-4 break-words rounded-lg border border-sky-500/20 bg-sky-500/8 px-3 py-2 text-xs leading-5 text-sky-100">
        <strong>다음 조치</strong> {nextAction}
      </p>
    </section>
  );
}

export function SystemFailurePanel({
  title,
  failure,
  nextAction,
  onRetry,
  className = '',
}: {
  title: string;
  failure: DisplayFailure;
  nextAction: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <section role="alert" aria-label={title} className={`min-w-0 rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-sm text-rose-100 sm:p-5 ${className}`}>
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-bold text-white">{title}</h2>
          <p className="mt-2 break-words leading-6">{safeDisplayError(failure.rawMessage)}</p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-rose-500/20 bg-black/10 p-3">
          <dt className="text-xs text-rose-200/70">마지막 성공</dt>
          <dd className="mt-1 font-semibold">{formatDateTime(failure.lastSuccessfulAt)}</dd>
        </div>
        <div className="rounded-lg border border-rose-500/20 bg-black/10 p-3">
          <dt className="text-xs text-rose-200/70">복구 가능 여부</dt>
          <dd className="mt-1 font-semibold">{failure.recoverable === true ? '재시도 가능' : failure.recoverable === false ? '운영 확인 필요' : '미측정'}</dd>
        </div>
      </dl>
      <p className="mt-4 break-words rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs leading-5">
        <strong>다음 조치</strong> {nextAction}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-rose-300/40 px-3 py-2 text-xs font-bold text-white outline-none hover:bg-rose-500/15 focus-visible:ring-2 focus-visible:ring-white"
        >
          다시 불러오기
        </button>
      )}
    </section>
  );
}
