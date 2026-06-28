import type { CapitalBasisKind, CapitalSnapshot, PortfolioRiskSummary } from '../../../types/index.ts';

interface BuildCapitalSnapshotInput {
  basis: CapitalBasisKind;
  market: 'US' | 'KR';
  portfolio: PortfolioRiskSummary | null;
  fallbackEquity: number;
  manualAmount: number;
  scenarioPct: number;
  capturedAt: string;
}

const LABELS: Record<CapitalBasisKind, string> = {
  CURRENT_ACCOUNT: '현재 계좌 기준',
  CONSERVATIVE: '보수적 기준',
  AVAILABLE_CASH: '투자 가능 현금 기준',
  MANUAL: '직접 입력',
  SCENARIO: '가상 시나리오',
};

function finitePositive(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildCapitalSnapshot(input: BuildCapitalSnapshotInput): CapitalSnapshot {
  const portfolioEquity = finitePositive(input.portfolio?.totalEquity);
  const fallbackEquity = finitePositive(input.fallbackEquity) ?? 0;
  const currentEquity = portfolioEquity ?? fallbackEquity;
  const cash = finitePositive(input.portfolio?.cash);
  const marketValue = finitePositive(input.portfolio?.marketValue);
  const openRisk = finitePositive(input.portfolio?.totalOpenRisk) ?? 0;
  const riskBudgetRemaining = finitePositive(input.portfolio?.riskBudgetRemaining);
  const manualAmount = finitePositive(input.manualAmount) ?? currentEquity;
  const scenarioMultiplier = 1 + input.scenarioPct / 100;

  const amount =
    input.basis === 'CONSERVATIVE'
      ? Math.max(0, currentEquity - openRisk)
      : input.basis === 'AVAILABLE_CASH'
        ? cash ?? currentEquity
        : input.basis === 'MANUAL'
          ? manualAmount
          : input.basis === 'SCENARIO'
            ? Math.max(0, currentEquity * scenarioMultiplier)
            : currentEquity;

  return {
    version: 'mtn-capital-snapshot-v1',
    basis: input.basis,
    basisLabel: LABELS[input.basis],
    amount: roundCurrency(amount),
    market: input.market,
    currency: input.market === 'KR' ? 'KRW' : 'USD',
    capturedAt: input.capturedAt,
    source: input.basis === 'MANUAL' ? 'USER_INPUT' : input.basis === 'SCENARIO' ? 'SCENARIO' : 'PORTFOLIO_RISK',
    fallbackUsed: !portfolioEquity,
    scenarioPct: input.basis === 'SCENARIO' ? input.scenarioPct : null,
    portfolio: {
      totalEquity: portfolioEquity,
      cash,
      marketValue,
      totalOpenRisk: openRisk,
      riskBudgetRemaining,
      activePositions: Number.isFinite(input.portfolio?.activePositions) ? Number(input.portfolio?.activePositions) : null,
      unknownRiskPositions: Number.isFinite(input.portfolio?.unknownRiskPositions) ? Number(input.portfolio?.unknownRiskPositions) : null,
    },
  };
}

export function capitalBasisLabel(basis: CapitalBasisKind) {
  return LABELS[basis];
}
