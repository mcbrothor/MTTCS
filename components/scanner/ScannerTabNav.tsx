'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ScanSearch } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';

const STATE_TONE = {
  GREEN: 'bg-emerald-400',
  YELLOW: 'bg-amber-400',
  RED: 'bg-rose-400',
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
  ];

  const stateDot = data?.state ? STATE_TONE[data.state] : 'bg-slate-500';

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;

        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`rounded-[20px] border px-4 py-4 transition-all ${
              isActive
                ? tab.activeColor
                : 'border-[var(--border)] bg-[var(--surface-soft)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${isActive ? 'border-white/10 bg-black/10' : 'border-[var(--border)] bg-[var(--surface-strong)]'} ${isActive ? '' : tab.idleColor}`}>
                  {tab.icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                      Scanner Mode
                    </span>
                    <span className={`h-2 w-2 rounded-full ${stateDot}`} />
                  </div>
                  <p className="mt-1 text-sm font-semibold">{tab.label}</p>
                </div>
              </div>
              {isActive && (
                <span className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]">
                  Active
                </span>
              )}
            </div>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">{tab.description}</p>
          </Link>
        );
      })}
    </div>
  );
}
