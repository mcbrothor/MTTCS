'use client';

import { ExternalLink } from 'lucide-react';
import type { RiskBarometerIndicator } from '@/types';

const STATUS_STYLE = {
  SAFE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  TRIGGERED: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  UNKNOWN: 'border-slate-600 bg-slate-800/70 text-slate-400',
} as const;

const STATUS_LABEL = {
  SAFE: '정상',
  TRIGGERED: '위험',
  UNKNOWN: '미확인',
} as const;

const METHOD_STYLE = {
  DIRECT: 'text-sky-300 border-sky-500/30',
  PROXY: 'text-violet-300 border-violet-500/30',
  MANUAL: 'text-amber-300 border-amber-500/30',
} as const;

function observedLabel(value: string | null, stale: boolean) {
  if (!value) return '관측 없음';
  const label = new Date(value).toLocaleDateString('ko-KR');
  return stale ? `${label} · stale` : label;
}

function StatusBadge({ indicator }: { indicator: RiskBarometerIndicator }) {
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[indicator.status]}`}>
      {STATUS_LABEL[indicator.status]}
    </span>
  );
}

function MethodBadge({ indicator }: { indicator: RiskBarometerIndicator }) {
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-bold ${METHOD_STYLE[indicator.method]}`}>
      {indicator.method}
    </span>
  );
}

export default function RiskIndicatorTable({ indicators }: { indicators: RiskBarometerIndicator[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] shadow-[var(--panel-shadow)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">EVIDENCE TABLE</p>
        <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">10개 위험 근거</h2>
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[920px] border-collapse text-left">
          <thead className="bg-slate-950/45 text-[10px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3"># / 지표</th>
              <th className="px-4 py-3">현재값</th>
              <th className="px-4 py-3">위험 기준</th>
              <th className="px-4 py-3">판정</th>
              <th className="px-4 py-3">방식·출처</th>
              <th className="px-4 py-3">관측일</th>
            </tr>
          </thead>
          <tbody>
            {indicators.map((indicator, index) => (
              <tr key={indicator.key} className="border-t border-[var(--border)] align-top text-xs">
                <td className="px-4 py-3">
                  <p className="font-semibold text-[var(--text-primary)]">{index + 1}. {indicator.label}</p>
                  {indicator.detail && <p className="mt-1 max-w-[260px] leading-5 text-slate-500">{indicator.detail}</p>}
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-[var(--text-primary)]">{indicator.displayValue}</td>
                <td className="max-w-[250px] px-4 py-3 leading-5 text-[var(--text-secondary)]">{indicator.threshold}</td>
                <td className="px-4 py-3"><StatusBadge indicator={indicator} /></td>
                <td className="px-4 py-3">
                  <MethodBadge indicator={indicator} />
                  <a href={indicator.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-[10px] text-sky-300 hover:text-sky-200">
                    {indicator.provider} <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
                <td className={`px-4 py-3 text-[10px] ${indicator.freshness.stale ? 'text-amber-300' : 'text-slate-400'}`}>
                  {observedLabel(indicator.observedAt, indicator.freshness.stale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--border)] md:hidden">
        {indicators.map((indicator, index) => (
          <article key={indicator.key} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">{index + 1}. {indicator.label}</p>
                <p className="mt-1 font-mono text-lg font-black text-[var(--text-primary)]">{indicator.displayValue}</p>
              </div>
              <StatusBadge indicator={indicator} />
            </div>
            <div className="rounded-lg bg-slate-950/35 p-3 text-xs leading-5 text-[var(--text-secondary)]">
              <span className="font-semibold text-slate-300">위험 기준:</span> {indicator.threshold}
            </div>
            {indicator.detail && <p className="text-xs leading-5 text-slate-500">{indicator.detail}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MethodBadge indicator={indicator} />
                <a href={indicator.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-sky-300">
                  출처 <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <span className={`text-[10px] ${indicator.freshness.stale ? 'text-amber-300' : 'text-slate-500'}`}>
                {observedLabel(indicator.observedAt, indicator.freshness.stale)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
