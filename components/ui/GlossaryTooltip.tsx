'use client';

import React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { HelpCircle } from 'lucide-react';
import { GLOSSARY } from '@/constants/glossary';

interface GlossaryTooltipProps {
  termKey: string;
  children?: React.ReactNode;
}

export default function GlossaryTooltip({ termKey, children }: GlossaryTooltipProps) {
  const item = GLOSSARY[termKey];
  if (!item) return <>{children}</>;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help group">
            {children || <span className="text-slate-300 font-bold">{item.nickname}</span>}
            <HelpCircle className="h-3 w-3 text-slate-500 group-hover:text-rose-400 transition-colors" />
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-[100] max-w-[280px] rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95"
            sideOffset={5}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-black text-rose-400 uppercase tracking-widest">{item.nickname}</p>
                <p className="text-[9px] font-mono text-slate-500">{item.term}</p>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {item.definition}
              </p>
              {item.guide && (
                <div className="rounded-lg bg-rose-500/10 p-2 border border-rose-500/20">
                  <p className="text-[10px] text-rose-200 font-medium">💡 {item.guide}</p>
                </div>
              )}
            </div>
            <Tooltip.Arrow className="fill-slate-700" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
