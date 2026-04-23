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


      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-1 w-8 rounded-full bg-emerald-500" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Terminal / Command Center</p>
          </div>
          <h1 className="mt-2 text-4xl font-black tracking-tightest text-white lg:text-5xl">
            Portfolio <span className="text-[var(--text-tertiary)]">Analytics</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
            MTN 통합 대시보드입니다. 실시간 성과 지표, 규칙 준수율, 그리고 자산 성장 곡선을 모니터링하여 투자 규율을 유지하세요.
          </p>
        </div>

        <div className="flex items-center gap-4 rounded-[20px] border border-white/5 bg-white/5 p-1.5 backdrop-blur-md">
          <button
            onClick={() => setMarket('US')}
            className={`flex items-center gap-2 rounded-[14px] px-5 py-2.5 text-sm font-bold transition-all ${
              market === 'US' 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">🇺🇸</span> 미국 시장
          </button>
          <button
            onClick={() => setMarket('KR')}
            className={`flex items-center gap-2 rounded-[14px] px-5 py-2.5 text-sm font-bold transition-all ${
              market === 'KR' 
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25' 
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">🇰🇷</span> 한국 시장
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-12">
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
        </div>

        <div className="lg:col-span-8">
          <section className="h-full rounded-[28px] border border-slate-800/60 bg-slate-900/40 p-6 shadow-2xl backdrop-blur-md">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black tracking-tight text-white">Advanced Chart</h2>
                <p className="text-xs text-slate-500">TradingView 기술적 분석 엔진</p>
              </div>
              <div className="flex w-full max-w-sm items-center gap-3 rounded-[18px] border border-white/5 bg-black/20 px-4 py-2.5 transition-all focus-within:border-emerald-500/40 focus-within:ring-2 focus-within:ring-emerald-500/10">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="종목 티커 입력 (예: TSLA, 005930)"
                  className="flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:font-medium placeholder:text-slate-600"
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
            <div className="h-[540px] w-full overflow-hidden rounded-[20px] border border-white/5 shadow-inner">
              <TradingViewAdvancedChart symbol={activeChartSymbol} />
            </div>
          </section>
        </div>

        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-[28px] border border-slate-800/60 bg-slate-900/40 p-6 shadow-2xl backdrop-blur-md">
            <EquityCurve data={equityCurve} />
          </div>
          <div className="rounded-[28px] border border-slate-800/60 bg-slate-900/40 p-6 shadow-2xl backdrop-blur-md">
            <DisciplineChart highDiscipline={highDiscipline} lowDiscipline={lowDiscipline} />
          </div>
        </div>

        <div className="lg:col-span-12">
          <ReviewStatsDashboard trades={trades} />
        </div>

        <div className="lg:col-span-12">
          <section className="min-h-[500px] rounded-[28px] border border-slate-800/60 bg-slate-900/40 p-1 shadow-2xl backdrop-blur-md">
            <TradeHistoryTable trades={trades} limit={10} title={`${market === 'US' ? '미국' : '한국'} 주식 최근 매매 실적`} />
          </section>
        </div>
      </div>
    </div>
  );
}
