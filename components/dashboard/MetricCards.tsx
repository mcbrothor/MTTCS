import type { ReactNode } from 'react';
import Card from '@/components/ui/Card';
import { Activity, DollarSign, ShieldCheck, Target, TrendingUp } from 'lucide-react';

interface MetricCardsProps {
  winRate: number;
  totalPnL: number;
  avgDiscipline: number;
  plannedCount: number;
  sepaPassRate: number;
}

export default function MetricCards({ winRate, totalPnL, avgDiscipline, plannedCount, sepaPassRate }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
      <Metric icon={<Target className="h-6 w-6 text-electric-blue" />} label="승률" value={`${winRate.toFixed(1)}%`} border="border-t-electric-blue" />
      <Metric
        icon={<DollarSign className="h-6 w-6 text-emerald-500" />}
        label="누적 손익"
        value={`${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`}
        border="border-t-emerald-500"
        valueClass={totalPnL >= 0 ? 'text-emerald-500' : 'text-coral-red'}
      />
      <Metric icon={<TrendingUp className="h-6 w-6 text-amber-500" />} label="평균 규율 점수" value={`${avgDiscipline.toFixed(1)}pt`} border="border-t-amber-500" valueClass="text-amber-500" />
      <Metric icon={<Activity className="h-6 w-6 text-sky-400" />} label="진행 중 계획" value={String(plannedCount)} border="border-t-sky-400" />
      <Metric icon={<ShieldCheck className="h-6 w-6 text-emerald-300" />} label="SEPA 통과율" value={`${sepaPassRate.toFixed(1)}%`} border="border-t-emerald-300" />
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  border,
  valueClass = 'text-white',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  border: string;
  valueClass?: string;
}) {
  return (
    <Card glow className={`text-center group border-t-4 ${border}`}>
      <div className="mb-2 flex justify-center transition-transform group-hover:scale-110">{icon}</div>
      <div className="mb-1 text-sm font-medium text-slate-400">{label}</div>
      <div className={`font-mono text-3xl font-bold ${valueClass}`}>{value}</div>
    </Card>
  );
}
