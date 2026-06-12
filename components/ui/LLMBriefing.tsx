'use client';

import { Bot, Database } from 'lucide-react';
import { useMarket } from '@/contexts/MarketContext';
import { friendlyMacroRegimeLabel } from '@/lib/market-display';
import type { MacroRegime } from '@/types';

interface LLMBriefingProps {
  regime?: MacroRegime | null;
  asOf?: string;
  usNarrative?: string;
  krNarrative?: string;
}

const REGIME_LABEL: Record<MacroRegime | 'DATA_CHECK', string> = {
  RISK_ON: friendlyMacroRegimeLabel('RISK_ON'),
  NEUTRAL: friendlyMacroRegimeLabel('NEUTRAL'),
  RISK_OFF: friendlyMacroRegimeLabel('RISK_OFF'),
  DATA_CHECK: friendlyMacroRegimeLabel('DATA_CHECK'),
};

const REGIME_COLOR: Record<MacroRegime | 'DATA_CHECK', string> = {
  RISK_ON: 'bg-emerald-500/12 border-emerald-400/20 text-emerald-300',
  NEUTRAL: 'bg-amber-500/12 border-amber-400/20 text-amber-300',
  RISK_OFF: 'bg-rose-500/12 border-rose-400/20 text-rose-300',
  DATA_CHECK: 'bg-sky-500/12 border-sky-400/20 text-sky-300',
};

function buildDefaultNarrative({
  state,
  score,
  macroRegime,
  isStale,
}: {
  state?: string;
  score?: number;
  macroRegime: MacroRegime | null;
  isStale: boolean;
}) {
  if (isStale || state === 'GREY') {
    return {
      label: 'DATA_CHECK' as const,
      us:
        '현재 진입 가능 신호 또는 큰 흐름 데이터가 완전하지 않습니다. 시장이 나쁘다는 뜻이 아니라 판단을 잠시 보류해야 하는 상태입니다.',
      kr:
        '한국 시장도 데이터 신뢰도 확인이 우선입니다. 지수·환율·수급 데이터가 정상화된 뒤 추세, 함께 오르는 종목 비율, 강한 업종을 다시 확인합니다.',
    };
  }

  if (state === 'RED') {
    return {
      label: macroRegime ?? 'RISK_OFF',
      us:
        '진입 가능 신호가 위험 구간입니다. 큰 흐름이 일부 우호적이어도 새 매수보다 현금 방어, 손절선 준수, 기존 포지션 축소 여부가 우선입니다.',
      kr:
        '한국 시장은 지수 추세와 환율·수급 민감도가 함께 악화될 수 있으므로 반도체 대형주 강세만으로 시장 전체 진입 허용을 판단하면 안 됩니다.',
    };
  }

  if (state === 'YELLOW') {
    return {
      label: macroRegime ?? 'NEUTRAL',
      us:
        `진입 가능 신호가 아직 애매합니다${typeof score === 'number' ? ` · 시장 건강 점수 ${score}/100` : ''}. 추세가 완전히 회복되기 전까지 새 매수는 보류하고 기존 포지션 관리에 집중합니다.`,
      kr:
        '한국 시장은 개별 주도주가 살아 있더라도 함께 오르는 종목 비율과 외국인 수급 확인이 필요합니다. 종목 발굴은 가능하지만 매수 실행은 진입 가능 신호 회복 이후로 미룹니다.',
    };
  }

  return {
    label: macroRegime ?? 'NEUTRAL',
    us:
      '진입 가능 신호가 좋으면 종목 발굴을 진행할 수 있습니다. 다만 큰 흐름이 조심 구간이거나 애매하면 투자 비중과 추가 매수 속도를 낮춰야 합니다.',
    kr:
      '한국 시장은 지수 추세, 원/달러, 외국인 수급, 반도체·2차전지 등 리더십의 폭을 함께 확인해 공격성을 조절합니다.',
  };
}

export default function LLMBriefing({
  regime,
  asOf,
  usNarrative,
  krNarrative,
}: LLMBriefingProps) {
  const { data, isStale, macroRegime } = useMarket();
  const generated = buildDefaultNarrative({
    state: data?.state,
    score: data?.metrics.p3Score,
    macroRegime: regime ?? macroRegime,
    isStale,
  });
  const label = generated.label;
  const displayAsOf = asOf ?? data?.metrics.meta.asOf;
  const regimeCls = REGIME_COLOR[label];

  return (
    <section className="rounded-xl border border-sky-400/20 bg-slate-950/60 px-4 py-3.5">
      <div className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-500/10">
          {label === 'DATA_CHECK' ? (
            <Database className="h-4 w-4 text-sky-300" />
          ) : (
            <Bot className="h-4 w-4 text-sky-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold tracking-widest text-sky-300">
              오늘 시장 브리핑
            </span>
            {displayAsOf && (
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
                {new Date(displayAsOf).toLocaleString('ko-KR')}
              </span>
            )}
            <span className={`rounded border px-1.5 py-px text-[9px] font-bold ${regimeCls}`}>
              {REGIME_LABEL[label]}
            </span>
          </div>
          <p className="mb-1.5 text-xs leading-relaxed text-[var(--text-primary)]">
            <strong className="text-sky-300">미국 시장:</strong>{' '}
            {usNarrative ?? generated.us}
          </p>
          <p className="text-xs leading-relaxed text-[var(--text-primary)]">
            <strong className="text-sky-300">한국 시장:</strong>{' '}
            {krNarrative ?? generated.kr}
          </p>
        </div>
      </div>
    </section>
  );
}
