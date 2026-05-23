'use client';

import { Activity, AlertTriangle, CheckCircle2, Database, ShieldAlert, Target } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';
import { computeDecision } from '@/lib/decision/rule';
import type { MasterFilterMetricDetail } from '@/types';

const DECISION_CONFIG = {
  GO_FULL: {
    shell: 'border-emerald-500/35 bg-emerald-500/8',
    text: 'text-emerald-300',
    badge: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-200',
    icon: CheckCircle2,
  },
  GO_75: {
    shell: 'border-emerald-500/25 bg-emerald-500/6',
    text: 'text-emerald-300',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    icon: CheckCircle2,
  },
  GO_50: {
    shell: 'border-amber-500/30 bg-amber-500/8',
    text: 'text-amber-300',
    badge: 'border-amber-500/30 bg-amber-500/12 text-amber-200',
    icon: AlertTriangle,
  },
  NO_GO_HOLD: {
    shell: 'border-slate-600/60 bg-slate-900/70',
    text: 'text-slate-200',
    badge: 'border-slate-600 bg-slate-800/80 text-slate-200',
    icon: ShieldAlert,
  },
  NO_GO: {
    shell: 'border-rose-500/35 bg-rose-500/8',
    text: 'text-rose-300',
    badge: 'border-rose-500/35 bg-rose-500/12 text-rose-200',
    icon: ShieldAlert,
  },
} as const;

function metricList(metrics: Record<string, MasterFilterMetricDetail | number | string | object | undefined>) {
  return [
    metrics.trend,
    metrics.breadth,
    metrics.volatility,
    metrics.ftd,
    metrics.distribution,
    metrics.newHighLow,
    metrics.sectorRotation,
  ].filter(Boolean) as MasterFilterMetricDetail[];
}

function strongestDrivers(items: MasterFilterMetricDetail[]) {
  const pass = items.filter((item) => item.status === 'PASS').slice(0, 2);
  const weak = items.filter((item) => item.status !== 'PASS').slice(0, 3);
  return { pass, weak };
}

function formatScore(score: number, isUnscored: boolean) {
  return isUnscored ? 'UNSCORED' : `${score}/100`;
}

function exposureLabel(multiplier: number, isUnscored: boolean) {
  if (isUnscored) return '0% · 데이터 확인 전';
  return `${Math.round(multiplier * 100)}% 권장 상한`;
}

function userFacingIssue(message?: string) {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (lower.includes('authentication') || lower.includes('unauthorized')) {
    return 'API 인증 필요 · 세션 또는 서버 인증 상태를 확인하세요.';
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return '데이터 요청 시간 초과 · 최근 정상 값 또는 재시도가 필요합니다.';
  }
  return message;
}

