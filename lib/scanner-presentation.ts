import type { ScannerResult } from '../types/index.ts';

export type RsBandTone = 'elite' | 'leader' | 'building' | 'muted';

export interface TrendDotState {
  key: '50' | '150' | '200' | 'align';
  label: string;
  active: boolean;
}

function getCriterionStatus(result: ScannerResult, id: string) {
  const evidenceMatch = (result.sepaEvidence?.criteria || []).find((criterion) => criterion.id === id);
  if (evidenceMatch) return evidenceMatch.status;
  const fallbackMatch = (result.sepaCriteria || []).find((criterion) => criterion.id === id);
  return fallbackMatch?.status || null;
}

export function getScannerRsBand(result: ScannerResult) {
  if (typeof result.rsRating !== 'number') {
    return { label: 'RS Unrated', tone: 'muted' as const };
  }
  if (result.rsRating >= 90) {
    return { label: 'RS Elite', tone: 'elite' as const };
  }
  if (result.rsRating >= 75) {
    return { label: 'RS Leader', tone: 'leader' as const };
  }
  return { label: 'RS Building', tone: 'building' as const };
}

export function getScannerTrendDots(result: ScannerResult): TrendDotState[] {
  const ma50 = getCriterionStatus(result, 'price_vs_ma50');
  const ma150 = getCriterionStatus(result, 'price_vs_ma150');
  const ma200 = getCriterionStatus(result, 'price_vs_ma200');
  const alignment = getCriterionStatus(result, 'ma_alignment');
  const inferredMa50 = typeof result.distanceFromMa50Pct === 'number' ? result.distanceFromMa50Pct >= 0 : null;

  return [
    { key: '50', label: '50', active: ma50 ? ma50 !== 'fail' : inferredMa50 ?? false },
    { key: '150', label: '150', active: ma150 ? ma150 !== 'fail' : false },
    { key: '200', label: '200', active: ma200 ? ma200 !== 'fail' : false },
    { key: 'align', label: 'Align', active: alignment ? alignment !== 'fail' : false },
  ];
}

function shortCriterionLabel(id: string) {
  if (id === 'price_vs_ma50') return 'MA50';
  if (id === 'price_vs_ma150') return 'MA150';
  if (id === 'price_vs_ma200') return 'MA200';
  if (id === 'ma_alignment') return 'Align';
  if (id === 'ma200_uptrend') return '200D Up';
  if (id === 'within_52w_high') return '52W High';
  if (id === 'above_52w_low') return '52W Low';
  if (id === 'rs_rating') return 'RS';
  return id;
}

export function getScannerSepaSummary(result: ScannerResult) {
  const corePassed = result.sepaEvidence?.summary.corePassed ?? null;
  const coreTotal = result.sepaEvidence?.summary.coreTotal ?? 7;
  const failedLabels = (result.sepaEvidence?.criteria || [])
    .filter((criterion) => criterion.status === 'fail')
    .sort((left, right) => Number(right.isCore) - Number(left.isCore))
    .slice(0, 3)
    .map((criterion) => shortCriterionLabel(criterion.id));

  return {
    label: corePassed === null ? 'SEPA Pending' : `SEPA ${corePassed}/${coreTotal}`,
    corePassed,
    coreTotal,
    failedLabels,
  };
}

export function getScannerBaseLabel(result: ScannerResult) {
  if (result.baseType === 'High_Tight_Flag') return 'HTF';
  if (result.baseType === 'Standard_VCP') return 'Standard';
  if (result.momentumBranch === 'EXTENDED') return 'Extended';
  return '-';
}

export function formatScannerRs(result: ScannerResult) {
  if (typeof result.rsRating !== 'number') return '-';
  const rank = result.rsRank && result.rsUniverseSize ? ` #${result.rsRank}/${result.rsUniverseSize}` : '';
  return `${result.rsRating}${rank}`;
}

export function getScannerMomentumSeries(result: ScannerResult) {
  const entries = [
    ['12M', result.return12m],
    ['9M', result.return9m],
    ['6M', result.return6m],
    ['3M', result.return3m],
    ['8W', result.eightWeekReturnPct],
  ] as const;
  return {
    label: 'Momentum Curve',
    points: entries.flatMap(([label, value]) =>
      typeof value === 'number' && Number.isFinite(value)
        ? [{ label, value }]
        : []
    ),
  };
}
