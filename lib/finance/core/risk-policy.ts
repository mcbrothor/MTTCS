import type { AppliedRiskStrategy, RiskPolicy, RiskPolicyProfile, RiskStrategy } from '../../../types/index.ts';

export interface RiskStrategyConfig {
  strategy: AppliedRiskStrategy;
  label: string;
  profile: RiskPolicyProfile;
  riskMultiplier: number;
  maxLossPct: number;
  atrStopMultiple: number;
  pyramidSpacingAtr: number;
  preferAtrStop: boolean;
  portfolioHeatPct: number;
}

const STRATEGY_CONFIGS: Record<AppliedRiskStrategy, RiskStrategyConfig> = {
  MINERVINI_VCP: {
    strategy: 'MINERVINI_VCP',
    label: 'Minervini VCP',
    profile: 'STANDARD',
    riskMultiplier: 1,
    maxLossPct: 0.08,
    atrStopMultiple: 2,
    pyramidSpacingAtr: 0.5,
    preferAtrStop: false,
    portfolioHeatPct: 0.06,
  },
  HIGH_TIGHT_FLAG: {
    strategy: 'HIGH_TIGHT_FLAG',
    label: 'High Tight Flag',
    profile: 'AGGRESSIVE',
    riskMultiplier: 1,
    maxLossPct: 0.07,
    atrStopMultiple: 1.75,
    pyramidSpacingAtr: 0.5,
    preferAtrStop: false,
    portfolioHeatPct: 0.08,
  },
  ATR_VOLATILITY: {
    strategy: 'ATR_VOLATILITY',
    label: 'ATR Volatility',
    profile: 'STANDARD',
    riskMultiplier: 1,
    maxLossPct: 0.08,
    atrStopMultiple: 2,
    pyramidSpacingAtr: 0.5,
    preferAtrStop: true,
    portfolioHeatPct: 0.06,
  },
  CONSERVATIVE: {
    strategy: 'CONSERVATIVE',
    label: 'Conservative Half Risk',
    profile: 'CONSERVATIVE',
    riskMultiplier: 0.5,
    maxLossPct: 0.06,
    atrStopMultiple: 1.5,
    pyramidSpacingAtr: 0.75,
    preferAtrStop: true,
    portfolioHeatPct: 0.03,
  },
  ONL_PYRAMID: {
    strategy: 'ONL_PYRAMID',
    label: 'ONL 50/30/20 Pyramid',
    profile: 'STANDARD',
    riskMultiplier: 1,
    maxLossPct: 0.05,
    atrStopMultiple: 2,
    pyramidSpacingAtr: 0.5,
    preferAtrStop: false,
    portfolioHeatPct: 0.06,
  },
  MANUAL_FIXED_RISK: {
    strategy: 'MANUAL_FIXED_RISK',
    label: 'Manual Fixed Risk',
    profile: 'STANDARD',
    riskMultiplier: 1,
    maxLossPct: 1,
    atrStopMultiple: 2,
    pyramidSpacingAtr: 0.5,
    preferAtrStop: false,
    portfolioHeatPct: 0.06,
  },
};

export function normalizeRiskStrategy(value: unknown): RiskStrategy {
  const normalized = String(value || 'AUTO').trim().toUpperCase();
  if (
    normalized === 'AUTO' ||
    normalized === 'MINERVINI_VCP' ||
    normalized === 'HIGH_TIGHT_FLAG' ||
    normalized === 'ATR_VOLATILITY' ||
    normalized === 'CONSERVATIVE' ||
    normalized === 'ONL_PYRAMID' ||
    normalized === 'MANUAL_FIXED_RISK'
  ) {
    return normalized;
  }
  return 'AUTO';
}

export function resolveAppliedRiskStrategy(
  requested: RiskStrategy,
  detected: AppliedRiskStrategy = 'MINERVINI_VCP',
  highTightFlagPassed = false
): AppliedRiskStrategy {
  if (requested === 'AUTO') return detected;
  if (requested === 'HIGH_TIGHT_FLAG' && !highTightFlagPassed) return 'MINERVINI_VCP';
  return requested;
}

export function getRiskStrategyConfig(strategy: AppliedRiskStrategy): RiskStrategyConfig {
  return STRATEGY_CONFIGS[strategy];
}

export function getDefaultRiskPolicy(
  market: 'US' | 'KR',
  profile: RiskPolicyProfile = 'STANDARD',
  baseRiskPct = 0.01
): RiskPolicy {
  const maxPortfolioHeatPct = profile === 'CONSERVATIVE' ? 0.03 : profile === 'AGGRESSIVE' ? 0.08 : market === 'KR' ? 0.05 : 0.06;
  return {
    market,
    profile,
    baseRiskPct,
    maxSingleTradeRiskPct: profile === 'CONSERVATIVE' ? 0.01 : 0.02,
    maxPortfolioHeatPct,
    maxSectorExposurePct: 0.35,
    maxSectorRiskPct: profile === 'AGGRESSIVE' ? 0.04 : 0.03,
    maxPositions: null,
    atrLookback: 20,
    atrStopMultiple: profile === 'CONSERVATIVE' ? 1.5 : 2,
    pyramidSpacingAtr: profile === 'CONSERVATIVE' ? 0.75 : 0.5,
    drawdownSoftLimitPct: 0.05,
    drawdownHardLimitPct: 0.08,
    dailyLossLimitPct: 0.02,
    weeklyLossLimitPct: 0.04,
  };
}

export function buildRiskPolicyForStrategy(
  market: 'US' | 'KR',
  strategy: AppliedRiskStrategy,
  baseRiskPct = 0.01
): RiskPolicy {
  const config = getRiskStrategyConfig(strategy);
  return {
    ...getDefaultRiskPolicy(market, config.profile, baseRiskPct),
    baseRiskPct,
    maxPortfolioHeatPct: market === 'KR' && config.profile !== 'AGGRESSIVE'
      ? Math.min(config.portfolioHeatPct, 0.05)
      : config.portfolioHeatPct,
    atrStopMultiple: config.atrStopMultiple,
    pyramidSpacingAtr: config.pyramidSpacingAtr,
  } as RiskPolicy;
}
