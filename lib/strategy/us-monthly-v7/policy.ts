import type { MonthlyAssetDefinition, MonthlyRegime, MonthlyStrategyPolicy } from '@/lib/strategy/monthly/types';

export const US_MONTHLY_MODEL_VERSION = 'us-monthly-v8-2026.09-v1';

export const US_MONTHLY_UNIVERSE = [
  { ticker: 'XLK', providerSymbol: 'XLK', name: 'Technology', group: 'Technology', assetClass: 'EQUITY_SECTOR' },
  { ticker: 'XLY', providerSymbol: 'XLY', name: 'Consumer Discretionary', group: 'Consumer Discretionary', assetClass: 'EQUITY_SECTOR' },
  { ticker: 'XLC', providerSymbol: 'XLC', name: 'Communication Services', group: 'Communication Services', assetClass: 'EQUITY_SECTOR' },
  { ticker: 'XLI', providerSymbol: 'XLI', name: 'Industrials', group: 'Industrials', assetClass: 'EQUITY_SECTOR' },
  { ticker: 'XLF', providerSymbol: 'XLF', name: 'Financials', group: 'Financials', assetClass: 'EQUITY_SECTOR' },
  { ticker: 'XLV', providerSymbol: 'XLV', name: 'Health Care', group: 'Health Care', assetClass: 'EQUITY_SECTOR' },
  { ticker: 'XLE', providerSymbol: 'XLE', name: 'Energy', group: 'Energy', assetClass: 'EQUITY_SECTOR' },
  { ticker: 'XLP', providerSymbol: 'XLP', name: 'Consumer Staples', group: 'Consumer Staples', assetClass: 'EQUITY_SECTOR' },
  { ticker: 'XLU', providerSymbol: 'XLU', name: 'Utilities', group: 'Utilities', assetClass: 'EQUITY_SECTOR' },
  { ticker: 'XLB', providerSymbol: 'XLB', name: 'Materials', group: 'Materials', assetClass: 'EQUITY_SECTOR' },
  { ticker: 'XLRE', providerSymbol: 'XLRE', name: 'Real Estate', group: 'Real Estate', assetClass: 'EQUITY_SECTOR' },
] as const satisfies readonly MonthlyAssetDefinition[];

export function resolveUsExposure(regime: MonthlyRegime, averageRelativeMomentum: number | null) {
  if (regime === 'BROAD_TREND' || regime === 'TREND' || regime === 'CRASH_100') return 1;
  if (regime === 'CRASH_75') return 0.75;
  if (regime === 'CRASH_50' || regime === 'RECOVERY') return 0.5;
  if (regime === 'NON_TREND') return (averageRelativeMomentum ?? Number.NEGATIVE_INFINITY) >= 5 ? 0.5 : 0.25;
  return 0;
}

export const US_MONTHLY_POLICY: MonthlyStrategyPolicy = {
  market: 'US',
  modelVersion: US_MONTHLY_MODEL_VERSION,
  modelStatus: 'RESEARCH_ONLY',
  timeZone: 'America/New_York',
  benchmarkSymbol: 'SPY',
  universe: US_MONTHLY_UNIVERSE,
  crashTarget: { ticker: 'SPY', providerSymbol: 'SPY', name: 'S&P 500', group: 'S&P 500', assetClass: 'EQUITY_BENCHMARK' },
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
    broadTrend: 80,
    trend: 60,
    nonTrend: 40,
    recovery: 30,
    hysteresis: 5,
    drawdown50: -12,
    drawdown75: -18,
    drawdown100: -24,
  },
  resolveExposure: resolveUsExposure,
};

export const US_V7_VERSION = US_MONTHLY_MODEL_VERSION;
export const US_V7 = {
  breadthStrong: 80,
  breadthSelective: 60,
  breadthWeak: 40,
  breadthRecovery: 30,
  ddLevels: [-12, -18, -24],
} as const;
export const US_V7_UNIVERSE = US_MONTHLY_UNIVERSE;
