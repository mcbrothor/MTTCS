'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ReviewStatsDashboard from '@/components/dashboard/ReviewStatsDashboard';
import TradeHistoryTable from '@/components/dashboard/TradeHistoryTable';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { filterTradesByMistakeTag } from '@/lib/review-stats';

function HistoryPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedMarket = searchParams.get('market') === 'KR' ? 'KR' : 'US';
  const [market, setMarket] = useState<'US' | 'KR'>(requestedMarket);
  const [selectedMistakeTag, setSelectedMistakeTag] = useState<string | null>(null);
  const { loading, error, trades } = useDashboardMetrics(market);

  useEffect(() => {
    setMarket(requestedMarket);
  }, [requestedMarket]);

  useEffect(() => {
    setSelectedMistakeTag(null);
  }, [market]);

  const handleMarketChange = (nextMarket: 'US' | 'KR') => {
    setMarket(nextMarket);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('market', nextMarket);
    router.replace(`${pathname}?${nextParams.toString()}`);
  };

  const filteredTrades = useMemo(
    () => filterTradesByMistakeTag(trades, selectedMistakeTag),
    [selectedMistakeTag, trades]
  );

  if (loading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center text-coral-red">
        <p className="text-xl font-bold">복기 데이터를 불러오지 못했습니다</p>
        <p className="mt-2 text-slate-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Review</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">매매 복기</h1>
          <p className="mt-3 text-sm text-slate-400">
            완료된 매매를 다시 읽고, 반복되는 실수와 잘한 패턴을 확인한 뒤 3-Layer 상세 복기로 이어집니다.
          </p>
        </div>

        <div className="flex rounded-lg bg-slate-800 p-1">
          <button
            onClick={() => handleMarketChange('US')}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              market === 'US' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            미국 주식
          </button>
          <button
            onClick={() => handleMarketChange('KR')}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              market === 'KR' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            한국 주식
          </button>
        </div>
      </div>

      <ReviewStatsDashboard
        trades={trades}
        selectedMistakeTag={selectedMistakeTag}
        onSelectMistakeTag={setSelectedMistakeTag}
      />

      <TradeHistoryTable
        trades={filteredTrades}
        title={
          selectedMistakeTag
            ? `${market === 'US' ? '미국' : '한국'} 주식 / ${selectedMistakeTag} 필터`
            : `${market === 'US' ? '미국' : '한국'} 전체 매매 복기`
        }
      />
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[80vh] flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <HistoryPageContent />
    </Suspense>
  );
}
