'use client';

import { useMarket } from '@/contexts/MarketContext';
import { TrendingUp, BarChart2, Activity, Users, AlertCircle, Info, ShieldCheck, ShieldAlert } from 'lucide-react';
import Card from '@/components/ui/Card';
import { 
  AreaChart, 
  Area, 
  YAxis, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { MasterFilterMetricDetail } from '@/types';
import React from 'react';

/**
 * 지표 카드 렌더링 헬퍼 컴포넌트 (성능 및 린트 준수를 위해 외부 분리)
 */
interface MetricCardProps {
  detail: MasterFilterMetricDetail;
  icon: React.ElementType;
  chartData?: { date: string; close: number }[];
  isStepGauge?: boolean;
}

const MetricCard = ({ 
  detail, 
  icon: Icon, 
  chartData,
  isStepGauge = false
}: MetricCardProps) => {
  const isAlert = detail.status === 'FAIL';
  const isWarning = detail.status === 'WARNING';
  
  const statusColor = isAlert ? 'text-rose-500' : isWarning ? 'text-amber-500' : 'text-emerald-400';
  const borderColor = isAlert ? 'border-rose-500/40' : isWarning ? 'border-amber-500/40' : 'border-slate-800';

  return (
    <Card className={`flex flex-col gap-4 min-h-[280px] transition-all duration-300 border-2 ${borderColor} ${isAlert ? 'bg-rose-500/5 shadow-[0_0_20px_rgba(244,63,94,0.1)]' : ''}`}>
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2 text-slate-400">
          <Icon className="h-4 w-4" />
          <h3 className="text-xs font-bold uppercase tracking-widest">{detail.label}</h3>
        </div>
        <div className="text-right">
          <div className={`text-xl ${isAlert ? 'font-black' : 'font-bold'} ${statusColor} tracking-tight`}>
            {detail.value} <span className="text-xs opacity-60">/ {detail.threshold}</span>
            <span className="ml-1 text-[10px] uppercase">{detail.unit}</span>
          </div>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            {detail.status === 'PASS' ? (
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
            ) : (
              <ShieldAlert className={`h-3 w-3 ${statusColor}`} />
            )}
            <span className={`text-[10px] font-bold uppercase tracking-tighter ${statusColor}`}>
              {detail.status}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 relative min-h-[100px]">
        {chartData ? (
          <div className="absolute inset-0 -mx-4 opacity-50">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id={`color-${detail.label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isAlert ? '#f43f5e' : '#10b981'} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={isAlert ? '#f43f5e' : '#10b981'} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                {detail.label === 'Market Breadth' && (
                  <ReferenceLine y={50} stroke="#f43f5e" strokeDasharray="3 3" strokeWidth={1} />
                )}
                {detail.label === 'Volatility (VIX)' && (
                  <>
                    <ReferenceLine y={15} stroke="#10b981" strokeDasharray="2 2" />
                    <ReferenceLine y={20} stroke="#f43f5e" strokeDasharray="2 2" />
                  </>
                )}
                <Area 
                  type="monotone" 
                  dataKey="close" 
                  stroke={isAlert ? '#f43f5e' : '#10b981'} 
                  fillOpacity={1} 
                  fill={`url(#color-${detail.label})`}
                  strokeWidth={2.5}
                  isAnimationActive={false}
                />
                <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} reversed={detail.label === 'Volatility (VIX)'} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : isStepGauge ? (
          <div className="flex gap-2 h-4 items-center mt-6">
            {[1, 2, 3, 4, 5].map((step) => {
              const isActive = Number(detail.value) >= step;
              const isMax = step >= 4;
              return (
                <div 
                  key={step} 
                  className={`flex-1 h-3 rounded-sm transition-all duration-500 ${
                    isActive 
                      ? (isMax ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-emerald-500') 
                      : 'bg-slate-800'
                  }`}
                />
              );
            })}
          </div>
        ) : (
          <div className={`mt-8 p-3 rounded-lg bg-slate-900/50 border ${borderColor} flex items-center gap-3`}>
            <BarChart2 className={`h-8 w-8 ${statusColor}`} />
            <div className="text-sm font-bold text-slate-200 uppercase tracking-widest">{detail.value}</div>
          </div>
        )}
      </div>

      <div className="mt-auto pt-3 border-t border-slate-800/50 space-y-2">
        <div className="flex items-start gap-2">
          <Info className="h-3 w-3 text-indigo-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-slate-400 leading-normal">
            <strong>판별 기준:</strong> {detail.description}
          </p>
        </div>
        <div className="flex justify-between items-center text-[9px] text-slate-600 font-mono uppercase tracking-tighter">
          <span>{detail.source}</span>
          <span className="opacity-50">Navigation Protocol v5.0</span>
        </div>
      </div>
    </Card>
  );
};

export default function MetricsGrid() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse h-64 bg-slate-800/30 border-slate-700/50" />
        ))}
      </div>
    );
  }

  const { metrics } = data;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 1. Trend Alignment */}
      <MetricCard 
        detail={metrics.trend} 
        icon={TrendingUp} 
        chartData={metrics.spyHistory}
      />

      {/* 2. Market Breadth */}
      <MetricCard 
        detail={metrics.breadth} 
        icon={BarChart2} 
        chartData={metrics.spyHistory?.map(d => ({ ...d, close: d.close > (metrics.ma200 || 0) ? 75 : 45 }))} 
      />

      {/* 3. Volatility Regime */}
      <MetricCard 
        detail={metrics.volatility} 
        icon={Activity} 
        chartData={metrics.vixHistory}
      />

      {/* 4. Liquidity & Leadership (Composite) */}
      <div className="flex flex-col gap-4">
        <MetricCard 
          detail={metrics.liquidity} 
          icon={AlertCircle} 
          isStepGauge={true}
        />
        <MetricCard 
          detail={metrics.leadership} 
          icon={Users} 
        />
      </div>
    </div>
  );
}
