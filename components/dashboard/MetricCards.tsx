'use client';

import type { ReactNode } from 'react';
import { Activity, DollarSign, ShieldCheck, Target, TrendingUp, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';

interface MetricCardsProps {
  winRate: number;
  totalPnL: number;
  avgRMultiple: number;
  expectancyR: number;
  openRisk: number;
  planAdherenceRate: number;
  avgDiscipline: number;
  plannedCount: number;
  sepaPassRate: number;
  market?: 'US' | 'KR';
}

function formatMoney(value: number, market: 'US' | 'KR') {
  const sign = value >= 0 ? '+' : '';
  if (market === 'US') return `${sign}$${value.toFixed(2)}`;
  return `${sign}${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatRisk(value: number, market: 'US' | 'KR') {
  if (market === 'US') return `$${value.toFixed(2)}`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

export default function MetricCards({
  winRate,
  totalPnL,
  avgRMultiple,
  expectancyR,
  openRisk,
  planAdherenceRate,
  avgDiscipline,
  plannedCount,
  sepaPassRate,
  market = 'US',
}: MetricCardsProps) {
  return (
    <div className="space-y-6">
      {/* Performance Highlights */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-emerald-400" />
          <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Performance Metrics</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            icon={<Activity className="h-5 w-5 text-electric-blue" />}
            label="승률"
            value={`${winRate.toFixed(1)}%`}
            border="border-t-electric-blue"
            delay={0}
          />
          <Metric
            icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
            label="누적 손익"
            value={formatMoney(totalPnL, market)}
            border="border-t-emerald-500"
            valueClass={totalPnL >= 0 ? 'text-emerald-500' : 'text-coral-red'}
            delay={0.1}
          />
          <Metric
            icon={<Target className="h-5 w-5 text-lime-400" />}
            label="평균 R-Multiple"
            value={`${avgRMultiple.toFixed(2)}R`}
            border="border-t-lime-400"
            delay={0.2}
          />
          <Metric
            icon={<TrendingUp className="h-5 w-5 text-fuchsia-400" />}
            label="매매 기대값"
            value={`${expectancyR.toFixed(2)}R`}
            border="border-t-fuchsia-400"
            delay={0.3}
          />
        </div>
      </section>

      {/* Discipline & Risk */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Discipline & Adherence</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Metric
              icon={<TrendingUp className="h-5 w-5 text-amber-500" />}
              label="평균 규칙 점수"
              value={`${avgDiscipline.toFixed(1)}pt`}
              border="border-t-amber-500"
              valueClass="text-amber-500"
              delay={0.4}
            />
            <Metric
              icon={<ShieldCheck className="h-5 w-5 text-cyan-400" />}
              label="계획 준수율"
              value={`${planAdherenceRate.toFixed(1)}%`}
              border="border-t-cyan-400"
              delay={0.5}
            />
            <Metric
              icon={<ShieldCheck className="h-5 w-5 text-emerald-300" />}
              label="SEPA 통과율"
              value={`${sepaPassRate.toFixed(1)}%`}
              border="border-t-emerald-300"
              delay={0.6}
            />
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-sky-400" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Exposure & Pipeline</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Metric
              icon={<Activity className="h-5 w-5 text-orange-400" />}
              label="오픈 리스크"
              value={formatRisk(openRisk, market)}
              border="border-t-orange-400"
              valueClass="text-orange-300"
              delay={0.7}
            />
            <Metric
              icon={<Activity className="h-5 w-5 text-sky-400" />}
              label="진행 중 계획"
              value={String(plannedCount)}
              border="border-t-sky-400"
              delay={0.8}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  border,
  valueClass = 'text-white',
  delay = 0,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  border: string;
  valueClass?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <Card glow className={`group relative h-full border-t-4 text-center transition-all hover:-translate-y-1 hover:shadow-2xl ${border}`}>
        <div className="mb-3 flex justify-center">
          <div className="rounded-full bg-white/5 p-2 transition-transform group-hover:scale-110 group-hover:bg-white/10">
            {icon}
          </div>
        </div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`font-mono text-2xl font-black tracking-tight ${valueClass}`}>{value}</div>
      </Card>
    </motion.div>
  );
}

