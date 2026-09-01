'use client';

import { TrendingUp, Repeat, BarChart3, Globe, Coins, Zap, AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

export type ShellTone = 'buy' | 'sell' | 'hold' | 'watch';

export interface ShellSignalItem { ticker: string; name?: string | null }
export interface ShellSignalCard {
  tone: ShellTone;
  title: string;
  hint?: string;
  items: ShellSignalItem[];
  emptyText: string;
}
export interface ShellRankRow {
  rank?: number;
  ticker: string;
  name?: string | null;
  rs: number | null;
  isNewHigh?: boolean;
  extra?: string | null;
}
export interface StrategyShellProps {
  title: string;
  source: string;
  modelVersion: string;
  statusBadge?: string;
  asOf: string | null;
  description: string;
  loading?: boolean;
  error?: string | null;
  signals?: ShellSignalCard[];
  cashUsed?: number;
  cashTotal?: number;
  cashInterpretation?: string;
  ranks?: ShellRankRow[];
  rankHeader?: string;
  rankMarkerHeader?: string;
  hideRankMarker?: boolean;
  extraSection?: ReactNode;
  footerNote?: string;
}

const STRATEGY_ICON_MAP: Record<string, React.ElementType> = {
  trend: TrendingUp,
  repeat: Repeat,
  chart: BarChart3,
  globe: Globe,
  coins: Coins,
  zap: Zap,
};

export function StrategyIcon({ iconKey, className = 'h-4 w-4' }: { iconKey: string; className?: string }) {
  const Icon = STRATEGY_ICON_MAP[iconKey] ?? TrendingUp;
  return <Icon className={className} />;
}

const TONE_STYLES: Record<ShellTone, { border: string; text: string; badge: string; dot: string }> = {
  buy: { border: 'border-emerald-400/25', text: 'text-emerald-300', badge: 'bg-emerald-500/12 border-emerald-400/30', dot: 'bg-emerald-400' },
  sell: { border: 'border-rose-400/25', text: 'text-rose-300', badge: 'bg-rose-500/12 border-rose-400/30', dot: 'bg-rose-400' },
  hold: { border: 'border-sky-400/25', text: 'text-sky-300', badge: 'bg-sky-500/12 border-sky-400/30', dot: 'bg-sky-400' },
  watch: { border: 'border-amber-400/25', text: 'text-amber-300', badge: 'bg-amber-500/12 border-amber-400/30', dot: 'bg-amber-400' },
};

export function displayName(item: ShellSignalItem) {
  return item.name && item.name !== item.ticker ? `${item.name}(${item.ticker})` : item.ticker;
}

function formatRs(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'n/a';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%p`;
}

export default function StrategyShell({
  title,
  source,
  modelVersion,
  statusBadge = 'RESEARCH_ONLY',
  asOf,
  description,
  loading = false,
  error = null,
  signals = [],
  cashUsed,
  cashTotal,
  cashInterpretation,
  ranks = [],
  rankHeader,
  rankMarkerHeader = '52주 신고가',
  hideRankMarker = false,
  extraSection,
  footerNote,
}: StrategyShellProps) {
  const cashRatio = cashUsed !== undefined && cashTotal ? Math.min(1, Math.max(0, cashUsed / cashTotal)) : null;
  const hasCash = cashRatio !== null && cashTotal !== undefined;

  return (
    <div className="min-w-0 max-w-full space-y-4 pb-12">
      <header className="border-b border-[var(--border)] pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-300">
            투자 전략
          </span>
          <span className="rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
            {statusBadge}
          </span>
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{modelVersion}</span>
        </div>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight text-[var(--text-primary)]">{title}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-6 text-[var(--text-secondary)]">{description}</p>
        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
          원전: {source}
          {asOf ? ` · 신호 기준 ${asOf}` : ''}
        </p>
      </header>

      {loading && (
        <div className="flex h-32 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)]">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
          <p className="text-sm text-rose-200">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {signals.length > 0 && (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {signals.map((signal) => {
                const style = TONE_STYLES[signal.tone];
                return (
                  <div key={signal.tone} className={`rounded-2xl border ${style.border} bg-[var(--surface-strong)] p-4`}>
                    <div className="flex items-center justify-between">
                      <p className={`text-xs font-bold ${style.text}`}>{signal.title}</p>
                      <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${style.badge} ${style.text}`}>
                        {signal.items.length}
                      </span>
                    </div>
                    {signal.hint && <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">{signal.hint}</p>}
                    <ul className="mt-3 space-y-1.5">
                      {signal.items.length === 0 && (
                        <li className="text-[11px] text-[var(--text-tertiary)]">{signal.emptyText}</li>
                      )}
                      {signal.items.map((item) => (
                        <li key={item.ticker} className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--text-primary)]">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                          {displayName(item)}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>
          )}

          {hasCash && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-[var(--text-primary)]">현금 탐지기</p>
                <p className="font-mono text-xs font-semibold text-[var(--text-secondary)]">
                  보유 {cashUsed}/{cashTotal} · 현금 {((1 - (cashRatio ?? 0)) * 100).toFixed(0)}%
                </p>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[var(--surface-soft)]" role="img" aria-label={`현금 비중 ${((1 - (cashRatio ?? 0)) * 100).toFixed(0)}%`}>
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-400" style={{ width: `${(cashRatio ?? 0) * 100}%` }} />
              </div>
              {cashInterpretation && <p className="mt-2 text-[11px] leading-5 text-[var(--text-secondary)]">{cashInterpretation}</p>}
            </section>
          )}

          {extraSection}

          {ranks.length > 0 && (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
              <p className="text-xs font-bold text-[var(--text-primary)]">{rankHeader || 'RS 랭킹'}</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                      <th className="py-1.5 pr-3 font-semibold">순위</th>
                      <th className="py-1.5 pr-3 font-semibold">종목</th>
                      <th className="py-1.5 pr-3 text-right font-semibold">RS</th>
                      {!hideRankMarker && <th className="py-1.5 pr-3 text-center font-semibold">{rankMarkerHeader}</th>}
                      {ranks.some((row) => row.extra) && <th className="py-1.5 text-right font-semibold">비고</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {ranks.map((row, index) => (
                      <tr key={row.ticker} className="border-b border-[var(--border)]/50 last:border-0">
                        <td className="py-2 pr-3 font-mono text-[var(--text-secondary)]">{row.rank ?? index + 1}</td>
                        <td className="py-2 pr-3 font-medium text-[var(--text-primary)]">{displayName(row)}</td>
                        <td className={`py-2 pr-3 text-right font-mono font-semibold ${(row.rs ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                          {formatRs(row.rs)}
                        </td>
                        {!hideRankMarker && (
                          <td className="py-2 pr-3 text-center">
                            {row.isNewHigh ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">
                                <span className="h-1 w-1 rounded-full bg-emerald-400" />돌파
                              </span>
                            ) : (
                              <span className="text-[10px] text-[var(--text-tertiary)]">—</span>
                            )}
                          </td>
                        )}
                        {ranks.some((item) => item.extra) && (
                          <td className="py-2 text-right text-[11px] text-[var(--text-secondary)]">{row.extra || '—'}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {footerNote && <p className="text-[11px] leading-5 text-[var(--text-tertiary)]">{footerNote}</p>}
        </>
      )}
    </div>
  );
}
