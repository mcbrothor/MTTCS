'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MarketProvider } from '@/contexts/MarketContext';
import Navbar from '@/components/layout/Navbar';
import FlowBanner from '@/components/layout/FlowBanner';
import NavigatorWarningSystem from '@/components/master-filter/NavigatorWarningSystem';

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <MarketProvider>
      <div className="app-shell flex min-h-screen flex-col">
        <Navbar />
        <NavigatorWarningSystem />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
          <FlowBanner className="mb-4" />
          {children}
        </main>
      </div>
    </MarketProvider>
  );
}
