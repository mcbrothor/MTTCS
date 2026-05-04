'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import TradeHistoryTable from '@/components/dashboard/TradeHistoryTable';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FlowCtaButton from '@/components/ui/FlowCtaButton';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { filterTradesByMistakeTag } from '@/lib/review-stats';

const ReviewStatsDashboard = dynamic(() => import('@/components/dashboard/ReviewStatsDashboard'), {
  ssr: false,
  loading: () => <StatsSkeleton />,
});
const MetricCards = dynamic(() => import('@/components/dashboard/MetricCards'), {
  ssr: false,
  loading: () => <StatsSkeleton />,
});

type HistoryView = 'review' | 'stats';

function HistoryPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedMarket = searchParams.get('market') === 'KR' ? 'KR' : 'US';
  const requestedView: HistoryView = searchParams.get('view') === 'stats' ? 'stats' : 'review';
  const [market, setMarket] = useState<'US' | 'KR'>(requestedMarket);
  const [view, setView] = useState<HistoryView>(requestedView);
  const [selectedMistakeTag, setSelectedMistakeTag] = useState<string | null>(null);
  const metrics = useDashboardMetrics(market);

  useEffect(() => {
    setMarket(requestedMarket);
  }, [requestedMarket]);

  useEffect(() => {
    setView(requestedView);
  }, [requestedView]);

  useEffect(() => {
    setSelectedMistakeTag(null);
  }, [market]);

  const updateParams = (next: { market?: 'US' | 'KR'; view?: HistoryView }) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('market', next.market ?? market);
    if ((next.view ?? view) === 'stats') nextParams.set('view', 'stats');
    else nextParams.delete('view');
    router.replace(`${pathname}?${nextParams.toString()}`);
  };

  const filteredTrades = useMemo(
    () => filterTradesByMistakeTag(metrics.trades, selectedMistakeTag),
    [selectedMistakeTag, metrics.trades]
  );

  if (metrics.loading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (metrics.error) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-coral-red">
        <p className="text-xl font-bold">복기 데이터를 불러오지 못했습니다.</p>
        <p className="mt-2 text-slate-400">{metrics.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-400">Review</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">성과 복기</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            매매가 끝난 뒤 결과와 실수 태그를 축적하고, 통계는 필요할 때만 열어 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            items={[
              { key: 'US', label: '미국' },
              { key: 'KR', label: '한국' },
            ]}
            active={market}
            onChange={(key) => {
              setMarket(key as 'US' | 'KR');
              updateParams({ market: key as 'US' | 'KR' });
            }}
          />
          <Segmented
            items={[
              { key: 'review', label: '복기 목록' },
              { key: 'stats', label: '성과 통계' },
            ]}
            active={view}
            onChange={(key) => {
              setView(key as HistoryView);
              updateParams({ view: key as HistoryView });
            }}
          />
        </div>
      </div>

      {view === 'review' ? (
        <TradeHistoryTable
          trades={filteredTrades}
          title={
            selectedMistakeTag
              ? `${market === 'US' ? '미국' : '한국'} 주식 / ${selectedMistakeTag} 필터`
              : `${market === 'US' ? '미국' : '한국'} 전체 매매 복기`
          }
        />
      ) : (
        <div className="space-y-6">
          <MetricCards
            winRate={metrics.winRate}
            totalPnL={metrics.totalPnL}
            avgRMultiple={metrics.avgRMultiple}
            expectancyR={metrics.expectancyR}
            openRisk={metrics.openRisk}
            planAdherenceRate={metrics.planAdherenceRate}
            avgDiscipline={metrics.avgDiscipline}
            plannedCount={metrics.plannedCount}
            sepaPassRate={metrics.sepaPassRate}
            market={market}
          />
          <ReviewStatsDashboard
            trades={metrics.trades}
            selectedMistakeTag={selectedMistakeTag}
            onSelectMistakeTag={setSelectedMistakeTag}
          />
          <TradeHistoryTable
            trades={filteredTrades}
            limit={10}
            title={`${market === 'US' ? '미국' : '한국'} 최근 매매 복기`}
          />
        </div>
      )}

      <FlowCtaButton 
        nextPath="/"
        label="오늘의 의사결정으로"
        subLabel="Cycle Complete"
        variant="indigo"
      />
    </div>
  );
}

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[70vh] flex-col items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <HistoryPageContent />
    </Suspense>
  );
}

function Segmented<T extends string>({
  items,
  active,
  onChange,
}: {
  items: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-1">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            active === item.key ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-sm text-slate-400">
      통계 모듈을 불러오는 중입니다...
    </div>
  );
}
