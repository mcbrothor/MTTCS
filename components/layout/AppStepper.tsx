'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check } from 'lucide-react';
import { FLOW_STEPS, getActiveFlowStep } from '@/components/layout/navigation';

export default function AppStepper() {
  const pathname = usePathname();
  const activeStep = getActiveFlowStep(pathname);
  const activeIndex = FLOW_STEPS.findIndex((step) => step.key === activeStep.key);

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-strong)]/85">
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {FLOW_STEPS.map((step, index) => {
          const isActive = step.key === activeStep.key;
          const isDone = index < activeIndex;

          return (
            <Link
              key={step.key}
              href={step.href}
              className={`flex min-w-[112px] items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                isActive
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-[var(--text-primary)]'
                  : isDone
                    ? 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]'
                    : 'border-transparent text-[var(--text-tertiary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ${
                  isDone
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                    : isActive
                      ? 'border-emerald-400/50 text-emerald-200'
                      : 'border-[var(--border)] text-[var(--text-tertiary)]'
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : step.step}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{step.label}</span>
                <span className="block truncate text-[10px] text-[var(--text-tertiary)]">{step.sub}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
