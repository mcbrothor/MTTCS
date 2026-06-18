import type { PortfolioRiskSummary, RiskGateResult } from '../../../types/index.ts';

export interface CandidatePosition {
  ticker: string;
  shares: number;
  entryPrice: number;
  stopPrice: number;
  sector?: string | null;
}

export function calculatePortfolioWhatIf(current: PortfolioRiskSummary, candidate: CandidatePosition) {
  const candidateExposure = candidate.shares * candidate.entryPrice;
  const candidateRisk = candidate.shares * Math.max(candidate.entryPrice - candidate.stopPrice, 0);
  const equity = current.totalEquity;
  const currentSector = current.sectorExposure.find((row) => row.sector === (candidate.sector || 'Unknown'));
  const projectedOpenRisk = current.totalOpenRisk + candidateRisk;
  const projectedExposure = (current.marketValue ?? current.investedCapital) + candidateExposure;
  const projectedSectorExposure = (currentSector?.exposure || 0) + candidateExposure;
  const projectedHeatPct = equity > 0 ? Number((projectedOpenRisk / equity * 100).toFixed(2)) : 0;
  const projectedSectorPct = equity > 0 ? Number((projectedSectorExposure / equity * 100).toFixed(2)) : 0;
  const status: RiskGateResult['status'] = current.unknownRiskPositions
    ? 'BLOCK'
    : projectedHeatPct >= 6 || projectedSectorPct >= 35
      ? 'BLOCK'
      : projectedHeatPct >= 4.5 || projectedSectorPct >= 30
        ? 'REDUCE'
        : 'PASS';
  return {
    candidate: { ...candidate, exposure: candidateExposure, risk: candidateRisk },
    current: { openRisk: current.totalOpenRisk, heatPct: current.portfolioHeatPct ?? current.openRiskPct, marketValue: current.marketValue ?? current.investedCapital },
    projected: { openRisk: projectedOpenRisk, heatPct: projectedHeatPct, marketValue: projectedExposure, sectorExposurePct: projectedSectorPct },
    gateChange: { from: current.riskGate?.status ?? 'PASS', to: status },
    stressLosses: {
      equityDown10Pct: Number((projectedExposure * 0.10).toFixed(2)),
      growthDown15Pct: Number(((candidate.sector === 'Technology' ? candidateExposure : 0) * 0.15).toFixed(2)),
    },
  };
}
