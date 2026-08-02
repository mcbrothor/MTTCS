import assert from 'node:assert/strict';
import {
  assessNasdaqDataQuality,
  calculateNasdaqPosition,
  calculateNasdaqRegime,
  calculateTenMonthTrend,
  evaluateNasdaqStrategy,
} from '../lib/nasdaq/engine.ts';
import {
  DEFAULT_NASDAQ_SETTINGS,
  NASDAQ_MODEL_VERSION,
  NASDAQ_POLICY,
  NASDAQ_PRODUCTS,
} from '../lib/nasdaq/policy.ts';
import { runNasdaqBacktest } from '../lib/nasdaq/backtest.ts';

function businessDatesEnding(count, end = '2026-07-24') {
  const dates = [];
  const cursor = new Date(`${end}T00:00:00Z`);
  while (dates.length < count) {
    if (![0, 6].includes(cursor.getUTCDay())) dates.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates;
}

function bars({
  product = 'QQQ',
  series = 'ADJUSTED',
  count = 300,
  breakout = false,
  descending = false,
} = {}) {
  const dates = businessDatesEnding(count);
  return dates.map((date, index) => {
    const trend = descending ? (count - index) * 0.08 : index * 0.08;
    const close = 80 + trend + (breakout && index === count - 1 ? 1 : 0);
    return {
      date,
      open: close - 0.03,
      high: close + 0.05,
      low: close - 0.08,
      close,
      volume: 1_000_000,
      product,
      series,
    };
  });
}

function settings(overrides = {}) {
  return {
    ...DEFAULT_NASDAQ_SETTINGS,
    baseCurrency: 'USD',
    accountEquity: 100_000,
    ...overrides,
  };
}

assert.deepEqual(Object.keys(NASDAQ_PRODUCTS), ['QQQ', 'QLD', 'TQQQ']);
assert.equal(NASDAQ_PRODUCTS.QLD.leverage, 2);
assert.equal(NASDAQ_PRODUCTS.TQQQ.leverage, 3);
assert.equal(NASDAQ_POLICY.maxCapitalPct, 0.2);
assert.equal(NASDAQ_POLICY.maxEffectiveExposurePct, 0.3);
assert.equal(NASDAQ_MODEL_VERSION, 'nasdaq-core-leverage-2026.07-v1');

{
  const monthBars = [];
  for (let month = 1; month <= 11; month += 1) {
    const monthString = String(month).padStart(2, '0');
    const nextMonth = String(month + 1).padStart(2, '0');
    monthBars.push({
      date: `2025-${monthString}-27`,
      open: 99 + month,
      high: 101 + month,
      low: 98 + month,
      close: 100 + month,
      volume: 1,
      product: 'QQQ',
      series: 'ADJUSTED',
    });
    if (month < 11) {
      monthBars.push({
        date: `2025-${nextMonth}-01`,
        open: 100 + month,
        high: 102 + month,
        low: 99 + month,
        close: 101 + month,
        volume: 1,
        product: 'QQQ',
        series: 'ADJUSTED',
      });
    }
  }
  const trend = calculateTenMonthTrend(monthBars);
  assert.equal(trend.signal, 'ON');
  assert.equal(trend.isEffective, true);
  assert.ok(trend.effectiveFrom > trend.signalDate);
}

{
  const regime = calculateNasdaqRegime(bars({ breakout: true }));
  assert.ok(regime);
  assert.equal(regime.aboveMa200TwoCloses, true);
  assert.equal(regime.breakout20, true);
  assert.equal(regime.goldenCross, true);
  assert.ok(regime.realizedVolatility20Pct < 18);
  assert.ok(regime.volatilityScale > 0 && regime.volatilityScale <= 1);
}

{
  const quality = assessNasdaqDataQuality({
    asOf: '2026-07-24',
    qqqAdjustedBars: bars(),
    executionBars: bars({ product: 'QLD', series: 'EXECUTION' }),
    tacticalProduct: 'QLD',
    feeMetadataFresh: true,
  });
  assert.equal(quality.status, 'VALID');

  const mixed = bars({ product: 'QLD', series: 'EXECUTION' });
  mixed[0] = { ...mixed[0], product: 'TQQQ' };
  assert.equal(assessNasdaqDataQuality({
    asOf: '2026-07-24',
    qqqAdjustedBars: bars(),
    executionBars: mixed,
    tacticalProduct: 'QLD',
    feeMetadataFresh: true,
  }).status, 'BLOCKED');

  assert.equal(assessNasdaqDataQuality({
    asOf: '2026-07-24',
    qqqAdjustedBars: bars(),
    executionBars: bars({ product: 'QLD', series: 'EXECUTION' }),
    tacticalProduct: 'QLD',
    feeMetadataFresh: false,
  }).status, 'DEGRADED');
}

{
  const plan = calculateNasdaqPosition({
    product: 'QLD',
    accountEquity: 100_000,
    entryPrice: 100,
    atr14: 2,
    tacticalTargetPct: 0.05,
    existingCapitalValue: 10_000,
    existingEffectiveExposureValue: 10_000,
    existingSelectedTacticalValue: 0,
  });
  assert.ok(plan);
  assert.equal(plan.stopPrice, 96);
  assert.equal(plan.riskBudget, 350);
  assert.ok(plan.actualNotional <= 5_000);
  assert.ok((plan.actualNotional * 2) + 10_000 <= 30_000);
}

{
  const plan = calculateNasdaqPosition({
    product: 'QLD',
    accountEquity: 100_000_000,
    entryPrice: 100,
    unitPriceInBase: 140_000,
    atr14: 2,
    tacticalTargetPct: 0.05,
    existingCapitalValue: 10_000_000,
    existingEffectiveExposureValue: 10_000_000,
    existingSelectedTacticalValue: 0,
  });
  assert.ok(plan);
  assert.equal(plan.units, 35);
  assert.equal(plan.actualNotional, 4_900_000);
}

{
  const result = evaluateNasdaqStrategy({
    asOf: '2026-07-24',
    qqqAdjustedBars: bars({ breakout: true }),
    tacticalExecutionBars: bars({ product: 'QLD', series: 'EXECUTION', breakout: true }),
    settings: settings(),
  });
  assert.equal(result.decision, 'QLD_READY');
  assert.ok(result.allocation.tacticalCapitalTargetPct > 0);
  assert.ok(result.allocation.totalCapitalTargetPct <= 0.2);
  assert.ok(result.allocation.totalEffectiveTargetPct <= 0.3);
  assert.ok(result.position);
}

{
  const locked = evaluateNasdaqStrategy({
    asOf: '2026-07-24',
    qqqAdjustedBars: bars({ breakout: true }),
    tacticalExecutionBars: bars({ product: 'TQQQ', series: 'EXECUTION', breakout: true }),
    settings: settings({ tacticalProduct: 'TQQQ', tqqqOptIn: false }),
  });
  assert.notEqual(locked.decision, 'TQQQ_READY');
  assert.equal(locked.allocation.tacticalCapitalTargetPct, 0);

  const unlocked = evaluateNasdaqStrategy({
    asOf: '2026-07-24',
    qqqAdjustedBars: bars({ breakout: true }),
    tacticalExecutionBars: bars({ product: 'TQQQ', series: 'EXECUTION', breakout: true }),
    settings: settings({ tacticalProduct: 'TQQQ', tqqqOptIn: true }),
  });
  assert.equal(unlocked.decision, 'TQQQ_READY');
}

{
  const conflict = evaluateNasdaqStrategy({
    asOf: '2026-07-24',
    qqqAdjustedBars: bars({ breakout: true }),
    tacticalExecutionBars: bars({ product: 'QLD', series: 'EXECUTION', breakout: true }),
    settings: settings({ existingQldValue: 2_000, existingTqqqValue: 1_000 }),
  });
  assert.equal(conflict.decision, 'TRIM_EXPOSURE');
  assert.equal(conflict.allocation.tacticalCapitalTargetPct, 0);
}

{
  const defensive = evaluateNasdaqStrategy({
    asOf: '2026-07-24',
    qqqAdjustedBars: bars({ descending: true }),
    tacticalExecutionBars: bars({ product: 'QLD', series: 'EXECUTION', descending: true }),
    settings: settings(),
  });
  assert.equal(defensive.decision, 'DEFENSIVE');
  assert.equal(defensive.allocation.tacticalCapitalTargetPct, 0);
}

{
  const qqq = bars({ count: 420 });
  const qld = qqq.map((bar, index) => ({
    ...bar,
    product: 'QLD',
    close: 40 + (index * 0.08),
    open: 39.97 + (index * 0.08),
    high: 40.05 + (index * 0.08),
    low: 39.92 + (index * 0.08),
  }));
  const tqqq = qqq.map((bar, index) => ({
    ...bar,
    product: 'TQQQ',
    close: 20 + (index * 0.08),
    open: 19.97 + (index * 0.08),
    high: 20.05 + (index * 0.08),
    low: 19.92 + (index * 0.08),
  }));
  const result = runNasdaqBacktest({
    qqq,
    qld,
    tqqq,
    mode: 'QQQ_BUY_HOLD',
    transactionCostPct: 0.1,
  });
  assert.ok(result.observations > 100);
  assert.equal(result.maxEffectiveExposurePct, 100);
  assert.ok(result.cagrPct > 0);
  assert.equal(result.startDate, qqq[251].date);
}

console.log('nasdaq strategy tests passed');
