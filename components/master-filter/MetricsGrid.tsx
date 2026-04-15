'use client';

import { useMarket } from '@/contexts/MarketContext';
import { TrendingUp, BarChart2, Activity, Users } from 'lucide-react';
import Card from '@/components/ui/Card';

export default function MetricsGrid() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse h-32 bg-slate-800/30">
            <div />
          </Card>
        ))}
      </div>
    );
  }

  const { metrics } = data;

  const getTrendColor = (state: string) => {
    if (state === 'UP') return 'text-emerald-400';
    if (state === 'DOWN') return 'text-rose-400';
    return 'text-amber-400';
  };

  const getLiquidityColor = (state: string) => {
    if (state === 'GOOD') return 'text-emerald-400';
    if (state === 'BAD') return 'text-rose-400';
    return 'text-amber-400';
  };

  const getVixColor = (state: string) => {
    if (state === 'CALM') return 'text-emerald-400';
    if (state === 'FEAR') return 'text-rose-400';
    return 'text-amber-400';
  };

  const getLeadershipColor = (state: string) => {
    if (state === 'FOCUSED') return 'text-emerald-400';
    if (state === 'WEAK') return 'text-rose-400';
    return 'text-amber-400';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 1. Trend Alignment */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-slate-400">
          <TrendingUp className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Trend Alignment</h3>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className={`text-2xl font-bold ${getTrendColor(metrics.trendState)}`}>
            {metrics.trendState}
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">{metrics.trendDetails}</p>
      </Card>

      {/* 2. Market Breadth */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-slate-400">
          <BarChart2 className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Market Breadth</h3>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className={`text-2xl font-bold ${metrics.breadthScore >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {metrics.breadthScore} 점
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">{metrics.breadthDetails}</p>
      </Card>

      {/* 3. Liquidity Flow (수급 분석) */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-slate-400">
          <Activity className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Liquidity Flow</h3>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className={`text-2xl font-bold ${getLiquidityColor(metrics.liquidityState)}`}>
            {metrics.liquidityState}
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">{metrics.trendDetails.includes('실패') ? '조회 실패' : `최근 분산일(Distribution Days): ${metrics.distributionDays}일`}</p>
      </Card>

      {/* 4. Volatility Regime (VIX) */}
      <Card className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-slate-400">
          <Activity className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Volatility Regime</h3>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className={`text-2xl font-bold ${getVixColor(metrics.vixState)}`}>
            {metrics.vixState}
          </span>
          <span className="text-slate-500 text-sm">
            {metrics.vixValue !== null ? `(${metrics.vixValue})` : '(데이터 없음)'}
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          {metrics.vixState === 'CALM' ? 'VIX 지수 20 이하로 안정적' : metrics.vixState === 'ELEVATED' ? 'VIX 지수 20~30 사이로 주의 단계' : 'VIX 지수 30 이상으로 변동성 극심'}
        </p>
      </Card>

      {/* 5. Leadership */}
      <Card className="flex flex-col gap-2 md:col-span-2">
        <div className="flex items-center gap-2 text-slate-400">
          <Users className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Leadership (주도 섹터)</h3>
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className={`text-2xl font-bold ${getLeadershipColor(metrics.leadershipState)}`}>
            {metrics.leadershipState}
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">시장을 견인하는 강력한 테마 및 주도주군 형성 여부를 나타냅니다.</p>
      </Card>
    </div>
  );
}
