'use client';

import { useState } from 'react';
import DisciplineChart from '@/components/dashboard/DisciplineChart';
import EquityCurve from '@/components/dashboard/EquityCurve';
import MetricCards from '@/components/dashboard/MetricCards';
import ReviewStatsDashboard from '@/components/dashboard/ReviewStatsDashboard';
import TradeHistoryTable from '@/components/dashboard/TradeHistoryTable';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import TradingViewAdvancedChart from '@/components/ui/TradingViewAdvancedChart';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { Search } from 'lucide-react';
import { toTradingViewSymbol } from '@/components/ui/TradingViewWidget';

export default function DashboardPage() {
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [chartSearchInput, setChartSearchInput] = useState('');
  const [activeChartSymbol, setActiveChartSymbol] = useState('NASDAQ:AAPL');
  const {
    loading,
    error,
    trades,
    winRate,
    totalPnL,
    avgRMultiple,
    expectancyR,
    openRisk,
    planAdherenceRate,
    avgDiscipline,
    highDiscipline,
    lowDiscipline,
    equityCurve,
    plannedCount,
    sepaPassRate,
  } = useDashboardMetrics(market);

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
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Dashboard</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">대시보드</h1>
          <p className="mt-3 text-sm text-slate-400">MTN 매매 성과와 규칙 준수율을 추적합니다.</p>
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

      <MetricCards
        winRate={winRate}
        totalPnL={totalPnL}
        avgRMultiple={avgRMultiple}
        expectancyR={expectancyR}
        openRisk={openRisk}
        planAdherenceRate={planAdherenceRate}
        avgDiscipline={avgDiscipline}
        plannedCount={plannedCount}
        sepaPassRate={sepaPassRate}
        market={market}
      />

      <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold text-white">Advanced Chart 검색</h2>
          <div className="flex w-full max-w-sm items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/50">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="종목 코드 입력 (예: TSLA, 005930)"
              className="flex-1 bg-transparent text-sm text-white outline-none"
              value={chartSearchInput}
              onChange={(e) => setChartSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && chartSearchInput.trim()) {
                  const val = chartSearchInput.trim().toUpperCase();
                  const isKorean = /^\d{6}$/.test(val);
                  setActiveChartSymbol(toTradingViewSymbol(val, isKorean ? 'KRX' : 'NASDAQ'));
                }
              }}
            />
          </div>
        </div>
        <div className="h-[600px] w-full overflow-hidden rounded-lg border border-slate-800">
          <TradingViewAdvancedChart symbol={activeChartSymbol} />
        </div>
      </section>

      <EquityCurve data={equityCurve} />

      <DisciplineChart highDiscipline={highDiscipline} lowDiscipline={lowDiscipline} />

      <ReviewStatsDashboard trades={trades} />

      <section className="min-h-[560px]">
        <TradeHistoryTable trades={trades} limit={10} title={`${market === 'US' ? '미국' : '한국'} 주식 최근 매매`} />
      </section>
    </div>
  );
}
