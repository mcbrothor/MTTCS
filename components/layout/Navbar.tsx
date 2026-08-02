'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity } from 'lucide-react';
import MarketStrip from '@/components/layout/MarketStrip';
import {
  FLOW_STEPS,
  STRATEGY_LINKS,
  UTILITY_LINKS,
  findActiveFlowStep,
  findActiveStrategyLink,
} from '@/components/layout/navigation';
import GlobalSecuritySearch from '@/components/layout/GlobalSecuritySearch';

export default function Navbar() {
  const pathname = usePathname();
  const activeStep = findActiveFlowStep(pathname);
  const activeStrategyLink = findActiveStrategyLink(pathname);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[rgba(4,8,16,0.94)] backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="group flex shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 transition-colors hover:border-emerald-400/35">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-400/25 bg-emerald-500/10">
                <Activity className="h-4 w-4 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-emerald-300">MTN</span>
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)]">Mantori&apos;s Trading Navigator</p>
              </div>
            </Link>
            <GlobalSecuritySearch />
          </div>

          <div className="flex min-w-0 flex-1 items-center xl:justify-end">
            <MarketStrip />
          </div>
        </div>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="no-scrollbar flex min-w-0 gap-2 overflow-x-auto pb-1">
            {FLOW_STEPS.map((step) => {
              const isActive = step.key === activeStep?.key;

              return (
                <Link
                  key={step.key}
                  href={step.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'border-emerald-400/35 bg-emerald-500/12 text-[var(--text-primary)]'
                      : 'border-transparent bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {step.label}
                </Link>
              );
            })}
            <span aria-hidden="true" className="my-1 w-px shrink-0 bg-[var(--border)]" />
            {STRATEGY_LINKS.map((item) => {
              const isActive = item.href === activeStrategyLink?.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all ${
                    isActive
                      ? 'border-amber-400/40 bg-amber-500/12 text-amber-100'
                      : 'border-amber-400/15 bg-amber-500/5 text-amber-200/80 hover:border-amber-400/35 hover:text-amber-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {UTILITY_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                {item.label}
              </Link>
            ))}

            <form action="/api/auth/logout" method="post" className="shrink-0">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  );
}
