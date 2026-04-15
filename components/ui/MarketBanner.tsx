'use client';

import { AlertTriangle } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';

export default function MarketBanner() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) return null;

  if (data.state === 'YELLOW') {
    return (
      <div className="sticky top-0 z-40 w-full bg-amber-500/90 text-amber-950 px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 shadow-sm backdrop-blur-sm">
        <AlertTriangle className="h-4 w-4" />
        마스터 필터 [YELLOW]: 혼조세 시장입니다. 투자 비중을 축소하고 손절폭을 타이트하게 유지하세요.
      </div>
    );
  }

  return null;
}
