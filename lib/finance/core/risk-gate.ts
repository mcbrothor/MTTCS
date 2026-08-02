import type { RiskGateReason, RiskGateResult, RiskPolicy, StopQuality } from '../../../types/index.ts';
import { round } from './_shared.ts';

interface EvaluateRiskGateInput {
  policy: RiskPolicy;
  totalEquity: number;
  candidateRisk: number;
  currentOpenRisk?: number;
  stopQuality?: StopQuality;
  sectorExposurePct?: number;
  sectorRiskPct?: number;
  drawdownPct?: number;
  dailyLossPct?: number;
  weeklyLossPct?: number;
  currentPositionCount?: number;
  candidatePositionCount?: number;
  marketActionLevel?: 'FULL' | 'REDUCED' | 'HALT' | null;
}

export const MARKET_REDUCED_RISK_MULTIPLIER = 0.5;

function reason(code: RiskGateReason['code'], severity: RiskGateReason['severity'], message: string): RiskGateReason {
  return { code, severity, message };
}

export function evaluateRiskGate(input: EvaluateRiskGateInput): RiskGateResult {
  const equity = Math.max(0, Number(input.totalEquity) || 0);
  const candidateRisk = Math.max(0, Number(input.candidateRisk) || 0);
  const currentOpenRisk = Math.max(0, Number(input.currentOpenRisk) || 0);
  const maxHeatAmount = equity * input.policy.maxPortfolioHeatPct;
  const riskBudgetRemaining = Math.max(0, maxHeatAmount - currentOpenRisk);
  const regimeRiskMultiplier = input.marketActionLevel === 'REDUCED'
    ? MARKET_REDUCED_RISK_MULTIPLIER
    : 1;
  const allowedRiskAmount = Math.min(
    equity * input.policy.maxSingleTradeRiskPct * regimeRiskMultiplier,
    riskBudgetRemaining
  );
  const reasons: RiskGateReason[] = [];

  if (input.marketActionLevel === 'HALT') {
    reasons.push(reason('MARKET_REGIME', 'BLOCK', 'Market regime is HALT; new entries are blocked.'));
  } else if (input.marketActionLevel === 'REDUCED') {
    reasons.push(reason(
      'MARKET_REGIME',
      candidateRisk > allowedRiskAmount ? 'WARN' : 'INFO',
      candidateRisk > allowedRiskAmount
        ? 'Market regime requires reduced position sizing.'
        : 'Candidate risk already fits the reduced market-regime limit.'
    ));
  }

  if (input.stopQuality === 'INVALID') {
    reasons.push(reason('STOP_QUALITY', 'BLOCK', 'Stop is invalid for the selected entry price.'));
  } else if (input.stopQuality === 'TOO_TIGHT') {
    reasons.push(reason('STOP_QUALITY', 'WARN', 'Stop is tighter than the minimum ATR noise threshold.'));
  } else if (input.stopQuality === 'TOO_WIDE') {
    reasons.push(reason('STOP_QUALITY', 'WARN', 'Stop is wider than the maximum ATR risk threshold.'));
  }

  if (equity > 0 && currentOpenRisk / equity >= input.policy.maxPortfolioHeatPct) {
    reasons.push(reason('PORTFOLIO_HEAT', 'BLOCK', 'Portfolio heat is already at or above the policy limit.'));
  } else if (candidateRisk > riskBudgetRemaining) {
    reasons.push(reason('INSUFFICIENT_RISK_BUDGET', riskBudgetRemaining > 0 ? 'WARN' : 'BLOCK', 'Candidate risk exceeds remaining portfolio risk budget.'));
  } else if (candidateRisk > allowedRiskAmount) {
    reasons.push(reason('INSUFFICIENT_RISK_BUDGET', 'WARN', 'Candidate risk exceeds the single-trade risk limit.'));
  }

  if (typeof input.sectorExposurePct === 'number' && input.sectorExposurePct >= input.policy.maxSectorExposurePct * 100) {
    reasons.push(reason('SECTOR_CONCENTRATION', 'WARN', 'Sector exposure is above the policy concentration limit.'));
  }

  if (typeof input.sectorRiskPct === 'number' && input.sectorRiskPct >= input.policy.maxSectorRiskPct * 100) {
    reasons.push(reason('SECTOR_CONCENTRATION', 'WARN', 'Sector open risk is above the policy risk limit.'));
  }

  if (typeof input.drawdownPct === 'number') {
    if (input.drawdownPct >= input.policy.drawdownHardLimitPct * 100) {
      reasons.push(reason('DRAWDOWN_THROTTLE', 'BLOCK', 'Drawdown is above the hard limit; new entries are blocked.'));
    } else if (input.drawdownPct >= input.policy.drawdownSoftLimitPct * 100) {
      reasons.push(reason('DRAWDOWN_THROTTLE', 'WARN', 'Drawdown is above the soft limit; reduce position sizing.'));
    }
  }

  if (
    typeof input.dailyLossPct === 'number' &&
    Number.isFinite(input.dailyLossPct) &&
    input.dailyLossPct >= input.policy.dailyLossLimitPct * 100
  ) {
    reasons.push(reason(
      'DRAWDOWN_THROTTLE',
      'BLOCK',
      'Daily loss is at or above the policy limit; new entries are blocked.'
    ));
  }

  if (
    typeof input.weeklyLossPct === 'number' &&
    Number.isFinite(input.weeklyLossPct) &&
    input.weeklyLossPct >= input.policy.weeklyLossLimitPct * 100
  ) {
    reasons.push(reason(
      'DRAWDOWN_THROTTLE',
      'BLOCK',
      'Weekly loss is at or above the policy limit; new entries are blocked.'
    ));
  }

  const currentPositionCount = Number(input.currentPositionCount);
  const candidatePositionCount = input.candidatePositionCount === undefined
    ? 1
    : Number(input.candidatePositionCount);
  if (
    input.policy.maxPositions !== null &&
    Number.isFinite(currentPositionCount) &&
    Number.isFinite(candidatePositionCount) &&
    currentPositionCount + Math.max(0, candidatePositionCount) > input.policy.maxPositions
  ) {
    reasons.push(reason(
      'PORTFOLIO_HEAT',
      'BLOCK',
      `Position limit would be exceeded (${currentPositionCount + Math.max(0, candidatePositionCount)}/${input.policy.maxPositions}).`
    ));
  }

  const hasBlock = reasons.some((item) => item.severity === 'BLOCK');
  const needsReduce = !hasBlock && (
    reasons.some((item) => item.severity === 'WARN') ||
    candidateRisk > allowedRiskAmount
  );
  const status: RiskGateResult['status'] = hasBlock ? 'BLOCK' : needsReduce ? 'REDUCE' : 'PASS';
  const effectiveRiskPct = equity > 0
    ? Math.min(input.policy.baseRiskPct * regimeRiskMultiplier, allowedRiskAmount / equity)
    : 0;

  return {
    status,
    effectiveRiskPct: round(effectiveRiskPct, 4),
    allowedRiskAmount: round(allowedRiskAmount),
    riskBudgetRemaining: round(riskBudgetRemaining),
    reasons,
  };
}
