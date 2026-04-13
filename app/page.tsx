'use client';

import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import MetricCards from '@/components/dashboard/MetricCards';
import EquityCurve from '@/components/dashboard/EquityCurve';
import DisciplineChart from '@/components/dashboard/DisciplineChart';
import TradeHistoryTable from '@/components/dashboard/TradeHistoryTable';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function DashboardPage() {
  const {
    loading,
    error,
    trades,
    winRate,
    totalPnL,
    avgDiscipline,
    highDiscipline,
    lowDiscipline,
    equityCurve,
    plannedCount,
    sepaPassRate,
  } = useDashboardMetrics();

  if (loading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 font-mono text-slate-400">매매 데이터를 불러오는 중입니다...</p>
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
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Dashboard</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">대시보드</h1>
        <p className="mt-3 text-sm text-slate-400">MTTCS v3.0 매매 성과와 규율 준수율을 추적합니다.</p>
      </div>

      <MetricCards
        winRate={winRate}
        totalPnL={totalPnL}
        avgDiscipline={avgDiscipline}
        plannedCount={plannedCount}
        sepaPassRate={sepaPassRate}
      />

      <EquityCurve data={equityCurve} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DisciplineChart highDiscipline={highDiscipline} lowDiscipline={lowDiscipline} />
        <TradeHistoryTable trades={trades} limit={10} title="최근 매매 기록" />
      </div>
    </div>
  );
}
