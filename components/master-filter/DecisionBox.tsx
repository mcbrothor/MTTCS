'use client';

import { useMarket } from '@/contexts/MarketContext';
import { computeDecision } from '@/lib/decision/rule';

const DECISION_CONFIG = {
  GO_FULL: {
    bg: 'bg-emerald-500/15',
    border: 'border-emerald-500/40',
    headlineColor: 'text-emerald-400',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dot: 'bg-emerald-400',
  },
  GO_75: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    headlineColor: 'text-emerald-400',
    badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  GO_50: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    headlineColor: 'text-amber-400',
    badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  NO_GO_HOLD: {
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/30',
    headlineColor: 'text-slate-400',
    badgeColor: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    dot: 'bg-slate-400',
  },
  NO_GO: {
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    headlineColor: 'text-rose-400',
    badgeColor: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    dot: 'bg-rose-400',
  },
} as const;

export default function DecisionBox() {
  const { data, macroRegime, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <div className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4 h-[88px]" />
    );
  }

  const result = computeDecision(data.state, macroRegime, {
    distributionDays: typeof data.metrics.distribution?.value === 'number'
      ? data.metrics.distribution.value
      : undefined,
    vix: typeof data.metrics.volatility?.value === 'number'
      ? data.metrics.volatility.value
      : undefined,
  });

  const cfg = DECISION_CONFIG[result.decision];

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-xl border px-5 py-4 ${cfg.bg} ${cfg.border}`}
      role="status"
      aria-label={`오늘 진입 결정: ${result.headline}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={`h-3 w-3 rounded-full shrink-0 ${cfg.dot}`} aria-hidden="true" />
        <div className="min-w-0">
          <p className={`text-lg font-black tracking-tight leading-none ${cfg.headlineColor}`}>
            {result.headline}
          </p>
          <p className="mt-1 text-[11px] text-slate-400 leading-snug truncate">
            {result.reason}
          </p>
        </div>
      </div>

      <div className="shrink-0 flex flex-col items-end gap-1.5">
        <span
          className={`inline-block rounded-md border px-2.5 py-1 text-[11px] font-semibold ${cfg.badgeColor}`}
        >
          {result.actionLabel}
        </span>
        {result.blockingFactors.length > 0 && (
          <p className="text-[10px] text-slate-500 text-right max-w-[200px] leading-snug">
            {result.blockingFactors[0]}
          </p>
        )}
      </div>
    </div>
  );
}
