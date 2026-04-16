'use client';

import { Info, ShieldAlert, ShieldCheck, TrendingUp } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import Card from '@/components/ui/Card';
import { useMarket } from '@/contexts/MarketContext';
import type { MasterFilterMetricDetail } from '@/types';

interface MetricCardProps {
  detail: MasterFilterMetricDetail;
  chartData?: { date: string; close: number }[];
  compact?: boolean;
}

function statusClass(status: MasterFilterMetricDetail['status']) {
  if (status === 'PASS') return 'border-emerald-500/40 bg-emerald-500/5 text-emerald-300';
  if (status === 'WARNING') return 'border-amber-500/40 bg-amber-500/5 text-amber-300';
  return 'border-rose-500/40 bg-rose-500/5 text-rose-300';
}

function MetricCard({ detail, chartData, compact = false }: MetricCardProps) {
  const tone = statusClass(detail.status);
  return (
    <Card className={`border-2 ${tone} ${compact ? 'min-h-[190px]' : 'min-h-[260px]'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{detail.label}</p>
          <p className="mt-2 font-mono text-2xl font-black text-white">
            {detail.value}
            {detail.unit && <span className="ml-1 text-xs text-slate-500">{detail.unit}</span>}
          </p>
          <p className="mt-1 text-xs text-slate-500">기준: {detail.threshold}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-current px-2 py-1 text-xs font-bold">
          {detail.status === 'PASS' ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
          {detail.status}
        </div>
      </div>

      {typeof detail.score === 'number' && typeof detail.weight === 'number' && (
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>가중 점수</span>
            <span>
              {detail.score}/{detail.weight}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-lg bg-slate-800">
            <div className="h-full bg-emerald-500" style={{ width: `${Math.min((detail.score / detail.weight) * 100, 100)}%` }} />
          </div>
        </div>
      )}

      {chartData && !compact && (
        <div className="mt-4 h-24">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <Area type="monotone" dataKey="close" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} isAnimationActive={false} />
              <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 border-t border-slate-800 pt-3">
        <div className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span>{detail.description}</span>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-slate-600">{detail.source}</p>
      </div>
    </Card>
  );
}

export default function MetricsGrid() {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((item) => (
          <Card key={item} className="h-64 animate-pulse border-slate-700/50 bg-slate-800/30">
            <div />
          </Card>
        ))}
      </div>
    );
  }

  const { metrics } = data;
  const p3Cards = [metrics.ftd, metrics.distribution, metrics.newHighLow, metrics.above200d, metrics.sectorRotation].filter(
    (item): item is MasterFilterMetricDetail => Boolean(item)
  );

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">P3 Market Filter</p>
            <h2 className="mt-1 text-xl font-bold text-white">근거 기반 시장 점수판</h2>
          </div>
          <p className="font-mono text-3xl font-black text-white">{metrics.p3Score ?? Math.round(metrics.score * 20)}/100</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MetricCard detail={metrics.trend} chartData={metrics.spyHistory} />
        <MetricCard detail={metrics.breadth} chartData={metrics.spyHistory} />
        <MetricCard detail={metrics.volatility} chartData={metrics.vixHistory} />
        <MetricCard detail={metrics.liquidity} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {p3Cards.map((detail) => (
          <MetricCard key={detail.label} detail={detail} compact />
        ))}
        <MetricCard detail={metrics.leadership} compact />
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="mb-3 flex items-center gap-2 text-slate-300">
          <TrendingUp className="h-4 w-4 text-emerald-300" />
          <p className="text-sm font-bold">판정 사용법</p>
        </div>
        <div className="grid gap-3 text-sm leading-6 text-slate-400 md:grid-cols-3">
          <p>
            <strong className="text-emerald-300">GREEN</strong>: 돌파 후보를 적극 검토하되 피벗 근처 거래량과 손절폭을 확인합니다.
          </p>
          <p>
            <strong className="text-amber-300">YELLOW</strong>: 신규 진입 크기를 줄이고 실패한 돌파는 빠르게 정리합니다.
          </p>
          <p>
            <strong className="text-rose-300">RED</strong>: 현금 비중과 기존 포지션 방어를 우선합니다.
          </p>
        </div>
      </section>
    </div>
  );
}
