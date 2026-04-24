'use client';

import type { ReactNode } from 'react';
import { Activity, DollarSign, ShieldCheck, Target, TrendingUp, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import HelpButton from '@/components/ui/HelpButton';

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
            helpTooltip="완료된 매매 중 수익이 난 매매의 비율. 단독으로는 시스템 평가 불충분 — 기대값과 함께 봐야 합니다."
          />
          <Metric
            icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
            label="누적 손익"
            value={formatMoney(totalPnL, market)}
            border="border-t-emerald-500"
            valueClass={totalPnL >= 0 ? 'text-emerald-500' : 'text-coral-red'}
            delay={0.1}
            helpTooltip="완료된 모든 매매의 실현 손익 합계입니다."
          />
          <Metric
            icon={<Target className="h-5 w-5 text-lime-400" />}
            label="평균 R-Multiple"
            value={`${avgRMultiple.toFixed(2)}R`}
            border="border-t-lime-400"
            delay={0.2}
            helpTooltip="1R = 최초 손절 금액. 평균 R이 양수이면 수익 매매가 손실 매매보다 크다는 의미입니다."
          />
          <Metric
            icon={<TrendingUp className="h-5 w-5 text-fuchsia-400" />}
            label="매매 기대값"
            value={`${expectancyR.toFixed(2)}R`}
            border="border-t-fuchsia-400"
            delay={0.3}
            helpTooltip="(승률 × 평균수익R) − (패률 × 평균손실R). 양수면 장기적으로 이기는 시스템."
            helpFormula="E = (WR × AvgWin) − (LR × AvgLoss)"
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
              helpTooltip="각 매매 복기에서 체크리스트 준수 항목을 0~10점으로 환산한 자기평가 점수. 8점 이상이 목표."
            />
            <Metric
              icon={<ShieldCheck className="h-5 w-5 text-cyan-400" />}
              label="계획 준수율"
              value={`${planAdherenceRate.toFixed(1)}%`}
              border="border-t-cyan-400"
              delay={0.5}
              helpTooltip="진입·손절·목표가를 매매 계획대로 실행한 비율. 80% 이상이 목표."
            />
            <Metric
              icon={<ShieldCheck className="h-5 w-5 text-emerald-300" />}
              label="SEPA 통과율"
              value={`${sepaPassRate.toFixed(1)}%`}
              border="border-t-emerald-300"
              delay={0.6}
              helpTooltip="진입 당시 SEPA 8개 조건을 모두 통과한 매매의 비율. 높을수록 진입 기준을 잘 지키고 있습니다."
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
              helpTooltip="현재 활성 포지션에서 손절가까지 하락 시 최대 손실 금액 합계. 총 자산의 5% 이하를 유지하세요."
            />
            <Metric
              icon={<Activity className="h-5 w-5 text-sky-400" />}
              label="진행 중 계획"
              value={String(plannedCount)}
              border="border-t-sky-400"
              delay={0.8}
              helpTooltip="PLANNED 상태의 매매 계획 수. 시장 YELLOW/RED시 신규 계획을 추가하지 않는 것이 권장됩니다."
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
  helpTooltip,
  helpFormula,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  border: string;
  valueClass?: string;
  delay?: number;
  helpTooltip?: string;
  helpFormula?: string;
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
        <div className="mb-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {label}
          {helpTooltip && (
            <HelpButton label={label} tooltip={helpTooltip} formula={helpFormula} />
          )}
        </div>
        <div className={`font-mono text-2xl font-black tracking-tight ${valueClass}`}>{value}</div>
      </Card>
    </motion.div>
  );
}

