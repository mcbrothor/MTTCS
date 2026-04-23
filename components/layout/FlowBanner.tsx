'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
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
  const MotionDiv = motion.div as any;

  return (
    <div className={`overflow-x-auto rounded-[22px] border border-[var(--border)] bg-[var(--surface-strong)]/40 px-3 py-3 shadow-[var(--panel-shadow)] backdrop-blur-xl ${className}`}>
      <div className="flex min-w-max items-center gap-2">
        {FLOW_STEPS.map((step, index) => {
          const isActive = step.key === activeStep.key;
          const isDone = index < activeIndex;

          return (
            <Link
              key={step.key}
              href={step.href}
              className="relative flex min-w-[160px] flex-1 items-center gap-3 rounded-2xl px-4 py-3 transition-all"
            >
              {isActive && (
                <MotionDiv
                  layoutId="activeFlowStep"
                  className="absolute inset-0 rounded-2xl border border-emerald-400/40 bg-emerald-500/12 shadow-[0_18px_40px_rgba(16,185,129,0.12)]"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              
              <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold transition-colors duration-300 ${
                isActive
                  ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                  : isDone
                    ? 'border-sky-400/25 bg-sky-400/10 text-sky-200'
                    : 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-tertiary)]'
              }`}>
                {isDone ? <Check className="h-4 w-4" /> : step.step}
              </div>
              
              <div className="relative z-10 min-w-0">
                <p className={`text-[9px] font-black uppercase tracking-[0.25em] transition-colors duration-300 ${
                  isActive ? 'text-emerald-400/80' : 'text-[var(--text-tertiary)]'
                }`}>
                  STEP {step.step}
                </p>
                <p className={`truncate text-sm font-bold transition-colors duration-300 ${
                  isActive ? 'text-[var(--text-primary)]' : isDone ? 'text-[var(--text-secondary)]' : 'text-[var(--text-tertiary)]'
                }`}>
                  {step.label}
                </p>
                <p className={`truncate text-[11px] transition-colors duration-300 ${
                  isActive ? 'text-emerald-200/60' : 'text-[var(--text-tertiary)]/70'
                }`}>
                  {step.sub}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

