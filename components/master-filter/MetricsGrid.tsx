'use client';

import { useMarket } from '@/contexts/MarketContext';
import { TrendingUp, BarChart2, Activity, Users, AlertCircle } from 'lucide-react';
import Card from '@/components/ui/Card';
import { 
  AreaChart, 
  Area, 
  YAxis, 
  ResponsiveContainer 
} from 'recharts';

export default function MetricsGrid() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse h-48 bg-slate-800/30">
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
      {/* 1. Trend Alignment (Chart Included) */}
      <Card className="flex flex-col gap-3 min-h-[220px]">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 text-slate-400">
            <TrendingUp className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Trend Alignment</h3>
          </div>
          <span className={`text-lg font-bold ${getTrendColor(metrics.trendState)}`}>
            {metrics.trendState}
          </span>
        </div>
        
        <div className="flex-1 min-h-[100px] -mx-4 -mb-2 opacity-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.spyHistory}>
              <defs>
                <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metrics.trendState === 'UP' ? '#10b981' : '#f43f5e'} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={metrics.trendState === 'UP' ? '#10b981' : '#f43f5e'} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area 
                type="monotone" 
                dataKey="close" 
                stroke={metrics.trendState === 'UP' ? '#10b981' : '#f43f5e'} 
                fillOpacity={1} 
                fill="url(#colorTrend)" 
                strokeWidth={2}
                isAnimationActive={false}
              />
              <YAxis hide domain={['dataMin - 10', 'dataMax + 10']} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-auto space-y-1">
          <p className="text-xs font-medium text-slate-300">{metrics.trendDetails}</p>
          <div className="flex gap-2 text-[10px] text-slate-500 font-mono">
            <span>Price: {metrics.spyPrice?.toFixed(1)}</span>
            <span>MA50: {metrics.ma50?.toFixed(1)}</span>
            <span>MA200: {metrics.ma200?.toFixed(1)}</span>
          </div>
        </div>
      </Card>

      {/* 2. Market Breadth */}
      <Card className="flex flex-col gap-3">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 text-slate-400">
            <BarChart2 className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Market Breadth</h3>
          </div>
          <span className={`text-lg font-bold ${metrics.breadthScore >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {metrics.breadthScore} 점
          </span>
        </div>
        
        <div className="mt-4 space-y-3">
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${metrics.breadthScore >= 70 ? 'bg-emerald-500' : metrics.breadthScore >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${metrics.breadthScore}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 px-1 uppercase tracking-tighter">
            <span>Bearish (0)</span>
            <span>Neutral (50)</span>
            <span>Bullish (100)</span>
          </div>
        </div>

        <p className="text-xs text-slate-400 mt-auto leading-relaxed italic">
          <AlertCircle className="h-3 w-3 inline mr-1 mb-0.5" />
          {metrics.breadthDetails}
        </p>
      </Card>

      {/* 3. Volatility Regime (VIX Chart) */}
      <Card className="flex flex-col gap-3 min-h-[220px]">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2 text-slate-400">
            <Activity className="h-4 w-4" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Volatility Regime</h3>
          </div>
          <div className="text-right">
            <span className={`text-lg font-bold ${getVixColor(metrics.vixState)}`}>
              {metrics.vixState}
            </span>
            <div className="text-[10px] text-slate-500 font-mono">VIX Index: {metrics.vixValue}</div>
          </div>
        </div>

        <div className="flex-1 min-h-[100px] -mx-4 -mb-2 opacity-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.vixHistory}>
              <defs>
                <linearGradient id="colorVix" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metrics.vixState === 'CALM' ? '#10b981' : '#f43f5e'} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={metrics.vixState === 'CALM' ? '#10b981' : '#f43f5e'} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area 
                type="monotone" 
                dataKey="close" 
                stroke={metrics.vixState === 'CALM' ? '#10b981' : '#f43f5e'} 
                fillOpacity={1} 
                fill="url(#colorVix)" 
                strokeWidth={2}
                isAnimationActive={false}
              />
              <YAxis hide reversed domain={['dataMin - 2', 'dataMax + 5']} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs font-medium text-slate-300 mt-auto">
          {metrics.vixState === 'CALM' ? 'VIX 지수 20 이하로 안정적 국면' : metrics.vixState === 'ELEVATED' ? '변동성 확대에 따른 관망 필요' : '공격적인 매집 중단 권고 (공포 점증)'}
        </p>
      </Card>

      {/* 4. Liquidity & Leadership */}
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2 py-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2 text-slate-400">
              <Users className="h-4 w-4" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider">Leadership</h3>
            </div>
            <span className={`text-sm font-bold ${getLeadershipColor(metrics.leadershipState)}`}>
              {metrics.leadershipState}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 leading-tight">주도주군 기술적 타이밍 도달 여부 및 매수세 집중도</p>
        </Card>

        <Card className="flex flex-col gap-2 py-3">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2 text-slate-400">
              <Activity className="h-4 w-4" />
              <h3 className="text-[11px] font-semibold uppercase tracking-wider">Liquidity</h3>
            </div>
            <span className={`text-sm font-bold ${getLiquidityColor(metrics.liquidityState)}`}>
              {metrics.liquidityState}
            </span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <div className="h-1.5 flex-1 bg-slate-800 rounded-full mr-3 overflow-hidden">
              <div 
                className={`h-full ${metrics.distributionDays > 5 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                style={{ width: `${(metrics.distributionDays / 10) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Dist Days: {metrics.distributionDays}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