export default function DecisionBox() {
  const { data, macroRegime, isLoading, isStale, error, conflictWarning } = useMarket();

  if (isLoading || !data || !data.metrics) {
    return (
      <section className="rounded-xl border border-sky-500/25 bg-slate-950/55 p-4 shadow-[var(--panel-shadow)] sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-200">
            DECISION COCKPIT
          </span>
          <span className="rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 text-[10px] font-semibold text-slate-300">
            동기화 중
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-2xl font-black leading-tight text-slate-200 sm:text-3xl">
              시장 데이터 확인 중
            </p>
            <p className="mt-1.5 text-sm leading-6 text-slate-400">
              마스터 필터와 매크로 레짐을 동시에 확인하고 있습니다. 응답이 지연되면 데이터 미채점 상태로 전환합니다.
            </p>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">P3 Score</p>
              <p className="mt-1 font-mono text-lg font-black text-white">PENDING</p>
            </div>
            <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Exposure</p>
              <p className="mt-1 text-sm font-black text-white">Hold</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const metrics = metricList(data.metrics as unknown as Record<string, MasterFilterMetricDetail | number | string | object | undefined>);
  const result = computeDecision(data.state, macroRegime, {
    distributionDays: typeof data.metrics.distribution?.value === 'number'
      ? data.metrics.distribution.value
      : undefined,
    vix: typeof data.metrics.volatility?.value === 'number'
      ? data.metrics.volatility.value
      : undefined,
  });
  const cfg = DECISION_CONFIG[result.decision];
  const Icon = cfg.icon;
  const isUnscored = data.state === 'GREY' || isStale;
  const { pass, weak } = strongestDrivers(metrics);
  const updatedAt = data.metrics.updatedAt || data.metrics.meta.asOf;
  const dataLabel = isUnscored
    ? '데이터 미채점'
    : data.metrics.meta.delay === 'REALTIME'
      ? '실시간'
      : data.metrics.meta.delay === 'UNKNOWN'
        ? '출처 확인 필요'
        : '지연 데이터';

  return (
    <section
      className={`rounded-xl border p-4 shadow-[var(--panel-shadow)] sm:p-5 ${cfg.shell}`}
      role="status"
      aria-label={`오늘 진입 결정: ${result.headline}`}
    >
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold ${cfg.badge}`}>
              <Icon className="h-3.5 w-3.5" />
              DECISION COCKPIT
            </span>
            <span className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-1 text-[10px] font-semibold text-slate-300">
              {data.market} Market
            </span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${isUnscored ? 'border-sky-500/35 bg-sky-500/10 text-sky-200' : 'border-emerald-500/25 bg-emerald-500/8 text-emerald-200'}`}>
              {dataLabel}
            </span>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className={`text-2xl font-black leading-tight sm:text-3xl ${cfg.text}`}>
                {isUnscored ? 'NO-GO · 데이터 확인' : result.headline}
              </p>
              <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-300">
                {isUnscored
                  ? '시장 약세 판정이 아니라 필수 데이터가 미수신된 상태입니다. 점수가 정상 수집될 때까지 신규 진입과 피라미딩을 보류합니다.'
                  : result.reason}
              </p>
            </div>

            <div className="grid min-w-[220px] grid-cols-2 gap-2">
              <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-slate-500">P3 Score</p>
                <p className="mt-1 font-mono text-lg font-black text-white">
                  {formatScore(data.metrics.p3Score ?? data.metrics.score ?? 0, isUnscored)}
                </p>
              </div>
              <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Exposure</p>
                <p className="mt-1 text-sm font-black text-white">
                  {exposureLabel(result.sizeMultiplier, isUnscored)}
                </p>
              </div>
            </div>
          </div>

          {(conflictWarning || error || (data.metrics.meta?.warnings?.length ?? 0) > 0) && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs leading-5 text-amber-200">
              {conflictWarning ?? userFacingIssue(error?.message) ?? data.metrics.meta?.warnings?.[0]}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 xl:grid-cols-1">
          <div className="rounded-lg border border-slate-700/70 bg-slate-950/45 p-2.5 xl:p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400">
              <Activity className="h-3.5 w-3.5 text-sky-300" />
              주요 근거
            </div>
            <div className="space-y-1.5">
              {(pass.length ? pass : metrics.slice(0, 2)).map((item) => (
                <p key={item.label} className="flex items-center justify-between gap-2 text-[11px] xl:text-xs">
                  <span className="truncate text-slate-300">{item.label}</span>
                  <span className={item.status === 'PASS' ? 'text-emerald-300' : item.status === 'WARNING' ? 'text-amber-300' : 'text-rose-300'}>
                    {item.value ?? 'N/A'}
                  </span>
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-700/70 bg-slate-950/45 p-2.5 xl:p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400">
              <Target className="h-3.5 w-3.5 text-amber-300" />
              판단 변경 트리거
            </div>
            <div className="space-y-1 text-[11px] leading-4 text-slate-300 xl:text-xs xl:leading-5">
              {isUnscored ? (
                <p>API 응답 정상화와 기준 시각 확인 후 재채점</p>
              ) : data.state === 'GREEN' ? (
                <p>분산일 증가, VIX 급등, 시장폭 훼손 시 비중 축소</p>
              ) : (
                <p>GREEN 회복, 시장폭 개선, 주도 섹터 확산 확인</p>
              )}
              {weak.slice(0, 2).map((item) => (
                <p key={item.label} className="text-slate-400">
                  {item.label}: {item.status}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-700/70 bg-slate-950/45 p-2.5 xl:p-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase text-slate-400">
              <Database className="h-3.5 w-3.5 text-sky-300" />
              데이터 신뢰도
            </div>
            <p className="text-[11px] leading-4 text-slate-300 xl:text-xs xl:leading-5">
              {data.metrics.meta.provider} · {data.metrics.meta.source}
            </p>
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              {updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : 'as-of 확인 불가'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
