import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Navbar from '@/components/layout/Navbar';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'MTN - Mantori\'s Trading Navigator',
  description: 'SEPA, VCP pivot entries, pattern invalidation risk, and disciplined trade tracking workflow.',
};

import { MarketProvider } from '@/contexts/MarketContext';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased dark`}>
      <body className="flex min-h-full flex-col font-sans">
        <MarketProvider>
          <Navbar />
          <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </MarketProvider>
      </body>
    </html>
  );
}
