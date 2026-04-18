import Link from 'next/link';
import type { ReactNode } from 'react';
import { Activity, BarChart3, BookOpen, Compass, History, LayoutDashboard, PlusCircle, ScanSearch, Shield, Star, Trophy } from 'lucide-react';

const navItems = [
  { href: '/', icon: <LayoutDashboard className="h-4 w-4" />, label: '대시보드' },
  { href: '/master-filter', icon: <Compass className="h-4 w-4 text-emerald-400" />, label: '마스터 필터' },
  { href: '/scanner', icon: <ScanSearch className="h-4 w-4 text-indigo-400" />, label: '스캐너' },
  { href: '/contest', icon: <Trophy className="h-4 w-4 text-emerald-400" />, label: '콘테스트' },
  { href: '/plan', icon: <PlusCircle className="h-4 w-4 text-electric-blue" />, label: '신규 계획' },
  { href: '/watchlist', icon: <Star className="h-4 w-4 text-yellow-500" />, label: '관심종목' },
  { href: '/portfolio', icon: <Shield className="h-4 w-4 text-cyan-400" />, label: '리스크' },
  { href: '/guide', icon: <BookOpen className="h-4 w-4 text-amber-500" />, label: '알고리즘' },
  { href: '/history', icon: <History className="h-4 w-4" />, label: '매매 복기' },
  { href: '/macro', icon: <BarChart3 className="h-4 w-4 text-purple-400" />, label: '매크로' },
];

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-mono text-lg font-bold text-emerald-500 transition-colors hover:text-emerald-400">
          <Activity className="h-6 w-6" />
          <span>
            MTN
            <span className="ml-2 hidden text-xs font-normal text-slate-500 xl:inline">Mantori&apos;s Trading Navigator</span>
          </span>
        </Link>

        <div className="scrollbar-hide flex min-w-0 items-center justify-end gap-2.5 overflow-x-auto py-1 sm:gap-4 md:gap-5">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} label={item.label} />
          ))}
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
      {icon}
      <span className="hidden md:inline">{label}</span>
    </Link>
  );
}
