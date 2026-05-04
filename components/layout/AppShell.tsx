'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MarketProvider } from '@/contexts/MarketContext';
import Navbar from '@/components/layout/Navbar';
import AppStepper from '@/components/layout/AppStepper';
import NavigatorWarningSystem from '@/components/master-filter/NavigatorWarningSystem';

function needsMarketContext(pathname: string) {
  return ['/master-filter', '/macro', '/scanner', '/canslim', '/plan'].some(
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
      <Suspense fallback={null}>
        <Navbar />
      </Suspense>
      <AppStepper />
      {withMarketContext && <NavigatorWarningSystem />}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );

  return withMarketContext ? <MarketProvider>{shell}</MarketProvider> : shell;
}
