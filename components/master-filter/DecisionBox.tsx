'use client';

import { Activity, AlertTriangle, CheckCircle2, Database, ShieldAlert, Target } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';
import { computeDecision } from '@/lib/decision/rule';
import {
  friendlyDecisionHeadline,
  friendlyDecisionReason,
  friendlyDataSource,
  friendlyIssue,
  friendlyMarketLabel,
  friendlyMarketStateLabel,
  friendlyMetricLabel,
  friendlyMetricStatus,
  friendlyMetricValue,
} from '@/lib/market-display';
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
  return isUnscored ? '확인 필요' : `${score}/100`;
}

function exposureLabel(multiplier: number, isUnscored: boolean) {
  if (isUnscored) return '확인 전 보류';
  return `${Math.round(multiplier * 100)}% 권장 상한`;
}

function decisionAction(decision: keyof typeof DECISION_CONFIG, isUnscored: boolean) {
  if (isUnscored) return '새 매수는 잠시 멈추고 데이터가 다시 확인될 때까지 기다리세요.';
  if (decision === 'NO_GO') return '새 매수는 멈추고 현금 비중과 보유 종목의 손절선을 먼저 점검하세요.';
  if (decision === 'NO_GO_HOLD') return '새 매수는 보류하고 보유 종목만 계획한 기준에 맞춰 관리하세요.';
  if (decision === 'GO_50') return '후보 종목을 절반 이하 비중으로만 검토하고 손절 기준을 짧게 잡으세요.';
  if (decision === 'GO_75') return '후보 종목을 평소보다 작은 비중으로 나눠 진입하세요.';
  return '후보 종목의 매수 지점과 손절선을 확인한 뒤 계획한 비중 안에서 진입하세요.';
}

export default function DecisionBox() {
  const { data, macroRegime, isLoading, isStale, error, conflictWarning } = useMarket();

  if (isLoading || !data || !data.metrics) {
    return (
      <section className="rounded-xl border border-sky-500/25 bg-slate-950/55 p-4 shadow-[var(--panel-shadow)] sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-200">
            오늘의 결론
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
              지금 새로 사도 되는지와 시장 밖 위험을 함께 확인하고 있습니다.
            </p>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">종합 점수</p>
              <p className="mt-1 font-mono text-lg font-black text-white">확인 중</p>
            </div>
            <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">새 매수 비중</p>
              <p className="mt-1 text-sm font-black text-white">보류</p>
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
  const warningSignals = data.metrics.earlyWarnings?.signals
    .filter((signal) => signal.status !== 'OK')
    .slice(0, 2) ?? [];
  const updatedAt = data.metrics.updatedAt || data.metrics.meta.asOf;
  const headline = friendlyDecisionHeadline(result.decision, isUnscored);
  const reasonText = friendlyDecisionReason(data.state, macroRegime, isUnscored);
  const dataLabel = isUnscored
    ? '데이터 확인 필요'
    : data.metrics.meta.delay === 'REALTIME'
      ? '실시간'
      : data.metrics.meta.delay === 'UNKNOWN'
        ? '출처 확인 필요'
        : '지연 데이터';
  const issue = conflictWarning
    ?? friendlyIssue(error?.message)
    ?? friendlyIssue(data.metrics.meta?.warnings?.[0]);
  const evidence = (isUnscored ? [...weak, ...pass] : [...weak, ...pass])
    .filter((item, index, items) => items.findIndex((candidate) => candidate.label === item.label) === index)
    .slice(0, 3);
  const changeTrigger = isUnscored
    ? '필수 데이터와 기준 시각이 정상으로 돌아오면 다시 판단합니다.'
    : warningSignals.length > 0
      ? warningSignals.map((signal) => signal.action).join(' · ')
      : data.state === 'GREEN'
        ? '분산일이 늘거나 시장 불안도와 하락 종목이 급증하면 비중을 줄입니다.'
        : '시장 폭이 회복되고 강한 반등과 주도 업종 확산이 확인되면 다시 진입을 검토합니다.';

  return (
    <section
      className={`rounded-xl border p-4 shadow-[var(--panel-shadow)] sm:p-5 ${cfg.shell}`}
      role="status"
      aria-label={`오늘 진입 결정: ${headline}`}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(380px,0.88fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold ${cfg.badge}`}>
              <Icon className="h-3.5 w-3.5" />
              오늘의 결론
            </span>
            <span className="rounded-md border border-slate-700 bg-slate-950/50 px-2 py-1 text-[10px] font-semibold text-slate-300">
              {friendlyMarketLabel(data.market)} · {friendlyMarketStateLabel(data.state)}
            </span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${isUnscored ? 'border-sky-500/35 bg-sky-500/10 text-sky-200' : 'border-emerald-500/25 bg-emerald-500/8 text-emerald-200'}`}>
              {dataLabel}
            </span>
          </div>

          <div>
            <p className="text-[11px] font-bold text-slate-400">오늘 시장에서 할 일</p>
            <p className={`mt-1 text-2xl font-black leading-tight sm:text-3xl ${cfg.text}`}>
              {headline}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              {reasonText}
            </p>
          </div>

          <div className={`mt-4 rounded-xl border px-4 py-3 ${cfg.badge}`}>
            <div className="flex items-start gap-3">
              <Target className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="text-[11px] font-black">지금은 이렇게 하세요</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-white">
                  {decisionAction(result.decision, isUnscored)}
                </p>
              </div>
            </div>
          </div>

          {issue && (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-[11px] font-black text-amber-300">판단을 보수적으로 낮춘 이유</p>
                <p className="mt-1 text-xs leading-5">{issue}</p>
              </div>
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-slate-700/70 bg-slate-950/45 p-4" aria-label="결론을 만든 핵심 근거">
          <div className="flex items-start gap-2">
            <Activity className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            <div>
              <p className="text-sm font-black text-white">왜 이렇게 판단했나요?</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">결론에 가장 큰 영향을 준 신호만 먼저 보여드립니다.</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-slate-500">시장 상태</p>
              <p className="mt-1 text-xs font-black text-white">{friendlyMarketStateLabel(data.state)}</p>
            </div>
            <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-slate-500">시장 점수</p>
              <p className="mt-1 font-mono text-sm font-black text-white">
                {formatScore(data.metrics.p3Score ?? data.metrics.score ?? 0, isUnscored)}
              </p>
            </div>
            <div className="rounded-lg border border-white/8 bg-black/15 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-slate-500">새 매수</p>
              <p className="mt-1 text-xs font-black text-white">
                {exposureLabel(result.sizeMultiplier, isUnscored)}
              </p>
            </div>
          </div>

          <div className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-900/35 px-3">
            {evidence.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-200">{friendlyMetricLabel(item.label)}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{friendlyMetricValue(item)}</p>
                </div>
                <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                  item.status === 'PASS'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : item.status === 'WARNING'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                }`}>
                  {friendlyMetricStatus(item.status)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
            <div className="flex items-center gap-2 text-[11px] font-black text-amber-300">
              <Activity className="h-3.5 w-3.5" />
              언제 다시 판단하나요?
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-300">{changeTrigger}</p>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500">
              <Database className="h-3.5 w-3.5 text-sky-300" />
              {friendlyDataSource(`${data.metrics.meta.provider} · ${data.metrics.meta.source}`)}
            </span>
            <span className="font-mono text-[10px] text-slate-500">
              기준 {updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : '시각 확인 불가'}
            </span>
          </div>
        </aside>
      </div>
    </section>
  );
}
