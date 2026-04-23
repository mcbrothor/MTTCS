'use client';

import { useMarket } from '@/contexts/MarketContext';

const STATE_STYLE = {
  GREEN: {
    icon: '✓',
    shell: 'border-emerald-400/20 bg-emerald-500/8 text-emerald-50',
    badge: 'border-emerald-400/25 bg-emerald-500/14 text-emerald-200',
    title: 'Risk-On Window',
    description: '추세 추종과 신규 진입을 시도할 수 있는 환경입니다.',
  },
  YELLOW: {
    icon: '!',
    shell: 'border-amber-400/24 bg-amber-500/10 text-amber-50',
    badge: 'border-amber-400/25 bg-amber-500/16 text-amber-200',
    title: 'Risk Reduced',
    description: '선별 진입과 포지션 축소가 필요한 경계 구간입니다.',
  },
  RED: {
    icon: 'X',
    shell: 'border-rose-400/24 bg-rose-500/10 text-rose-50',
    badge: 'border-rose-400/25 bg-rose-500/16 text-rose-200',
    title: 'Capital Defense',
    description: '신규 진입보다 현금 방어와 기존 포지션 관리가 우선입니다.',
  },
} as const;

export default function MarketBanner({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useMarket();

  if (isLoading || !data) return null;

  const style = STATE_STYLE[data.state];
  const updatedAt = data.metrics.updatedAt || data.metrics.meta.asOf;

  if (compact) {
    return (
      <div className={`rounded-xl border px-3 py-1.5 shadow-sm transition-all hover:bg-white/5 ${style.shell}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[10px] font-black ${style.badge}`}>
              {style.icon}
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tighter ${style.badge}`}>
                {data.state}
              </span>
              <span className="text-[11px] font-bold text-[var(--text-primary)]">
                {style.title}
              </span>
              <span className="hidden sm:inline text-[10px] text-[var(--text-tertiary)] opacity-60">— {style.description}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-tighter text-[var(--text-tertiary)]">Score</span>
              <span className="font-mono text-[11px] font-black text-[var(--text-primary)]">{data.metrics.score}/100</span>
            </div>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-tighter text-[var(--text-tertiary)]">Updated</span>
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                {updatedAt ? new Date(updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-[22px] border px-4 py-4 shadow-[var(--panel-shadow)] ${style.shell}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${style.badge}`}>
            <span className="text-base font-bold">{style.icon}</span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${style.badge}`}>
                {data.state}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                {data.market} Market
              </span>
            </div>
            <h2 className="mt-2 text-base font-semibold text-[var(--text-primary)]">{style.title}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{style.description}</p>
          </div>
        </div>

        <div className="grid gap-2 text-sm md:min-w-[320px]">
          <div className="flex items-center justify-between rounded-2xl border border-white/6 bg-black/10 px-3 py-2">
            <span className="text-[var(--text-secondary)]">Master Filter Score</span>
            <span className="font-mono font-semibold text-[var(--text-primary)]">
              {data.metrics.score}/100
            </span>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/6 bg-black/10 px-3 py-2">
            <span className="text-[var(--text-secondary)]">Updated</span>
            <span className="font-mono text-xs text-[var(--text-primary)]">
              {updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : '--'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/6 bg-black/10 px-3 py-2.5 text-sm text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--text-primary)]">시장 메모</span>
        <span className="line-clamp-2">상세 LLM 브리핑은 시장 분석 메뉴에서 확인할 수 있습니다.</span>
      </div>
    </div>
  );
}
