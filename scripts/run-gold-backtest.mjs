import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});
const { getYahooDailyPrice } = jiti('../lib/finance/providers/yahoo-api.ts');
const { runGoldBacktest } = jiti('../lib/gold/backtest.ts');

const START_DATE = '2016-07-25';
const END_DATE = '2026-07-24';
const BASELINE = {
  BUY_AND_HOLD: {
    cagrPct: 11.5,
    annualVolatilityPct: 16.1,
    maxDrawdownPct: -26.4,
    sharpe: 0.76,
    averageExposurePct: 100,
  },
  SIX_MONTH_TREND: {
    cagrPct: 10.7,
    annualVolatilityPct: 14.2,
    maxDrawdownPct: -25.9,
    sharpe: 0.79,
    averageExposurePct: 66.5,
  },
  CORE_TACTICAL: {
    cagrPct: 11.1,
    annualVolatilityPct: 14.5,
    maxDrawdownPct: -22.4,
    sharpe: 0.8,
    averageExposurePct: 79.9,
  },
};
const TOLERANCE = {
  cagrPct: 1,
  annualVolatilityPct: 1,
  maxDrawdownPct: 3,
  sharpe: 0.15,
  averageExposurePct: 5,
};

const bars = (await getYahooDailyPrice('GLD', { range: '10y' }))
  .filter((bar) => bar.date >= START_DATE && bar.date <= END_DATE);
if (bars.length < 2_000) {
  throw new Error(`GLD 10년 백테스트 봉이 부족합니다: ${bars.length}`);
}

const modes = ['BUY_AND_HOLD', 'SIX_MONTH_TREND', 'CORE_TACTICAL'];
const results = Object.fromEntries(modes.map((mode) => {
  const result = runGoldBacktest({
    bars,
    mode,
    transactionCostPct: 0.001,
    annualRiskFreeRate: 0,
  });
  return [mode, {
    startDate: result.startDate,
    endDate: result.endDate,
    observations: result.observations,
    cagrPct: result.cagrPct,
    annualVolatilityPct: result.annualVolatilityPct,
    maxDrawdownPct: result.maxDrawdownPct,
    sharpe: result.sharpe,
    averageExposurePct: result.averageExposurePct,
  }];
}));

const differences = Object.fromEntries(modes.map((mode) => [
  mode,
  Object.fromEntries(Object.keys(TOLERANCE).map((field) => [
    field,
    Number((results[mode][field] - BASELINE[mode][field]).toFixed(4)),
  ])),
]));
const publishable = modes.every((mode) =>
  Object.entries(TOLERANCE).every(([field, tolerance]) =>
    Math.abs(differences[mode][field]) <= tolerance,
  ),
);

console.log(JSON.stringify({
  input: {
    symbol: 'GLD',
    startDate: START_DATE,
    endDate: END_DATE,
    transactionCostPct: 0.1,
    taxesSlippageCashInterest: 'excluded',
  },
  results,
  baseline: BASELINE,
  differences,
  publishable,
}, null, 2));

if (!publishable) process.exitCode = 2;
