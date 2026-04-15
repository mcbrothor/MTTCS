'use client';

import { useMarket } from '@/contexts/MarketContext';
import { AlertTriangle, CheckCircle2, ShieldAlert, Globe } from 'lucide-react';

export default function StatusCenter() {
  const { data, isLoading } = useMarket();

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl bg-slate-900/50 border border-slate-800/50 backdrop-blur-md">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-indigo-500 border-t-transparent" />
          <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">Master Filter Synchronizing...</p>
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
      icon: <CheckCircle2 className="h-10 w-10 text-emerald-400" />,
      title: 'GREEN 국면 (BULL MARKET)',
      description: '시장 추세가 강력하게 살아있습니다. 공격적인 SEPA 전략 운영 및 신규 포지션 확대를 적극 고려하십시오.',
      accent: 'bg-emerald-500/30'
    },
    YELLOW: {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: <AlertTriangle className="h-10 w-10 text-amber-400" />,
      title: 'YELLOW 국면 (NEUTRAL / CAUTION)',
      description: '시장의 힘이 분산되고 혼조세를 보입니다. 투자 비중을 50% 이하로 줄이고, 보유 종목의 손절선을 타이트하게 상향 조정하십시오.',
      accent: 'bg-amber-500/30'
    },
    RED: {
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      icon: <ShieldAlert className="h-10 w-10 text-rose-400" />,
      title: 'RED 국면 (BEAR MARKET)',
      description: '강력한 하락 위험이 감지되었습니다. 모든 신규 매수를 중단하고 계좌 보호를 위해 현금 비중을 80% 이상으로 상향하십시오.',
      accent: 'bg-rose-500/30'
    }
  };

  const config = stateConfig[state];

  return (
    <div className={`relative flex flex-col items-center justify-center gap-4 rounded-2xl border p-8 text-center shadow-2xl transition-all duration-700 backdrop-blur-md overflow-hidden ${config.bg} ${config.border}`}>
      {/* Decorative Glow */}
      <div className={`absolute -top-12 -left-12 w-32 h-32 blur-3xl rounded-full opacity-20 ${config.accent}`} />
      
      <div className="flex flex-col items-center gap-4 relative z-10">
        <div className="p-3 rounded-full bg-slate-900/50 border border-slate-700/50 shadow-inner">
          {config.icon}
        </div>
        <div>
          <h2 className={`text-3xl font-black tracking-tight mb-2 ${config.color}`}>
            {config.title}
          </h2>
          <p className="max-w-xl text-slate-300 text-sm leading-relaxed font-medium">
            {config.description}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 relative z-10">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/40 border border-slate-800/80">
          <Globe className="h-3 w-3 text-slate-500" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">
            Data Source: Yahoo Finance (Delayed 15m)
          </span>
        </div>
      </div>
    </div>
  );
}
