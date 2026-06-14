'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import TradeHistoryTable from '@/components/dashboard/TradeHistoryTable';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import FlowCtaButton from '@/components/ui/FlowCtaButton';
import AsyncStatePanel from '@/components/ui/AsyncStatePanel';
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
  const [refreshKey, setRefreshKey] = useState(0);
  const metrics = useDashboardMetrics(market, refreshKey);

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
      <div className="space-y-6 pb-12">
        <HistoryHeader
          market={market}
          view={view}
          onMarketChange={(key) => {
            setMarket(key);
            updateParams({ market: key });
          }}
          onViewChange={(key) => {
            setView(key);
            updateParams({ view: key });
          }}
        />
        <AsyncStatePanel
          state="loading"
          title="복기 데이터를 불러오는 중입니다"
          message="매매 기록과 성과 통계를 확인하고 있습니다."
          delayedTitle="복기 데이터를 불러오지 못하고 있습니다"
          delayedMessage="데이터 요청이 지연 중입니다. 다시 시도하거나 오늘의 의사결정으로 돌아가 새 작업을 시작할 수 있습니다."
          onRetry={() => setRefreshKey((value) => value + 1)}
          primaryAction={{ label: '오늘의 의사결정으로', href: '/', variant: 'outline' }}
        />
      </div>
    );
  }

  if (metrics.error) {
    return (
      <div className="space-y-6 pb-12">
        <HistoryHeader
          market={market}
          view={view}
          onMarketChange={(key) => {
            setMarket(key);
            updateParams({ market: key });
          }}
          onViewChange={(key) => {
            setView(key);
            updateParams({ view: key });
          }}
        />
        <AsyncStatePanel
          state="error"
          title="복기 데이터를 불러오지 못했습니다"
          message={`원인: ${metrics.error}. 잠시 후 다시 시도하세요.`}
          onRetry={() => setRefreshKey((value) => value + 1)}
          primaryAction={{ label: '오늘의 의사결정으로', href: '/', variant: 'outline' }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <HistoryHeader
        market={market}
        view={view}
        onMarketChange={(key) => {
          setMarket(key);
          updateParams({ market: key });
        }}
        onViewChange={(key) => {
          setView(key);
          updateParams({ view: key });
        }}
      />

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

function HistoryHeader({
  market,
  view,
  onMarketChange,
  onViewChange,
}: {
  market: 'US' | 'KR';
  view: HistoryView;
  onMarketChange: (market: 'US' | 'KR') => void;
  onViewChange: (view: HistoryView) => void;
}) {
  return (
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
          onChange={(key) => onMarketChange(key as 'US' | 'KR')}
        />
        <Segmented
          items={[
            { key: 'review', label: '복기 목록' },
            { key: 'stats', label: '성과 통계' },
          ]}
          active={view}
          onChange={(key) => onViewChange(key as HistoryView)}
        />
      </div>
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
