'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check } from 'lucide-react';
import { FLOW_STEPS, getActiveFlowStep } from '@/components/layout/navigation';

export default function LifecycleStepper() {
  const pathname = usePathname();
  const activeStep = getActiveFlowStep(pathname);
  const activeIndex = FLOW_STEPS.findIndex((s) => s.key === activeStep.key);

  return (
    <div className="mb-5 overflow-x-auto">
      <div className="flex min-w-max items-stretch">
        {FLOW_STEPS.map((step, idx) => {
          const isDone = idx < activeIndex;
          const isNow = idx === activeIndex;

          return (
            <Link
              key={step.key}
              href={step.href}
              className={`group relative flex flex-1 min-w-[80px] flex-col items-center gap-1 border-b-2 px-3 pb-2 pt-2 text-center text-[10px] transition-colors ${
                isNow
                  ? 'border-b-emerald-400 text-emerald-300'
                  : isDone
                    ? 'border-b-emerald-700 text-emerald-600 hover:border-b-emerald-500 hover:text-emerald-400'
                    : 'border-b-slate-800 text-slate-600 hover:border-b-slate-600 hover:text-slate-400'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold transition-colors ${
                  isNow
                    ? 'bg-emerald-500 text-slate-950'
                    : isDone
                      ? 'bg-emerald-800 text-emerald-300'
                      : 'bg-slate-800 text-slate-500'
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : step.step}
              </span>
              <span className={`font-semibold leading-tight ${isNow ? 'text-emerald-300' : ''}`}>
                {step.label}
              </span>
              <span className="hidden text-[9px] leading-tight text-slate-600 sm:block">{step.sub}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
