'use client';

import { useState } from 'react';
import DisciplineChart from '@/components/dashboard/DisciplineChart';
import EquityCurve from '@/components/dashboard/EquityCurve';
import MetricCards from '@/components/dashboard/MetricCards';
import ReviewStatsDashboard from '@/components/dashboard/ReviewStatsDashboard';
import TradeHistoryTable from '@/components/dashboard/TradeHistoryTable';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import TradingViewAdvancedChart from '@/components/ui/TradingViewAdvancedChart';
import MetricWithHelp from '@/components/ui/MetricWithHelp';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { Search, BarChart3, Shield, BookOpen, TrendingUp } from 'lucide-react';
import { toTradingViewSymbol } from '@/components/ui/TradingViewWidget';
import FlowCtaButton from '@/components/ui/FlowCtaButton';

type DashTab = '성과' | '규율' | '복기' | '차트';

export default function DashboardPage() {
  const [market, setMarket] = useState<'US' | 'KR'>('US');
  const [activeTab, setActiveTab] = useState<DashTab>('성과');
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

  const disciplineColor = avgDiscipline >= 8 ? 'text-emerald-400' : avgDiscipline >= 6 ? 'text-amber-400' : 'text-rose-400';
  const riskColor = openRisk > 0 ? 'text-amber-300' : 'text-emerald-300';

  const TABS: { key: DashTab; label: string; icon: React.ReactNode }[] = [
    { key: '성과', label: '📈 성과', icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { key: '규율', label: '🎯 규율', icon: <Shield className="h-3.5 w-3.5" /> },
    { key: '복기', label: '🧾 복기', icon: <BookOpen className="h-3.5 w-3.5" /> },
    { key: '차트', label: '📊 차트', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  ];

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

      {/* Focus 3 — 오늘 이것만 확인 */}
      <section className="rounded-[20px] border border-slate-800/60 bg-slate-900/40 p-5 backdrop-blur-md">
        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">📌 오늘의 포커스 — 이것만 보면 됩니다</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-900/10 p-4">
            <MetricWithHelp
              label="Discipline Score"
              aliasLabel="규율 점수"
              value={avgDiscipline.toFixed(1)}
              unit="pt"
              subtext={`최근 10매매 중 계획 준수 ${planAdherenceRate.toFixed(0)}%`}
              statusLabel={avgDiscipline >= 8 ? '우수' : avgDiscipline >= 6 ? '보통' : '주의'}
              statusClass={disciplineColor}
              barPct={avgDiscipline * 10}
              tooltipContent="최근 10건의 매매에서 진입·손절·목표가 규칙을 얼마나 지켰는지를 0~10점으로 환산한 자기평가 점수입니다."
              accordionContent={
                <span>
                  <strong className="text-slate-200">계산:</strong> 각 매매 복기에서 체크리스트 준수 항목 / 전체 항목 × 10<br />
                  <strong className="text-slate-200">해석:</strong> 8점 이상 우수 · 6~7점 개선 필요 · 6점 미만 시스템 위기<br />
                  <strong className="text-amber-300">주의:</strong> 점수가 낮으면 전략이 아닌 감정이 매매를 지배하는 신호입니다.
                </span>
              }
            />
          </div>

          <div className="rounded-xl border border-slate-700/40 bg-slate-900/20 p-4">
            <MetricWithHelp
              label="Expectancy"
              aliasLabel="1회 매매 기대값"
              value={`${expectancyR >= 0 ? '+' : ''}${expectancyR.toFixed(2)}`}
              unit="R"
              subtext={expectancyR > 0 ? '시스템이 통계적 우위 상태' : '우위 회복 필요'}
              statusLabel={expectancyR > 0.2 ? '강함' : expectancyR > 0 ? '양수' : '약함'}
              statusClass={expectancyR > 0.2 ? 'text-emerald-400' : expectancyR > 0 ? 'text-amber-400' : 'text-rose-400'}
              barPct={Math.max(0, Math.min(expectancyR * 100, 100))}
              tooltipContent="1번 매매할 때 평균적으로 기대할 수 있는 R 단위 수익입니다. 양수면 장기적으로 이기는 시스템입니다."
              formula="E = (승률 × 평균수익R) − (패률 × 평균손실R)"
              accordionContent={
                <span>
                  <strong className="text-slate-200">1R = 최초 손절 금액.</strong> 예: 진입가 100, 손절 95이면 1R = 5원.<br />
                  <strong className="text-slate-200">해석:</strong> +0.2R 이상이면 우위 확실 · 0~0.2R은 보통 · 음수는 시스템 점검 필요<br />
                  <strong className="text-amber-300">주의:</strong> 매매 건수가 30개 미만이면 샘플이 부족해 신뢰도가 낮습니다.
                </span>
              }
            />
          </div>

          <div className="rounded-xl border border-amber-800/30 bg-amber-900/5 p-4">
            <MetricWithHelp
              label="Open Risk"
              aliasLabel="열린 리스크"
              value={openRisk > 0 ? `$${openRisk.toFixed(2)}` : '—'}
              subtext={openRisk > 0 ? '권장 상한 총자산의 5%' : '현재 오픈 포지션 없음'}
              statusLabel={openRisk > 0 ? '활성' : '없음'}
              statusClass={riskColor}
              tooltipContent="현재 활성 포지션에서 손절가까지 내려갈 경우 최대 손실 금액입니다. 총 자산의 5% 이하를 유지하세요."
              accordionContent={
                <span>
                  <strong className="text-slate-200">계산:</strong> Σ (진입가 - 손절가) × 보유수량<br />
                  <strong className="text-slate-200">해석:</strong> 총자산 대비 2~5%가 적정 · 5% 초과 시 신규 진입 중단<br />
                  <strong className="text-amber-300">규칙:</strong> 시장이 YELLOW/RED일 때는 2% 이하 유지 권장
                </span>
              }
            />
          </div>
        </div>
      </section>

      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-slate-800 pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.key
                ? 'border-slate-700 bg-slate-900/60 text-white'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === '성과' && (
        <div className="space-y-6">
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
      )}

      {activeTab === '규율' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[28px] border border-slate-800/60 bg-slate-900/40 p-6 shadow-2xl backdrop-blur-md">
            <EquityCurve data={equityCurve} />
          </div>
          <div className="rounded-[28px] border border-slate-800/60 bg-slate-900/40 p-6 shadow-2xl backdrop-blur-md">
            <DisciplineChart highDiscipline={highDiscipline} lowDiscipline={lowDiscipline} />
          </div>
        </div>
      )}

      {activeTab === '복기' && (
        <div className="space-y-6">
          <ReviewStatsDashboard trades={trades} />
          <section className="min-h-[500px] rounded-[28px] border border-slate-800/60 bg-slate-900/40 p-1 shadow-2xl backdrop-blur-md">
            <TradeHistoryTable trades={trades} limit={10} title={`${market === 'US' ? '미국' : '한국'} 주식 최근 매매 실적`} />
          </section>
        </div>
      )}

      {activeTab === '차트' && (
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
      )}

      {/* 다음 단계 안내 (Phase 2) */}
      <FlowCtaButton 
        nextPath="/scanner" 
        label="주도주 발굴하러 가기" 
        subLabel="Step 2: Scanner"
        variant="rose"
      />
    </div>
  );
}
