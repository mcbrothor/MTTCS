'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import { HelpCircle } from 'lucide-react';

export interface StrategyColumnHelp {
  description: string;
  formula?: string;
}

interface StrategyColumnHeaderProps {
  label: string;
  help?: StrategyColumnHelp;
  align?: 'start' | 'center' | 'end';
}

export default function StrategyColumnHeader({ label, help, align = 'center' }: StrategyColumnHeaderProps) {
  if (!help) return <span>{label}</span>;

  return (
    <Tooltip.Provider delayDuration={180} skipDelayDuration={80}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={`${label} 산출 기준`}
            className="inline-flex cursor-help items-center gap-1 rounded-sm text-inherit outline-none transition-colors hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-strong)]"
          >
            <span>{label}</span>
            <HelpCircle aria-hidden="true" className="h-3 w-3 shrink-0 opacity-70" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align={align}
            sideOffset={8}
            collisionPadding={12}
            className="z-[100] max-w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-slate-600/80 bg-slate-950 px-3 py-2 text-left normal-case tracking-normal text-slate-200 shadow-2xl"
          >
            <p className="text-[11px] font-medium leading-5">{help.description}</p>
            {help.formula && (
              <p className="mt-1.5 border-t border-slate-700/80 pt-1.5 font-mono text-[10px] font-normal leading-4 text-amber-200">
                산식: {help.formula}
              </p>
            )}
            <Tooltip.Arrow className="fill-slate-600" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
