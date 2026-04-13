import Link from 'next/link';
import { Activity, BookOpen, History, LayoutDashboard, PlusCircle, Star } from 'lucide-react';

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-mono text-lg font-bold text-emerald-500 transition-colors hover:text-emerald-400">
          <Activity className="h-6 w-6" />
          <span>MTTCS</span>
        </Link>

        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">대시보드</span>
          </Link>
          <Link href="/plan" className="flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <PlusCircle className="h-4 w-4 text-electric-blue" />
            <span className="hidden sm:inline">신규 계획</span>
          </Link>
          <Link href="/watchlist" className="flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <Star className="h-4 w-4 text-yellow-500" />
            <span className="hidden sm:inline">관심 종목</span>
          </Link>
          <Link href="/guide" className="flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <BookOpen className="h-4 w-4 text-amber-500" />
            <span className="hidden sm:inline">알고리즘</span>
          </Link>
          <Link href="/history" className="flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">히스토리</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}

