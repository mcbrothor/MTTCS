'use client';

import { useMarket } from '@/contexts/MarketContext';
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

export default function StatusCenter() {
  const { data, isLoading } = useMarket();

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl bg-slate-800/50 border border-slate-700/50">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-sm text-slate-400">마스터 필터 상태 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { state } = data;

  const stateConfig = {
    GREEN: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: <CheckCircle2 className="h-8 w-8 text-emerald-400" />,
      title: 'GREEN 국면 (BULL MARKET)',
      description: '시장 추세가 살아있습니다. 공격적인 SEPA 전략 운영 및 포지션 확대를 고려하세요.'
    },
    YELLOW: {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: <AlertTriangle className="h-8 w-8 text-amber-400" />,
      title: 'YELLOW 국면 (NEUTRAL)',
      description: '시장이 혼조세를 보입니다. 투자 비중을 50% 이하로 줄이고, 보유 종목의 손절선을 타이트하게 올리세요.'
    },
    RED: {
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      icon: <ShieldAlert className="h-8 w-8 text-rose-400" />,
      title: 'RED 국면 (BEAR MARKET)',
      description: '강력한 하락 징후가 포착되었습니다. 모든 신규 매수를 중단하고 계좌 보호를 위해 현금을 확보하십시오.'
    }
  };

  const config = stateConfig[state];

  return (
    <div className={`flex flex-col items-center justify-center gap-4 rounded-xl border p-6 text-center shadow-sm backdrop-blur-sm ${config.bg} ${config.border}`}>
      <div className="flex items-center gap-4">
        {config.icon}
        <h2 className={`text-2xl font-bold tracking-tight ${config.color}`}>
          {config.title}
        </h2>
      </div>
      <p className="max-w-xl text-slate-300">
        {config.description}
      </p>
    </div>
  );
}
