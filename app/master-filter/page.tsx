'use client';

import InsightLog from '@/components/master-filter/InsightLog';
import MetricsGrid from '@/components/master-filter/MetricsGrid';
import DecisionBox from '@/components/master-filter/DecisionBox';
import MacroCompactWidget from '@/components/master-filter/MacroCompactWidget';
import LLMBriefing from '@/components/ui/LLMBriefing';
import { useMarket } from '@/contexts/MarketContext';

export default function MasterFilterPage() {
  const { market, setMarket, data } = useMarket();
  const updatedAt = data?.metrics?.updatedAt || data?.metrics?.meta?.asOf;

  return (
    <div className="space-y-4 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-500">
            STEP 01 · 시장 분석 / 마스터 필터
          </p>
          <h1 className="text-[20px] font-extrabold leading-[1.2] text-[var(--text-primary)]">
            마스터 필터
          </h1>
          <p className="mt-2 hidden max-w-[620px] text-xs leading-[1.6] text-[var(--text-secondary)] sm:block">
            FTD, 분산일, 내부 강도, 200일선 참여율 등 여러 지표를 조합하여 시장 기류를 점수화합니다. GREEN 구간이 아니면 신규 진입을 자제하거나 비중을 줄이는 것이 원칙입니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-[7px] border border-[var(--border)] bg-[var(--surface-soft)] p-1">
            <button
              onClick={() => setMarket('US')}
              className={`rounded-[5px] border-none px-3.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                market === 'US' ? 'bg-[rgba(122,143,181,0.26)] text-[var(--text-primary)]' : 'bg-transparent text-[var(--text-secondary)]'
              }`}
            >
              🇺🇸 미국
            </button>
            <button
              onClick={() => setMarket('KR')}
              className={`rounded-[5px] border-none px-3.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                market === 'KR' ? 'bg-[rgba(122,143,181,0.26)] text-[var(--text-primary)]' : 'bg-transparent text-[var(--text-secondary)]'
              }`}
            >
              🇰🇷 한국
            </button>
          </div>
          
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Updated</p>
            <p className="mt-1 font-mono text-xs font-semibold text-[var(--text-primary)]">
              {updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : '--'}
            </p>
          </div>
        </div>
      </header>

      <DecisionBox />

      <LLMBriefing />

      <MetricsGrid />

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr_1fr]">
        <MacroCompactWidget />
        <InsightLog />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-[var(--panel-shadow)]">
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">운용 가이드라인</h3>
          <div className="space-y-2 text-xs leading-5 text-[var(--text-secondary)]">
            <p><span className="font-semibold text-emerald-300">GREEN:</span> 신규 진입 가능. 매크로 레짐에 따라 50-100% 범위에서 비중을 조절합니다.</p>
            <p><span className="font-semibold text-amber-300">YELLOW:</span> 신규 진입 보류. 기존 포지션 손절선과 시장폭 회복 여부를 확인합니다.</p>
            <p><span className="font-semibold text-rose-300">RED:</span> 신규 매수 금지. 현금 비중 확대와 기존 포지션 방어가 우선입니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
