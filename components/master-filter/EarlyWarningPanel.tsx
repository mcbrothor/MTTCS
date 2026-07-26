'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import { Activity, AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';
import { friendlyDataSource, friendlyEarlyWarningStatus } from '@/lib/market-display';
import type { EarlyWarningSeverity, EarlyWarningSignal } from '@/types';

const SEVERITY_ICON: Record<EarlyWarningSeverity, typeof CheckCircle2> = {
  OK: CheckCircle2,
  WATCH: AlertTriangle,
  REDUCE: ShieldAlert,
  HALT: ShieldAlert,
};

function severityClass(status: EarlyWarningSeverity) {
  if (status === 'OK') return 'border-emerald-500/35 bg-emerald-500/8 text-emerald-200';
  if (status === 'WATCH') return 'border-amber-500/35 bg-amber-500/8 text-amber-200';
  if (status === 'REDUCE') return 'border-orange-500/35 bg-orange-500/8 text-orange-200';
  return 'border-rose-500/40 bg-rose-500/10 text-rose-200';
}

function SeverityStatusIcon({ status, className }: { status: EarlyWarningSeverity; className: string }) {
  const Icon = SEVERITY_ICON[status];
  return <Icon className={className} />;
}

function SignalStatusTooltip({ signal }: { signal: EarlyWarningSignal }) {
  const statusLabel = friendlyEarlyWarningStatus(signal.status);
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={`${signal.title} 판정 근거: ${statusLabel}`}
          className={`inline-flex cursor-help items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 ${severityClass(signal.status)}`}
        >
          <SeverityStatusIcon status={signal.status} className="h-3.5 w-3.5" />
          {statusLabel}
          <Info className="h-3 w-3 opacity-70" aria-hidden="true" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={7}
          collisionPadding={12}
          className="z-[100] w-[min(360px,calc(100vw-24px))] rounded-xl border border-slate-700 bg-slate-950/98 p-4 text-left shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95"
        >
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-300">판정 근거</p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-200">
            {signal.reason || `관측값과 판정 기준을 비교해 ${statusLabel} 상태로 판단했습니다.`}
          </p>
          <dl className="mt-3 space-y-2 border-t border-slate-800 pt-3 text-[10px] leading-4">
            <div className="grid grid-cols-[54px_1fr] gap-2">
              <dt className="text-slate-500">관측값</dt>
              <dd className="font-mono text-slate-300">{signal.value}</dd>
            </div>
            <div className="grid grid-cols-[54px_1fr] gap-2">
              <dt className="text-slate-500">판정 기준</dt>
              <dd className="text-amber-200">{signal.threshold}</dd>
            </div>
            <div className="grid grid-cols-[54px_1fr] gap-2">
              <dt className="text-slate-500">데이터</dt>
              <dd className="text-slate-400">{friendlyDataSource(signal.source)}</dd>
            </div>
          </dl>
          <Tooltip.Arrow className="fill-slate-700" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export default function EarlyWarningPanel() {
  const { data, isLoading } = useMarket();
  const earlyWarnings = data?.metrics.earlyWarnings;

  if (isLoading || !data) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="h-24 animate-pulse rounded-md bg-slate-800/40" />
      </section>
    );
  }

  if (!earlyWarnings) {
    return (
      <section className="rounded-lg border border-sky-500/25 bg-slate-950/55 p-4">
        <p className="text-[10px] font-bold tracking-widest text-sky-300">2. 위험 조기경보</p>
        <h2 className="mt-1 text-lg font-black text-white">데이터 확인 필요</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          조기경보 입력 데이터가 아직 준비되지 않았습니다. 기준 시각과 데이터 출처를 먼저 확인하세요.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 shadow-[var(--panel-shadow)]" aria-labelledby="early-warning-title">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-widest text-amber-300">2. 위험 조기경보</p>
          <h2 id="early-warning-title" className="mt-1 text-xl font-black text-white">위험이 커지는지 먼저 확인</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{earlyWarnings.summary}</p>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
            <Info className="h-3 w-3" aria-hidden="true" />
            상태 배지에 마우스를 올리거나 포커스하면 판정 근거를 볼 수 있습니다.
          </p>
        </div>
        <div className={`shrink-0 rounded-lg border px-3 py-2 ${severityClass(earlyWarnings.status)}`}>
          <div className="flex items-center gap-2">
            <SeverityStatusIcon status={earlyWarnings.status} className="h-4 w-4" />
            <span className="text-sm font-black">{friendlyEarlyWarningStatus(earlyWarnings.status)}</span>
          </div>
          <p className="mt-1 text-xs leading-5 opacity-90">{earlyWarnings.action}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-lg border border-slate-800 bg-slate-900/35 p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-sky-300" />
            <p className="text-sm font-bold text-slate-200">돈의 이동 방향</p>
          </div>
          <p className="mt-2 text-lg font-black text-white">{earlyWarnings.rotation.label}</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{earlyWarnings.rotation.detail}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {earlyWarnings.rotation.receivers.map((symbol) => (
              <span key={`receiver-${symbol}`} className="rounded-md border border-emerald-500/25 bg-emerald-500/8 px-2 py-1 font-mono text-[10px] text-emerald-200">
                {symbol}
              </span>
            ))}
            {earlyWarnings.rotation.defensives.map((symbol) => (
              <span key={`defensive-${symbol}`} className="rounded-md border border-sky-500/25 bg-sky-500/8 px-2 py-1 font-mono text-[10px] text-sky-200">
                {symbol}
              </span>
            ))}
            {earlyWarnings.rotation.receivers.length === 0 && earlyWarnings.rotation.defensives.length === 0 && (
              <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-400">
                뚜렷한 이동 없음
              </span>
            )}
          </div>
        </div>

        <Tooltip.Provider delayDuration={150} skipDelayDuration={300}>
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <div className="hidden grid-cols-[1.05fr_1.35fr_0.62fr_1fr] gap-3 bg-slate-900/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 md:grid">
              <span>무엇을 보는가</span>
              <span>왜 중요한가</span>
              <span>현재 상태</span>
              <span>해야 할 행동</span>
            </div>
            <div className="divide-y divide-slate-800/80">
              {earlyWarnings.signals.map((signal) => {
                return (
                  <div key={signal.id} className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1.05fr_1.35fr_0.62fr_1fr] md:gap-3">
                    <div>
                      <p className="font-bold text-slate-100">{signal.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{signal.what}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-600">{signal.value}</p>
                    </div>
                    <p className="text-xs leading-5 text-slate-400">{signal.why}</p>
                    <div>
                      <SignalStatusTooltip signal={signal} />
                      <p className="mt-1 text-[10px] leading-4 text-slate-500">기준: {signal.threshold}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold leading-5 text-slate-200">{signal.action}</p>
                      {signal.detail && <p className="mt-1 text-[10px] leading-4 text-slate-500">{signal.detail}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Tooltip.Provider>
      </div>
    </section>
  );
}
