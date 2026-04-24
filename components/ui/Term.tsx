'use client';

import { useState } from 'react';
import { getGlossaryEntry } from '@/lib/glossary';

interface TermProps {
  code: string;
  showAlias?: boolean;
}

export default function Term({ code, showAlias = true }: TermProps) {
  const [show, setShow] = useState(false);
  const entry = getGlossaryEntry(code);

  if (!entry) return <span>{code}</span>;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        className="cursor-help border-b border-dotted border-sky-600 text-inherit transition-colors hover:border-sky-400 hover:text-sky-300"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
      >
        {showAlias ? `${entry.icon} ${entry.alias}` : entry.term}
        {showAlias && <span className="ml-1 text-[10px] text-slate-500">({entry.term})</span>}
      </button>
      {show && (
        <span className="absolute bottom-full left-0 z-50 mb-2 block w-72 rounded-lg border border-sky-700/50 bg-slate-950 p-3 text-left text-xs text-slate-300 shadow-2xl">
          <span className="absolute -bottom-1.5 left-3 block h-3 w-3 rotate-45 border-b border-r border-sky-700/50 bg-slate-950" />
          <span className="mb-1 block font-bold text-sky-300">{entry.icon} {entry.alias}</span>
          <span className="block leading-relaxed">{entry.oneLiner}</span>
          {entry.formula && (
            <span className="mt-1.5 block rounded border border-sky-900 bg-sky-950/50 p-1.5 font-mono text-[11px] text-yellow-300">
              {entry.formula}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
