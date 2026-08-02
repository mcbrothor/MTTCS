'use client';

import InsightLog from '@/components/master-filter/InsightLog';
import MetricsGrid from '@/components/master-filter/MetricsGrid';
import DecisionBox from '@/components/master-filter/DecisionBox';
import EarlyWarningPanel from '@/components/master-filter/EarlyWarningPanel';
import MacroCompactWidget from '@/components/master-filter/MacroCompactWidget';
import RiskBarometerCompactWidget from '@/components/master-filter/RiskBarometerCompactWidget';
import LLMBriefing from '@/components/ui/LLMBriefing';
import { useMarket } from '@/contexts/MarketContext';

export default function MasterFilterPage() {
  const { market, setMarket, data } = useMarket();
  const updatedAt = data?.metrics.updatedAt || data?.metrics.meta.asOf;

  return (
    <div className="space-y-4 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-500">
            1단계 · 시장 판단
          </p>
          <h1 className="text-[20px] font-extrabold leading-[1.2] text-[var(--text-primary)]">
            오늘의 결론과 위험 조기경보
          </h1>
          <p className="mt-2 hidden max-w-[620px] text-xs leading-[1.6] text-[var(--text-secondary)] sm:block">
            지금 새로 사도 되는지, 위험이 커지는지, 돈이 시장 안에 남아 있는지 순서대로 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-[7px] border border-[var(--border)] bg-[var(--surface-soft)] p-1">
            <button
              onClick={() => setMarket('US')}
              aria-pressed={market === 'US'}
              aria-label="미국 시장 보기"
              className={`rounded-[5px] border-none px-3.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                market === 'US' ? 'bg-[rgba(122,143,181,0.26)] text-[var(--text-primary)]' : 'bg-transparent text-[var(--text-secondary)]'
              }`}
            >
              미국
            </button>
            <button
              onClick={() => setMarket('KR')}
              aria-pressed={market === 'KR'}
              aria-label="한국 시장 보기"
              className={`rounded-[5px] border-none px-3.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                market === 'KR' ? 'bg-[rgba(122,143,181,0.26)] text-[var(--text-primary)]' : 'bg-transparent text-[var(--text-secondary)]'
              }`}
            >
              한국
            </button>
          </div>
          
          <div className="text-right">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-[var(--text-tertiary)]">데이터 기준 시각</p>
            <p className="mt-1 font-mono text-xs font-semibold text-[var(--text-primary)]">
              {updatedAt ? new Date(updatedAt).toLocaleString('ko-KR') : '--'}
            </p>
          </div>
        </div>
      </header>

      <nav
        aria-label="마스터필터 화면 읽는 순서"
        className="flex items-center gap-1.5 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] p-1.5 text-[10px] text-[var(--text-secondary)]"
      >
        <span className="shrink-0 px-2 font-bold text-[var(--text-primary)]">화면 읽는 순서</span>
        {[
          ['#today-decision', '1. 오늘 할 일'],
          ['#early-warning', '2. 위험 신호'],
          ['#market-health', '3. 시장 건강'],
          ['#outside-risk', '4. 시장 밖 위험'],
          ['#data-briefing', '5. 데이터 설명'],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="shrink-0 rounded-md px-2.5 py-1.5 transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {label}
          </a>
        ))}
      </nav>

      <div id="today-decision" className="scroll-mt-24">
        <DecisionBox />
      </div>
      <div id="early-warning" className="scroll-mt-24">
        <EarlyWarningPanel />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <section id="market-health" className="scroll-mt-24 space-y-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] text-emerald-400">3. 시장 내부 건강도</p>
            <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">지금 새로 사도 되는지</h2>
          </div>
          <MetricsGrid />
        </section>

        <aside id="outside-risk" className="scroll-mt-24 space-y-4">
          <div>
            <p className="text-[10px] font-bold tracking-[0.12em] text-sky-300">4. 시장 밖 위험</p>
            <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">위험이 커지는지</h2>
          </div>
          <MacroCompactWidget />
          <RiskBarometerCompactWidget />
          <LLMBriefing />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 shadow-[var(--panel-shadow)]">
            <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">운용 가이드라인</h3>
            <div className="space-y-2 text-xs leading-5 text-[var(--text-secondary)]">
              <p><span className="font-semibold text-emerald-300">진입 가능:</span> 후보 종목을 검토하되 시장 밖 위험에 따라 새 매수 비중을 조절합니다.</p>
              <p><span className="font-semibold text-amber-300">신규 매수 보류:</span> 기존 포지션 손절선과 시장 폭 회복 여부를 확인합니다.</p>
              <p><span className="font-semibold text-rose-300">신규 매수 금지:</span> 현금 비중 확대와 기존 포지션 방어가 우선입니다.</p>
            </div>
          </div>
        </aside>
      </div>

      <section id="data-briefing" className="scroll-mt-24 space-y-3">
        <div>
          <p className="text-[10px] font-bold tracking-[0.12em] text-sky-300">5. 데이터 설명</p>
          <h2 className="mt-1 text-base font-bold text-[var(--text-primary)]">브리핑과 데이터 신뢰도</h2>
        </div>
        <InsightLog />
      </section>
    </div>
  );
}
