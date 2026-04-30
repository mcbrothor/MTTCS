'use client';

interface LLMBriefingProps {
  regime?: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF';
  asOf?: string;
  usNarrative?: string;
  krNarrative?: string;
}

const DEFAULT_US =
  'S&P 500이 50일·200일 이동평균선을 모두 상회하며 강세 흐름을 유지합니다. HYG/IEF 비율이 상승 중으로 하이일드 채권으로 자금이 유입되는 전형적인 Risk-ON 환경입니다. VIX가 정상 범위로 반도체·기술주를 중심으로 돌파 성공 확률이 높습니다.';

const DEFAULT_KR =
  'KOSPI는 50일선 하방에서 등락을 반복 중입니다. 달러 강세와 수출 우려가 지수에 부담으로 작용하고 있으나, 삼성전자·SK하이닉스 등 반도체 대형주는 HBM 수요 기대감으로 개별 강세가 지속됩니다.';

const REGIME_LABEL: Record<string, string> = {
  RISK_ON: 'RISK-ON',
  NEUTRAL: 'NEUTRAL',
  RISK_OFF: 'RISK-OFF',
};

const REGIME_COLOR: Record<string, string> = {
  RISK_ON: 'bg-emerald-500/12 border-emerald-400/20 text-emerald-300',
  NEUTRAL: 'bg-amber-500/12 border-amber-400/20 text-amber-300',
  RISK_OFF: 'bg-rose-500/12 border-rose-400/20 text-rose-300',
};

export default function LLMBriefing({
  regime = 'RISK_ON',
  asOf,
  usNarrative = DEFAULT_US,
  krNarrative = DEFAULT_KR,
}: LLMBriefingProps) {
  const regimeLabel = REGIME_LABEL[regime] ?? regime;
  const regimeCls = REGIME_COLOR[regime] ?? REGIME_COLOR.RISK_ON;

  return (
    <div className="rounded-xl border border-purple-400/20 bg-gradient-to-br from-purple-500/8 to-emerald-500/6 px-4 py-3.5">
      <div className="flex gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-purple-400/30 bg-purple-500/15 text-sm">
          ⚡
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold tracking-widest text-purple-300">
              AI MARKET BRIEFING
            </span>
            {asOf && (
              <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{asOf}</span>
            )}
            <span className={`rounded border px-1.5 py-px text-[9px] font-bold ${regimeCls}`}>
              {regimeLabel}
            </span>
          </div>
          <p className="mb-1.5 text-xs leading-relaxed text-[var(--text-primary)]">
            <strong className="text-purple-300">미국 시장:</strong>{' '}
            <span dangerouslySetInnerHTML={{ __html: usNarrative }} />
          </p>
          <p className="text-xs leading-relaxed text-[var(--text-primary)]">
            <strong className="text-purple-300">한국 시장:</strong>{' '}
            <span dangerouslySetInnerHTML={{ __html: krNarrative }} />
          </p>
        </div>
      </div>
    </div>
  );
}
