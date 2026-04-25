'use client';

import InsightLog from '@/components/master-filter/InsightLog';
import MetricsGrid from '@/components/master-filter/MetricsGrid';
import StatusCenter from '@/components/master-filter/StatusCenter';
import DecisionBox from '@/components/master-filter/DecisionBox';
import MacroCompactWidget from '@/components/master-filter/MacroCompactWidget';
import MarketBanner from '@/components/ui/MarketBanner';
import { useMarket } from '@/contexts/MarketContext';

export default function MasterFilterPage() {
  const { market, setMarket, data } = useMarket();
  const updatedAt = data?.metrics.updatedAt || data?.metrics.meta.asOf;

  return (
    <div className="space-y-6 pb-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-6">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-500">
            STEP 01 · 시장 분석 / 마스터 필터
          </p>
          <h1 className="text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--text-primary)]">
            마스터 필터
          </h1>
          <p className="mt-2 max-w-[580px] text-xs leading-[1.6] text-[var(--text-secondary)]">
            FTD, 분산일, 내부 강도, 200일선 참여율 등 여러 지표를 조합하여 시장 기류를 점수화합니다. GREEN 구간이 아니면 신규 진입을 자제하거나 비중을 줄이는 것이 원칙입니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
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
              onClick={() => setMarket('KR_KOSPI')}
              className={`rounded-[5px] border-none px-3.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                (market === 'KR' || market === 'KR_KOSPI') ? 'bg-[rgba(122,143,181,0.26)] text-[var(--text-primary)]' : 'bg-transparent text-[var(--text-secondary)]'
              }`}
            >
              🇰🇷 KOSPI
            </button>
            <button
              onClick={() => setMarket('KR_KOSDAQ')}
              className={`rounded-[5px] border-none px-3.5 py-1.5 text-[11px] font-semibold cursor-pointer transition-colors ${
                market === 'KR_KOSDAQ' ? 'bg-[rgba(122,143,181,0.26)] text-[var(--text-primary)]' : 'bg-transparent text-[var(--text-secondary)]'
              }`}
            >
              🇰🇷 KOSDAQ
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

      {/* Decision Box — 가장 먼저, 오늘의 진입 결정 */}
      <DecisionBox />

      <MarketBanner />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left Sidebar: Status, Log, Macro Widget, Guidelines */}
        <div className="flex flex-col gap-6 lg:w-[320px] xl:w-[360px] shrink-0">
          <StatusCenter />
          <MacroCompactWidget />
          <InsightLog />
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface-strong)] p-6 shadow-[var(--panel-shadow)]">
            <h3 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">운용 가이드라인</h3>
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              <li className="flex gap-2">
                <span className="font-semibold text-emerald-300">GREEN:</span>
                신규 진입 가능. 매크로 레짐에 따라 비중(50–100%)을 조절하세요.
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-amber-300 whitespace-nowrap">신규 진입 보류:</span>
                기존 포지션만 유지하고 손절선을 점검하세요. GREEN 회복 시 재진입을 준비합니다.
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-rose-300">RED:</span>
                신규 매수 금지. 현금 비중 확대와 보유 종목 손절선 준수가 최우선입니다.
              </li>
            </ul>
          </div>
        </div>

        {/* Right Content: Metrics Grid */}
        <div className="flex-1 min-w-0">
          <MetricsGrid />
        </div>
      </div>
    </div>
  );
}
