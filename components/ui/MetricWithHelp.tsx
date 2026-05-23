'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

interface MetricWithHelpProps {
  label: string;
  aliasLabel?: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  statusLabel?: string;
  statusClass?: string;
  barPct?: number;
  barColor?: string;
  tooltipContent: string;
  formula?: string;
  accordionContent?: React.ReactNode;
  children?: React.ReactNode;
}

export default function MetricWithHelp({
  label,
  aliasLabel,
  value,
  unit,
  subtext,
  statusLabel,
  statusClass = 'text-emerald-300',
  barPct,
  barColor = 'bg-emerald-500',
  tooltipContent,
  formula,
  accordionContent,
  children,
}: MetricWithHelpProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative space-y-2 hover:z-50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{aliasLabel ?? label}</span>
            {aliasLabel && (
              <span className="text-[10px] text-slate-600">({label})</span>
            )}
            <div className="relative">
              <button
                type="button"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onFocus={() => setShowTooltip(true)}
                onBlur={() => setShowTooltip(false)}
                className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-900/60 text-sky-300 transition-colors hover:bg-sky-800"
                aria-label={`${label} 설명`}
              >
                <HelpCircle className="h-3 w-3" />
              </button>
              {showTooltip && (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-lg border border-sky-700/50 bg-slate-950 p-3 text-xs text-slate-300 shadow-2xl">
                  <div className="absolute -bottom-1.5 left-2 h-3 w-3 rotate-45 border-b border-r border-sky-700/50 bg-slate-950" />
                  <p className="leading-relaxed">{tooltipContent}</p>
                  {formula && (
                    <p className="mt-2 rounded border border-sky-900 bg-sky-950/50 p-2 font-mono text-[11px] text-yellow-300">
                      {formula}
                    </p>
                  )}
                  {accordionContent && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setExpanded(true); setShowTooltip(false); }}
                      className="mt-2 text-sky-400 underline underline-offset-2"
                    >
                      자세히 보기 →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1">
            <span className="font-mono text-2xl font-black text-white">{value}</span>
            {unit && <span className="text-xs text-slate-500">{unit}</span>}
            {statusLabel && <span className={`text-xs font-bold ${statusClass}`}>{statusLabel}</span>}
          </div>
          {subtext && <p className="mt-0.5 text-[11px] text-slate-500">{subtext}</p>}
          {typeof barPct === 'number' && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(barPct, 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      {children}

      {accordionContent && (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-400 hover:bg-slate-900/50"
          >
            <span>이 지표는 어떻게 계산되나요?</span>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {expanded && (
            <div className="border-t border-slate-800 px-3 py-3 text-xs leading-relaxed text-slate-400">
              {accordionContent}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
