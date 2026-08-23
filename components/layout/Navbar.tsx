'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Activity, ChevronDown, Star } from 'lucide-react';
import MarketStrip from '@/components/layout/MarketStrip';
import {
  FLOW_STEPS,
  STRATEGY_LINKS,
  UTILITY_LINKS,
  findActiveFlowStep,
  findActiveStrategyLink,
  groupStrategyLinks,
} from '@/components/layout/navigation';
import { StrategyIcon } from '@/components/strategy/StrategyShell';
import GlobalSecuritySearch from '@/components/layout/GlobalSecuritySearch';

export default function Navbar() {
  const pathname = usePathname();
  const activeStep = findActiveFlowStep(pathname);
  const activeStrategyLink = findActiveStrategyLink(pathname);
  const strategyGroups = groupStrategyLinks();
  const [strategyMenuOpen, setStrategyMenuOpen] = useState(false);
  const strategyMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!strategyMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (strategyMenuRef.current && !strategyMenuRef.current.contains(event.target as Node)) {
        setStrategyMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStrategyMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [strategyMenuOpen]);

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
            <div ref={strategyMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setStrategyMenuOpen((open) => !open)}
                aria-expanded={strategyMenuOpen}
                aria-haspopup="menu"
                className={`flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeStrategyLink
                    ? 'border-amber-400/40 bg-amber-500/12 text-amber-100'
                    : 'border-amber-400/15 bg-amber-500/5 text-amber-200/80 hover:border-amber-400/35 hover:text-amber-100'
                }`}
              >
                <Star className="h-3.5 w-3.5" />
                투자 전략
                {activeStrategyLink && (
                  <span className="max-w-[110px] truncate text-amber-300">· {activeStrategyLink.label}</span>
                )}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${strategyMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {strategyMenuOpen && (
                <div role="menu" className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-[var(--border-strong)] bg-[rgba(8,14,26,0.98)] p-2 shadow-2xl backdrop-blur">
                  {strategyGroups.map((group) => (
                    <div key={group.group} className={group.group !== 'KR' ? 'mt-2 border-t border-[var(--border)] pt-2' : ''}>
                      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                        {group.label}
                      </p>
                      {group.items.map((item) => {
                        const isActive = item.href === activeStrategyLink?.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            role="menuitem"
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => setStrategyMenuOpen(false)}
                            className={`flex items-center gap-2.5 rounded-lg px-2 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-300 ${
                              isActive
                                ? 'bg-amber-500/12 text-amber-200'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]'
                            }`}
                          >
                            <StrategyIcon iconKey={item.icon} className="h-4 w-4 shrink-0 text-amber-300/80" />
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold">{item.label}</span>
                              <span className="block truncate text-[10px] text-[var(--text-tertiary)]">{item.sub}</span>
                            </span>
                            {isActive && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
