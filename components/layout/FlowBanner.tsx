'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { FLOW_STEPS, getActiveFlowStep, type FlowStepKey } from '@/components/layout/navigation';

interface FlowBannerProps {
  currentKey?: FlowStepKey;
  className?: string;
}

export default function FlowBanner({ currentKey, className = '' }: FlowBannerProps) {
  const pathname = usePathname();
  const activeStep = currentKey
    ? FLOW_STEPS.find((step) => step.key === currentKey) ?? FLOW_STEPS[0]
    : getActiveFlowStep(pathname);
  const activeIndex = FLOW_STEPS.findIndex((step) => step.key === activeStep.key);

  return (
    <div className={`overflow-x-auto rounded-[22px] border border-[var(--border)] bg-[var(--surface-strong)]/85 px-3 py-3 shadow-[var(--panel-shadow)] ${className}`}>
      <div className="flex min-w-max items-center gap-2">
        {FLOW_STEPS.map((step, index) => {
          const isActive = step.key === activeStep.key;
          const isDone = index < activeIndex;

          return (
            <Link
              key={step.key}
              href={step.href}
              className={`flex min-w-[150px] items-center gap-3 rounded-2xl border px-4 py-3 transition-all ${
                isActive
                  ? 'border-emerald-400/40 bg-emerald-500/12 text-[var(--text-primary)] shadow-[0_18px_40px_rgba(16,185,129,0.12)]'
                  : isDone
                    ? 'border-sky-400/20 bg-sky-400/8 text-[var(--text-secondary)]'
                    : 'border-transparent bg-[var(--surface-soft)] text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold ${
                isActive
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                  : isDone
                    ? 'border-sky-400/25 bg-sky-400/10 text-sky-200'
                    : 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-tertiary)]'
              }`}>
                {isDone ? <Check className="h-4 w-4" /> : step.step}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-tertiary)]">
                  Step {step.step}
                </p>
                <p className="truncate text-sm font-semibold">{step.label}</p>
                <p className="truncate text-xs text-[var(--text-secondary)]">{step.sub}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
