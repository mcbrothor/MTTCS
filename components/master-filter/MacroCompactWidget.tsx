'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';
import type { MacroRegime } from '@/lib/macro/compute';

const REGIME_CONFIG: Record<MacroRegime, { label: string; color: string; border: string; bg: string }> = {
  RISK_ON: {
    label: 'RISK-ON',
    color: 'text-emerald-400',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
  },
  NEUTRAL: {
    label: 'NEUTRAL',
    color: 'text-amber-400',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/10',
  },
  RISK_OFF: {
    label: 'RISK-OFF',
    color: 'text-rose-400',
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/10',
  },
};

export default function MacroCompactWidget() {
  const { macroRegime, macroScore, macroBreakdown, isLoading } = useMarket();

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 h-[120px]" />
    );
  }

  const cfg = macroRegime ? REGIME_CONFIG[macroRegime] : null;

  return (
    <Link
      href="/macro"
      className="block rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4 transition-colors hover:bg-[var(--surface-strong)]"
      aria-label="매크로 상세 분석으로 이동"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">매크로 레짐</p>
          {cfg ? (
            <span
              className={`inline-block rounded border px-2 py-0.5 text-xs font-bold ${cfg.color} ${cfg.border} ${cfg.bg}`}
            >
              {cfg.label}
            </span>
          ) : (
            <span className="text-xs text-slate-500">--</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {macroScore !== null && (
            <span className="text-lg font-black text-slate-300 font-mono">{macroScore}</span>
          )}
          <ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
        </div>
      </div>

      {/* 컴포넌트 미니 바 */}
      {macroBreakdown.length > 0 && (
        <div className="space-y-1.5">
          {macroBreakdown.map((item) => {
            const pct = item.weight > 0 ? Math.round((item.score / item.weight) * 100) : 0;
            return (
              <div key={item.label} className="flex items-center gap-2">
                <span className="w-[60px] shrink-0 text-[9px] text-slate-500 truncate">{item.label}</span>
                <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-[26px] shrink-0 text-right text-[9px] font-mono text-slate-500">
                  {item.score}/{item.weight}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Link>
  );
}
