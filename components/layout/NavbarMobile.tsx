'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Activity, X, TrendingUp, Search, BarChart2, BarChart3, Target, Star, HelpCircle, ArrowUpRight, Database } from 'lucide-react';
import { FLOW_STEPS, UTILITY_LINKS, getActiveFlowStep, isActiveTab } from '@/components/layout/navigation';

// 하단 탭바 — 핵심 5개 Flow
const BOTTOM_TABS = [
  { key: 'home',      href: '/',              label: '오늘',     icon: Activity },
  { key: 'market',    href: '/master-filter',  label: '시장',     icon: TrendingUp },
  { key: 'scanner',   href: '/scanner',        label: '발굴',     icon: Search },
  { key: 'portfolio', href: '/portfolio',       label: '포트',     icon: BarChart3 },
  { key: 'review',    href: '/history',         label: '복기',     icon: BarChart2 },
] as const;

const FLOW_ICON_MAP: Record<string, React.ElementType> = {
  home: Activity,
  market: TrendingUp,
  scanner: Search,
  plan: Target,
  review: BarChart2,
  watchlist: Star,
  portfolio: BarChart3,
  contest: Activity,
};

const UTILITY_ICON_MAP: Record<string, React.ElementType> = {
  '/guide': HelpCircle,
  '/links': ArrowUpRight,
  '/admin': Database,
};

export default function NavbarMobile() {
  const pathname = usePathname();
  const activeStep = getActiveFlowStep(pathname);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;

    const menuButton = menuButtonRef.current;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      menuButton?.focus({ preventScroll: true });
    };
  }, [drawerOpen]);

  return (
    <>
      {/* 상단 바 */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[var(--border)] bg-[rgba(4,8,16,0.94)] px-4 py-2.5 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-emerald-400/25 bg-emerald-500/10">
            <Activity className="h-3.5 w-3.5 text-emerald-300" />
          </div>
          <span className="font-mono text-sm font-bold text-emerald-300">MTN</span>
        </Link>

        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-md border border-[var(--border)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
          aria-label="메뉴 열기"
          aria-controls="mobile-menu-drawer"
          aria-expanded={drawerOpen}
        >
          메뉴
        </button>
      </header>

      {/* 서브 탭 (해당 Flow에 탭이 있을 때만) */}
      {activeStep.tabs.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface-strong)]/85 px-4 py-2">
          {activeStep.tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`shrink-0 rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                isActiveTab(pathname, tab.href)
                  ? 'border-sky-400/35 bg-sky-400/12 text-sky-100'
                  : 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)]'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      )}

      {/* 하단 탭바 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[rgba(4,8,16,0.97)] backdrop-blur">
        <div className="flex">
          {BOTTOM_TABS.map(({ key, href, label, icon: Icon }) => {
            const isActive = activeStep.key === key;
            return (
              <Link
                key={key}
                href={href}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-emerald-300' : 'text-[var(--text-tertiary)]'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-[60] isolate" data-testid="mobile-menu-layer">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            onTouchMove={(event) => event.preventDefault()}
            onWheel={(event) => event.preventDefault()}
            aria-hidden="true"
          />
          <aside
            id="mobile-menu-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="전체 메뉴"
            className="absolute inset-y-0 right-0 flex h-dvh w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden bg-[var(--surface-strong)] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <span className="text-sm font-semibold text-[var(--text-primary)]">전체 메뉴</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="rounded-md p-1 text-[var(--text-secondary)]"
                aria-label="메뉴 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
            트레이딩 플로우
          </p>
          {FLOW_STEPS.map((step) => {
            const Icon = FLOW_ICON_MAP[step.key] ?? Activity;
            const isActive = step.key === activeStep.key;
            return (
              <Link
                key={step.key}
                href={step.href}
                onClick={() => setDrawerOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-emerald-500/12 text-emerald-300'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{step.label}</span>
                <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">{step.sub}</span>
              </Link>
            );
          })}

          <div className="my-3 border-t border-[var(--border)]" />

          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
            유틸리티
          </p>
          {UTILITY_LINKS.map((item) => {
            const Icon = UTILITY_ICON_MAP[item.href] ?? ArrowUpRight;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--text-primary)]"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
            </div>

            <div className="border-t border-[var(--border)] px-3 py-3">
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                >
                  로그아웃
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
