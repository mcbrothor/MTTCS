'use client';

import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import TradeHistoryTable from '@/components/dashboard/TradeHistoryTable';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function HistoryPage() {
  const { loading, error, trades } = useDashboardMetrics();

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
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">History</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">매매 히스토리</h1>
        <p className="mt-3 text-sm text-slate-400">저장된 계획과 완료된 매매의 전략 근거, 리스크, 결과를 확인합니다.</p>
      </div>

      <TradeHistoryTable trades={trades} title="전체 매매 전략" />
    </div>
  );
}
