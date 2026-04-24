'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface HelpButtonProps {
  label: string;
  tooltip: string;
  formula?: string;
  accordion?: React.ReactNode;
}

export default function HelpButton({ label, tooltip, formula, accordion }: HelpButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="relative inline-flex hover:z-50">
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
            <p className="leading-relaxed">{tooltip}</p>
            {formula && (
              <p className="mt-2 rounded border border-sky-900 bg-sky-950/50 p-2 font-mono text-[11px] text-yellow-300">
                {formula}
              </p>
            )}
            {accordion && (
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

      {accordion && expanded && (
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-400 hover:bg-slate-900/50"
          >
            <span>이 지표는 어떻게 계산되나요?</span>
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <div className="border-t border-slate-800 px-3 py-3 text-xs leading-relaxed text-slate-400">
            {accordion}
          </div>
        </div>
      )}
    </>
  );
}
