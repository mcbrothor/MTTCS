import Link from 'next/link';
import { Activity, BarChart3, BookOpen, Compass, History, LayoutDashboard, PlusCircle, ScanSearch, Star } from 'lucide-react';

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-mono text-lg font-bold text-emerald-500 transition-colors hover:text-emerald-400">
          <Activity className="h-6 w-6" />
          <span>
            MTN
            <span className="hidden ml-2 text-sm font-normal text-slate-400 lg:inline">
              Mantori&apos;s Trading Navigator
            </span>
          </span>
        </Link>

        <div className="flex min-w-0 items-center justify-end gap-3 overflow-x-auto sm:gap-6">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">대시보드</span>
          </Link>
          <Link href="/master-filter" className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <Compass className="h-4 w-4 text-emerald-400" />
            <span className="hidden sm:inline">마스터 필터</span>
          </Link>
          <Link href="/scanner" className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <ScanSearch className="h-4 w-4 text-indigo-400" />
            <span className="hidden sm:inline">스캐너</span>
          </Link>
          <Link href="/plan" className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <PlusCircle className="h-4 w-4 text-electric-blue" />
            <span className="hidden sm:inline">신규 계획</span>
          </Link>
          <Link href="/watchlist" className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="hidden sm:inline">관심 종목</span>
          </Link>
          <Link href="/guide" className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <BookOpen className="h-4 w-4 text-amber-500" />
            <span className="hidden sm:inline">알고리즘</span>
          </Link>
          <Link href="/history" className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">히스토리</span>
          </Link>
          <Link href="/macro" className="flex shrink-0 items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <BarChart3 className="h-4 w-4 text-purple-400" />
            <span className="hidden sm:inline">매크로 분석</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
