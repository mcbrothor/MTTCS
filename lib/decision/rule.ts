import type { MacroRegime } from '@/lib/macro/compute';

export type Decision = 'GO_FULL' | 'GO_75' | 'GO_50' | 'NO_GO_HOLD' | 'NO_GO';

export interface DecisionResult {
  decision: Decision;
  sizeMultiplier: 0 | 0.5 | 0.75 | 1.0;
  headline: string;
  reason: string;
  blockingFactors: string[];
  actionLabel: string;
}

export type RiskBarometerBand = 'LOW' | 'CAUTION' | 'HIGH';

export interface ReasonContext {
  distributionDays?: number;
  ftd?: boolean;
  vix?: number;
  riskBarometerScore?: number;
  riskBarometerBand?: RiskBarometerBand;
}

function buildReason(
  mfState: 'GREEN' | 'YELLOW' | 'RED' | 'GREY',
  macroRegime: MacroRegime | null,
  ctx?: ReasonContext
): string {
  const parts: string[] = [`MF ${mfState}`];
  if (ctx?.distributionDays !== undefined) parts.push(`분산일 ${ctx.distributionDays}`);
  if (ctx?.vix !== undefined) parts.push(`VIX ${ctx.vix.toFixed(1)}`);
  if (ctx?.riskBarometerBand) {
    parts.push(`과열지표 ${ctx.riskBarometerBand}${ctx.riskBarometerScore !== undefined ? `(${ctx.riskBarometerScore})` : ''}`);
  }
  if (macroRegime) parts.push(`Macro ${macroRegime.replace('_', '-')}`);
  return parts.join(' · ');
}

/**
 * 추세추종 위계 기반 진입 결정 룰
 *
 * 위계:
 *   1. Master Filter(게이트) — RED/YELLOW이면 Macro 무관하게 NO-GO
 *   2. Macro & Risk Barometer(사이즈 modifier) — GREEN일 때 종합 적용
 *
 * 결정 매트릭스:
 *   MF RED            → NO_GO    (0x)   — Macro 무관
 *   MF YELLOW         → NO_GO_HOLD (0x) — 신규 진입 금지, 기존 포지션만 유지
 *   MF GREY           → NO_GO_HOLD (0x) — 데이터 부족/지연, 신규 진입 보류
 *   MF GREEN + RISK_ON  → GO_FULL (1.0x) (단, Risk Barometer HIGH면 GO_50, CAUTION이면 GO_75)
 *   MF GREEN + NEUTRAL  → GO_75   (0.75x) (단, Risk Barometer HIGH면 GO_50)
 *   MF GREEN + RISK_OFF → GO_50   (0.5x)
 *   MF GREEN + null     → GO_75   (0.75x, 보수적 기본)
 */
export function computeDecision(
  mfState: 'GREEN' | 'YELLOW' | 'RED' | 'GREY',
  macroRegime: MacroRegime | null,
  ctx?: ReasonContext
): DecisionResult {
  const reason = buildReason(mfState, macroRegime, ctx);

  if (mfState === 'GREY') {
    return {
      decision: 'NO_GO_HOLD',
      sizeMultiplier: 0,
      headline: 'NO-GO · 데이터 부족',
      reason,
      blockingFactors: ['마스터 필터 GREY — 데이터 분석 불가'],
      actionLabel: '신규 진입 보류 · 관망',
    };
  }

  if (mfState === 'RED') {
    return {
      decision: 'NO_GO',
      sizeMultiplier: 0,
      headline: 'NO-GO',
      reason,
      blockingFactors: ['마스터 필터 RED — 시장 게이트 미통과'],
      actionLabel: '현금 보유 · 보유 종목 손절 점검',
    };
  }

  if (mfState === 'YELLOW') {
    return {
      decision: 'NO_GO_HOLD',
      sizeMultiplier: 0,
      headline: 'NO-GO · 기존 포지션만 유지',
      reason,
      blockingFactors: ['마스터 필터 YELLOW — 신규 진입 금지'],
      actionLabel: '신규 진입 보류 · 기존 포지션만 유지',
    };
  }

  // mfState === 'GREEN'
  // 1) Risk Barometer 과열 대역 점검
  const isHighRiskBarometer = ctx?.riskBarometerBand === 'HIGH' || (ctx?.riskBarometerScore !== undefined && ctx.riskBarometerScore >= 7);
  const isCautionRiskBarometer = ctx?.riskBarometerBand === 'CAUTION' || (ctx?.riskBarometerScore !== undefined && ctx.riskBarometerScore >= 4);

  if (isHighRiskBarometer) {
    return {
      decision: 'GO_50',
      sizeMultiplier: 0.5,
      headline: 'GO · 과열 리스크 감속 (50%)',
      reason,
      blockingFactors: ['리스크 바로미터 HIGH — 거시 과열/신용 리스크로 비중 50% 강제 축소'],
      actionLabel: '신규 진입 가능 · 비중 50% 제한 · 엄격한 손절 관리',
    };
  }

  if (macroRegime === 'RISK_ON') {
    if (isCautionRiskBarometer) {
      return {
        decision: 'GO_75',
        sizeMultiplier: 0.75,
        headline: 'GO · 사이즈 75%',
        reason,
        blockingFactors: ['리스크 바로미터 CAUTION — 과열 주의로 비중 75% 제한'],
        actionLabel: '신규 진입 가능 · 비중 75% · 주도주 선별',
      };
    }

    return {
      decision: 'GO_FULL',
      sizeMultiplier: 1.0,
      headline: 'GO · 사이즈 100%',
      reason,
      blockingFactors: [],
      actionLabel: '신규 진입 가능 · 정상 비중',
    };
  }

  if (macroRegime === 'RISK_OFF') {
    return {
      decision: 'GO_50',
      sizeMultiplier: 0.5,
      headline: 'GO · 사이즈 50%',
      reason,
      blockingFactors: ['매크로 RISK-OFF — 비중 50% 제한'],
      actionLabel: '신규 진입 가능 · 비중 50% 제한 · 손절선 강화',
    };
  }

  // NEUTRAL 또는 null (보수적 기본)
  return {
    decision: 'GO_75',
    sizeMultiplier: 0.75,
    headline: 'GO · 사이즈 75%',
    reason,
    blockingFactors:
      macroRegime === null ? ['매크로 데이터 미수신 — 보수적 기본 적용'] : [],
    actionLabel: '신규 진입 가능 · 비중 75%',
  };
}
