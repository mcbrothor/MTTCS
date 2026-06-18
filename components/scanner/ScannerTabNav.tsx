'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Trophy, ScanSearch } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';

const STATE_TONE = {
  GREEN: 'bg-emerald-400',
  YELLOW: 'bg-amber-400',
  RED: 'bg-rose-400',
  GREY: 'bg-slate-400',
} as const;

export default function ScannerTabNav() {
  const pathname = usePathname();
  const { data } = useMarket();

  const tabs = [
    {
      id: 'minervini',
      label: '미너비니 스캐너',
      description: 'SEPA · pivot · contraction quality',
      href: '/scanner',
      icon: <Activity className="h-4 w-4" />,
      activeColor: 'border-indigo-400/35 bg-indigo-500/10 text-indigo-100',
      idleColor: 'text-indigo-200',
    },
    {
      id: 'oneil',
      label: '오닐 스캐너',
      description: '7 pillars · earnings leadership',
      href: '/canslim',
      icon: <ScanSearch className="h-4 w-4" />,
      activeColor: 'border-rose-400/35 bg-rose-500/10 text-rose-100',
      idleColor: 'text-rose-200',
    },
    {
      id: 'leader',
      label: '주도주 스캐너',
      description: 'RS leadership · accumulation · sector rotation',
      href: '/leader',
      icon: <Trophy className="h-4 w-4" />,
      activeColor: 'border-amber-400/35 bg-amber-500/10 text-amber-100',
      idleColor: 'text-amber-200',
    },
    {
      id: 'momentum',
      label: '모멘텀 스캐너',
      description: 'RVOL & ROC 기반 폭발적 유동성 포착',
      href: '/momentum',
      icon: <Activity className="h-4 w-4" />,
      activeColor: 'border-rose-400/35 bg-rose-500/10 text-rose-100',
      idleColor: 'text-rose-200',
    },
    {
      id: 'qullamaggie',
      label: '쿨라매기 스캐너',
      description: 'Breakout · EP · Super Breakout',
      href: '/qullamaggie',
      icon: <Activity className="h-4 w-4" />,
      activeColor: 'border-fuchsia-400/35 bg-fuchsia-500/10 text-fuchsia-100',
      idleColor: 'text-fuchsia-200',
    },
    {
      id: 'cross-check',
      label: '교차 검증',
      description: '멀티스캐너 중복 포착 종목 확인',
      href: '/cross-check',
      icon: <ScanSearch className="h-4 w-4" />,
      activeColor: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
      idleColor: 'text-emerald-200',
    },
  ];

  const stateDot = data?.state ? STATE_TONE[data.state] : 'bg-slate-500';

  return (
    <div data-testid="scanner-workspace-nav" className="rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-2">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? tab.activeColor
                  : `border-transparent text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] ${tab.idleColor}`
              }`}
            >
              {tab.icon}
              {tab.label}
              {isActive && <span className={`h-2 w-2 rounded-full ${stateDot}`} />}
            </Link>
          );
        })}
      </div>
      {tabs.map((tab) => (
        pathname === tab.href ? (
          <p key={tab.id} className="px-2 pt-2 text-xs leading-5 text-[var(--text-secondary)]">
            {tab.description}
          </p>
        ) : null
      ))}
    </div>
  );
}
