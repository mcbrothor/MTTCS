'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MarketProvider } from '@/contexts/MarketContext';
import Navbar from '@/components/layout/Navbar';
import NavigatorWarningSystem from '@/components/master-filter/NavigatorWarningSystem';

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <MarketProvider>
      <Navbar />
      <NavigatorWarningSystem />
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </MarketProvider>
  );
}
