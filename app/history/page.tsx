'use client';

import { useState } from 'react';
import TradeHistoryTable from '@/components/dashboard/TradeHistoryTable';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';

export default function HistoryPage() {
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const { loading, error, trades } = useDashboardMetrics(market);

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
        <p className="text-xl font-bold">오류가 발생했습니다</p>
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
            저장된 계획과 완료된 매매의 근거, 리스크, 결과를 다시 확인합니다.
          </p>
        </div>

        <div className="flex rounded-lg bg-slate-800 p-1">
          <button
            onClick={() => setMarket('US')}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              market === 'US' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            미국 주식
          </button>
          <button
            onClick={() => setMarket('KR')}
            className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              market === 'KR' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            한국 주식
          </button>
        </div>
      </div>

      <TradeHistoryTable trades={trades} title={`${market === 'US' ? '미국' : '한국'} 전체 매매 복기`} />
    </div>
  );
}
