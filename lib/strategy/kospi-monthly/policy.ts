import type { MonthlyAssetDefinition, MonthlyRegime, MonthlyStrategyPolicy } from '@/lib/strategy/monthly/types';

export const KOSPI_MONTHLY_MODEL_VERSION = 'kospi-monthly-v3-2026.09-v1';

export const KOSPI_MONTHLY_UNIVERSE = [
  { ticker: '455850', providerSymbol: '455850.KS', name: 'SOL AI반도체소부장', group: '반도체', assetClass: 'EQUITY_SECTOR' },
  { ticker: '305720', providerSymbol: '305720.KS', name: 'KODEX 2차전지산업', group: '2차전지', assetClass: 'EQUITY_SECTOR' },
  { ticker: '091180', providerSymbol: '091180.KS', name: 'KODEX 자동차', group: '자동차', assetClass: 'EQUITY_SECTOR' },
  { ticker: '244580', providerSymbol: '244580.KS', name: 'KODEX 바이오', group: '바이오', assetClass: 'EQUITY_SECTOR' },
  { ticker: '091220', providerSymbol: '091220.KS', name: 'TIGER 은행', group: '은행', assetClass: 'EQUITY_SECTOR' },
  { ticker: '117680', providerSymbol: '117680.KS', name: 'KODEX 철강', group: '철강', assetClass: 'EQUITY_SECTOR' },
  { ticker: '117700', providerSymbol: '117700.KS', name: 'KODEX 건설', group: '건설', assetClass: 'EQUITY_SECTOR' },
  { ticker: '139260', providerSymbol: '139260.KS', name: 'TIGER 200 IT', group: 'IT', assetClass: 'EQUITY_SECTOR' },
] as const satisfies readonly MonthlyAssetDefinition[];

export function resolveKospiExposure(regime: MonthlyRegime, averageRelativeMomentum: number | null) {
  if (regime === 'TREND' || regime === 'BROAD_TREND' || regime === 'CRASH_100') return 1;
  if (regime === 'CRASH_75') return 0.75;
  if (regime === 'CRASH_50' || regime === 'RECOVERY') return 0.5;
  if (regime === 'NON_TREND') {
    const strength = averageRelativeMomentum ?? Number.NEGATIVE_INFINITY;
    if (strength >= 22) return 1;
    if (strength >= 12) return 0.75;
    if (strength >= 5) return 0.5;
    return 0.25;
  }
  return 0;
}

export const KOSPI_MONTHLY_POLICY: MonthlyStrategyPolicy = {
  market: 'KR',
  modelVersion: KOSPI_MONTHLY_MODEL_VERSION,
  modelStatus: 'RESEARCH_ONLY',
  timeZone: 'Asia/Seoul',
  benchmarkSymbol: '^KS11',
  universe: KOSPI_MONTHLY_UNIVERSE,
  crashTarget: { ticker: '069500', providerSymbol: '069500.KS', name: 'KODEX 200', group: 'KOSPI', assetClass: 'EQUITY_BENCHMARK' },
  crashReentryMovingAverage: 20,
  breadthLookback: 120,
  relativeMomentum3Lookback: 63,
  relativeMomentum6Lookback: 126,
  absoluteMomentum12Lookback: 252,
  absoluteMomentumSkip: 21,
  entryTopN: 3,
  keepTopN: 5,
  minimumCoverage: 1,
  transactionCostRate: 0.001,
  regime: {
    trend: 60,
    nonTrend: 40,
    recovery: 30,
    hysteresis: 5,
    drawdown50: -12,
    drawdown75: -18,
    drawdown100: -24,
  },
  resolveExposure: resolveKospiExposure,
};

export const KOSPI_MV23_VERSION = KOSPI_MONTHLY_MODEL_VERSION;
export const KOSPI_MV23 = {
  breadthLookback: KOSPI_MONTHLY_POLICY.breadthLookback,
  breadthTrend: KOSPI_MONTHLY_POLICY.regime.trend,
  nonTrendLow: KOSPI_MONTHLY_POLICY.regime.nonTrend,
  nonTrendHigh: KOSPI_MONTHLY_POLICY.regime.trend,
  recoveryLow: KOSPI_MONTHLY_POLICY.regime.recovery,
  recoveryHigh: KOSPI_MONTHLY_POLICY.regime.nonTrend,
  drawdownLevels: [-12, -18, -24],
  topNNew: KOSPI_MONTHLY_POLICY.entryTopN,
  topNKeep: KOSPI_MONTHLY_POLICY.keepTopN,
} as const;
