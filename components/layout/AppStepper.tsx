'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { getActiveFlowStep, isActiveTab } from '@/components/layout/navigation';

export default function AppStepper() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeStep = getActiveFlowStep(pathname);
  const currentSearch = searchParams.toString();

  if (activeStep.tabs.length === 0) return null;

  return (
    <div
      data-testid={activeStep.key === 'scanner' ? 'scanner-workspace-nav' : 'secondary-menu-nav'}
      className="border-b border-[var(--border)] bg-[var(--surface-strong)]/85"
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <div className="hidden shrink-0 items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100 md:flex">
          <span className="flex h-5 w-5 items-center justify-center rounded-md border border-emerald-400/40 text-[10px]">
            {activeStep.step}
          </span>
          {activeStep.label}
        </div>

        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {activeStep.tabs.map((tab) => {
            const active = isActiveTab(pathname, tab.href, currentSearch);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-sky-400/35 bg-sky-400/12 text-sky-100'
                    : 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
