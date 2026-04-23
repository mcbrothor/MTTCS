'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity } from 'lucide-react';
import MarketStrip from '@/components/layout/MarketStrip';
import { FLOW_STEPS, UTILITY_LINKS, getActiveFlowStep, isActiveTab } from '@/components/layout/navigation';

export default function Navbar() {
  const pathname = usePathname();
  const activeStep = getActiveFlowStep(pathname);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[rgba(4,8,16,0.82)] shadow-[0_20px_60px_rgba(2,6,23,0.45)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="group flex shrink-0 items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/8 px-4 py-2 transition-colors hover:border-emerald-400/35">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/12">
                <Activity className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-lg font-bold tracking-tight text-emerald-300">MTN</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                    Live
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">Mantori&apos;s Trading Navigator</p>
              </div>
            </Link>
          </div>

          <div className="flex min-w-0 flex-1 items-center xl:justify-end">
            <MarketStrip />
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {FLOW_STEPS.map((step) => {
              const isActive = step.key === activeStep.key;

              return (
                <Link
                  key={step.key}
                  href={step.href}
                  className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                    isActive
                      ? 'border-emerald-400/30 bg-emerald-500/12 text-[var(--text-primary)]'
                      : 'border-transparent bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {step.label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeStep.tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActiveTab(pathname, tab.href)
                    ? 'border-sky-400/35 bg-sky-400/12 text-sky-100'
                    : 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab.label}
              </Link>
            ))}

            {UTILITY_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                {item.label}
              </Link>
            ))}

            <form action="/api/auth/logout" method="post" className="shrink-0">
              <button
                type="submit"
                className="rounded-full border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
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
