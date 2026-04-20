'use client';

import { AlertTriangle, CheckCircle2, Globe, ShieldAlert } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';

export default function StatusCenter() {
  const { data, isLoading, error } = useMarket();

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-slate-800/50 bg-slate-900/50 backdrop-blur-md">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Master Filter 동기화 중</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const stateConfig = {
    GREEN: {
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      icon: <CheckCircle2 className="h-10 w-10 text-emerald-400" />,
      title: 'GREEN 구간',
      subtitle: '공격 가능한 상승장',
      description:
        '시장 추세와 내부 강도가 우호적입니다. SEPA/VCP 후보는 피벗 근처의 거래량과 리스크 금액을 확인한 뒤 계획대로 진입할 수 있습니다.',
      accent: 'bg-emerald-500/30',
    },
    YELLOW: {
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: <AlertTriangle className="h-10 w-10 text-amber-400" />,
      title: 'YELLOW 구간',
      subtitle: '중립 또는 경계',
      description:
        '상승 시도는 가능하지만 일부 지표가 불완전합니다. 신규 진입 규모를 줄이고 손절선과 실패 조건을 더 촘촘하게 관리하세요.',
      accent: 'bg-amber-500/30',
    },
    RED: {
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      icon: <ShieldAlert className="h-10 w-10 text-rose-400" />,
      title: 'RED 구간',
      subtitle: '방어 우선 하락장',
      description:
        '시장 압력이 높습니다. 신규 매수보다 현금 비중 확대, 보유 종목 손절선 준수, 포트폴리오 리스크 축소를 우선하세요.',
      accent: 'bg-rose-500/30',
    },
  } as const;

  const config = stateConfig[data.state];
  const updatedAt = data.metrics.updatedAt ? new Date(data.metrics.updatedAt).toLocaleString('ko-KR') : '확인 불가';

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border p-8 text-center shadow-2xl backdrop-blur-md transition-all duration-700 ${config.bg} ${config.border}`}
    >
      <div className={`absolute -left-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-3xl ${config.accent}`} />

      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="rounded-full border border-slate-700/50 bg-slate-900/50 p-3 shadow-inner">{config.icon}</div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{config.subtitle}</p>
          <h2 className={`mb-2 mt-1 text-3xl font-black tracking-tight ${config.color}`}>{config.title}</h2>
          <p className="max-w-xl text-sm font-medium leading-relaxed text-slate-300">{config.description}</p>
        </div>
      </div>

      <div className="relative z-10 mt-3 flex flex-wrap justify-center gap-2">
        {[data.metrics.trend, data.metrics.breadth, data.metrics.volatility, data.metrics.liquidity].map((m) => (
          <span
            key={m.label}
            className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase
              ${
                m.status === 'PASS'
                  ? 'border-emerald-500/40 text-emerald-300'
                  : m.status === 'WARNING'
                    ? 'border-amber-500/40 text-amber-300'
                    : 'border-rose-500/40 text-rose-300'
              }`}
          >
            {m.label} · {m.status}
          </span>
        ))}
        <span className="rounded-full border border-slate-700 bg-slate-900/50 px-3 py-1 text-[10px] font-bold text-slate-300">
          P3 {data.metrics.p3Score ?? 0}/100
        </span>
      </div>

      <div className="relative z-10 mt-2 flex flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-slate-800/80 bg-slate-900/40 px-3 py-1">
          <Globe className="h-3 w-3 text-slate-500" />
          <span className="text-[10px] font-bold uppercase tracking-tight text-slate-500">
            Yahoo Finance 지연 데이터 · 기준 시각 {updatedAt}
          </span>
        </div>
        {error && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[10px] font-bold text-amber-300">
            일부 데이터는 fallback 상태입니다.
          </span>
        )}
      </div>
    </div>
  );
}
