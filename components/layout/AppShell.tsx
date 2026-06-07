'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MarketProvider } from '@/contexts/MarketContext';
import Navbar from '@/components/layout/Navbar';
import NavbarMobile from '@/components/layout/NavbarMobile';
import AppStepper from '@/components/layout/AppStepper';
import NavigatorWarningSystem from '@/components/master-filter/NavigatorWarningSystem';

function needsMarketContext(pathname: string) {
  return ['/master-filter', '/macro', '/scanner', '/canslim', '/leader', '/momentum', '/qullamaggie', '/plan'].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const withMarketContext = needsMarketContext(pathname);

  if (isLoginPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  const shell = (
    <div className="app-shell flex min-h-screen flex-col">
      {/* 데스크톱 네비 */}
      <div className="hidden md:block">
        <Suspense fallback={null}>
          <Navbar />
        </Suspense>
        <AppStepper />
      </div>

      {/* 모바일 네비 (상단 바 + 하단 탭바) */}
      <div className="block md:hidden">
        <Suspense fallback={null}>
          <NavbarMobile />
        </Suspense>
      </div>

      {withMarketContext && <NavigatorWarningSystem />}

      {/* 모바일: pb-16 으로 하단 탭바 여백 확보 */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 pb-20 sm:px-6 sm:py-6 md:pb-5 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );

  return withMarketContext ? <MarketProvider>{shell}</MarketProvider> : shell;
}
