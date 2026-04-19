'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ScanSearch } from 'lucide-react';

export default function ScannerTabNav() {
  const pathname = usePathname();

  const tabs = [
    {
      id: 'minervini',
      label: '미너비니 스캐너',
      description: 'VCP & SEPA 기술적 분석',
      href: '/scanner',
      icon: <Activity className="h-4 w-4" />,
      color: 'text-indigo-400',
      activeColor: 'bg-indigo-500/10 border-indigo-500/50 text-indigo-300',
    },
    {
      id: 'oneil',
      label: '오닐 스캐너',
      description: 'CAN SLIM 펀더멘털 분석',
      href: '/canslim',
      icon: <ScanSearch className="h-4 w-4" />,
      color: 'text-rose-400',
      activeColor: 'bg-rose-500/10 border-rose-500/50 text-rose-300',
    },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={`flex flex-col gap-1 rounded-xl border p-4 transition-all hover:scale-[1.02] active:scale-[0.98] ${
              isActive
                ? tab.activeColor
                : 'border-slate-800 bg-slate-900/40 text-slate-500 hover:border-slate-700 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
              <span className={isActive ? '' : tab.color}>{tab.icon}</span>
              <span className="text-sm">{tab.label}</span>
            </div>
            <p className="text-xs opacity-70">{tab.description}</p>
          </Link>
        );
      })}
    </div>
  );
}
