import assert from 'node:assert/strict';
import {
  assessGoldDataQuality,
  calculateMacroScore,
  calculateMacroScoreFromSeries,
  calculateMonthlyTrend,
  calculatePositionPlan,
  calculateTechnicalIndicators,
  evaluateCoreReview,
  evaluateGoldStrategy,
  getWeeklyFridayCutoff,
} from '../lib/gold/engine.ts';
import {
  buildMonthlySignalTimeline,
  runGoldBacktest,
} from '../lib/gold/backtest.ts';
import {
  GOLD_MODEL_VERSION,
  GOLD_POLICY,
  GOLD_PRODUCTS,
} from '../lib/gold/policy.ts';

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function businessDatesEnding(count, end = '2026-07-24') {
  const result = [];
  const cursor = new Date(`${end}T00:00:00.000Z`);
  while (result.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) result.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return result;
}

function priceBars({
  count = 220,
  close = 100,
  breakout = false,
  product = 'GLD',
  end = '2026-07-24',
} = {}) {
  const bars = businessDatesEnding(count, end).map((date) => ({
    date,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000,
    product,
  }));
  if (breakout) {
    bars[bars.length - 1] = {
      ...bars.at(-1),
      open: close,
      high: close + 4,
      low: close - 1,
      close: close + 3,
    };
  }
  return bars;
}

const onMonthEnds = [
  { date: '2026-01-30', close: 100 },
  { date: '2026-02-27', close: 100 },
  { date: '2026-03-31', close: 100 },
  { date: '2026-04-30', close: 100 },
  { date: '2026-05-29', close: 100 },
  { date: '2026-06-30', close: 110 },
];

const offMonthEnds = [
  { date: '2026-01-30', close: 100 },
  { date: '2026-02-27', close: 100 },
  { date: '2026-03-31', close: 100 },
  { date: '2026-04-30', close: 100 },
  { date: '2026-05-29', close: 100 },
  { date: '2026-06-30', close: 90 },
];

function macroInput(overrides = {}) {
  return {
    realYield20DayChangeBp: -10,
    broadDollar20DayChangePct: -1,
    goldEtfNetFlow: 1,
    realYieldAsOf: '2026-07-24',
    broadDollarAsOf: '2026-07-24',
    etfReferenceMonth: '2026-06',
    ...overrides,
  };
}

run('exposes only the three approved products with provider metadata', () => {
  assert.deepEqual(Object.keys(GOLD_PRODUCTS).sort(), ['132030', '411060', 'GLD']);
  assert.equal(GOLD_PRODUCTS.GLD.yahooTicker, 'GLD');
  assert.equal(GOLD_PRODUCTS.GLD.kisExchange, 'AMS');
  assert.equal(GOLD_PRODUCTS['411060'].yahooTicker, '411060.KS');
  assert.equal(GOLD_PRODUCTS['132030'].hedge, 'HEDGED');
  assert.equal(GOLD_POLICY.leverageEnabled, false);
});

run('calculates MA20/50/100/200, Wilder ATR14 and previous-20-bar breakout', () => {
  const indicators = calculateTechnicalIndicators(priceBars({ breakout: true }), {
    completedMonthEndCloses: onMonthEnds,
  });
  assert.ok(indicators);
  assert.equal(indicators.ma200, 100.015);
  assert.equal(indicators.ma100, 100.03);
  assert.equal(indicators.ma50, 100.06);
  assert.equal(indicators.ma20, 100.15);
  assert.ok(indicators.atr14 > 2);
  assert.equal(indicators.prior20DayHigh, 101);
  assert.equal(indicators.breakout20, true);
});

run('includes the latest month-end in the six-month average and waits until next close', () => {
  const noNextClose = calculateMonthlyTrend(onMonthEnds, [
    { date: '2026-06-30', open: 110, high: 110, low: 110, close: 110 },
  ]);
  assert.equal(noNextClose.signal, 'ON');
  assert.equal(noNextClose.average6MonthEndClose, 101.66666667);
  assert.equal(noNextClose.isEffective, false);

  const nextClose = calculateMonthlyTrend(onMonthEnds, [
    { date: '2026-06-30', open: 110, high: 110, low: 110, close: 110 },
    { date: '2026-07-01', open: 111, high: 111, low: 111, close: 111 },
  ]);
  assert.equal(nextClose.signal, 'ON');
  assert.equal(nextClose.effectiveFrom, '2026-07-01');
  assert.equal(nextClose.isEffective, true);
});

run('applies inclusive macro score boundaries', () => {
  const bullish = calculateMacroScore(macroInput());
  assert.equal(bullish.score, 3);
  assert.equal(bullish.tacticalLimitPct, 0.06);
  assert.deepEqual(bullish.components, {
    realYield: 1,
    broadDollar: 1,
    goldEtfFlow: 1,
  });

  const bearish = calculateMacroScore(macroInput({
    realYield20DayChangeBp: 10,
    broadDollar20DayChangePct: 1,
    goldEtfNetFlow: -1,
  }));
  assert.equal(bearish.score, -3);
  assert.equal(bearish.tacticalLimitPct, 0);

  const neutral = calculateMacroScore(macroInput({
    realYield20DayChangeBp: -9.999,
    broadDollar20DayChangePct: 0.999,
    goldEtfNetFlow: 0,
  }));
  assert.equal(neutral.score, 0);
  assert.equal(neutral.tacticalLimitPct, 0.03);
});

run('freezes FRED changes at Friday and compares exactly 20 earlier observations', () => {
  const dates = businessDatesEnding(21, '2026-07-24');
  const realYield = dates.map((date, index) => ({
    date,
    value: 2 - (index * 0.005),
  }));
  const broadDollar = dates.map((date, index) => ({
    date,
    value: 100 - (index * 0.05),
  }));
  realYield.push({ date: '2026-07-27', value: 5 });
  broadDollar.push({ date: '2026-07-27', value: 150 });

  assert.equal(getWeeklyFridayCutoff('2026-07-26'), '2026-07-24');
  const score = calculateMacroScoreFromSeries({
    asOf: '2026-07-26',
    realYield,
    broadDollar,
    goldEtfNetFlow: 2,
    etfReferenceMonth: '2026-06',
  });
  assert.equal(score.weeklyCutoff, '2026-07-24');
  assert.equal(score.inputs.realYieldAsOf, '2026-07-24');
  assert.ok(Math.abs(score.inputs.realYield20DayChangeBp + 10) < 1e-9);
  assert.ok(Math.abs(score.inputs.broadDollar20DayChangePct + 1) < 1e-9);
  assert.equal(score.score, 3);
});

run('fails macro scoring closed when any component is missing', () => {
  const score = calculateMacroScore(macroInput({ goldEtfNetFlow: null }));
  assert.equal(score.complete, false);
  assert.equal(score.score, null);
  assert.equal(score.tacticalLimitPct, 0);
  assert.deepEqual(score.missing, ['GOLD_ETF_FLOW']);
});

run('blocks insufficient, stale and mixed product price data', () => {
  const completeMacro = calculateMacroScore(macroInput());
  const insufficient = assessGoldDataQuality({
    product: 'GLD',
    bars: priceBars({ count: 199 }),
    macro: completeMacro,
    asOf: '2026-07-24',
  });
  assert.equal(insufficient.status, 'BLOCKED');

  const mixed = priceBars();
  mixed[0] = { ...mixed[0], product: '411060' };
  const mixedQuality = assessGoldDataQuality({
    product: 'GLD',
    bars: mixed,
    macro: completeMacro,
    asOf: '2026-07-24',
  });
  assert.equal(mixedQuality.status, 'BLOCKED');
  assert.ok(mixedQuality.reasons.some((reason) => reason.includes('섞여')));

  const stale = assessGoldDataQuality({
    product: 'GLD',
    bars: priceBars(),
    macro: completeMacro,
    asOf: '2026-08-05',
  });
  assert.equal(stale.status, 'BLOCKED');
});

run('degrades stale WGC data and incomplete macro data without neutral substitution', () => {
  const staleWgc = assessGoldDataQuality({
    product: 'GLD',
    bars: priceBars(),
    macro: calculateMacroScore(macroInput({ etfReferenceMonth: '2026-05' })),
    asOf: '2026-07-24',
  });
  assert.equal(staleWgc.status, 'DEGRADED');

  const strategy = evaluateGoldStrategy({
    product: 'GLD',
    bars: priceBars({ breakout: true }),
    macro: macroInput({ goldEtfNetFlow: null }),
    asOf: '2026-07-24',
    accountEquity: 100_000,
    baseCurrency: 'USD',
    completedMonthEndCloses: onMonthEnds,
  });
  assert.equal(strategy.quality.status, 'DEGRADED');
  assert.equal(strategy.allocation.tacticalTargetPct, 0);
  assert.equal(strategy.allocation.coreTargetPct, 0.04);
});

run('maps effective monthly trend and macro scores to 0/3/6 percent tactical targets', () => {
  const common = {
    product: 'GLD',
    bars: priceBars(),
    asOf: '2026-07-24',
    accountEquity: 100_000,
    baseCurrency: 'USD',
    completedMonthEndCloses: onMonthEnds,
  };
  const full = evaluateGoldStrategy({ ...common, macro: macroInput() });
  const half = evaluateGoldStrategy({
    ...common,
    macro: macroInput({
      realYield20DayChangeBp: 0,
      broadDollar20DayChangePct: 0,
      goldEtfNetFlow: 1,
    }),
  });
  const none = evaluateGoldStrategy({
    ...common,
    macro: macroInput({
      realYield20DayChangeBp: 10,
      broadDollar20DayChangePct: 0,
      goldEtfNetFlow: 0,
    }),
  });
  assert.equal(full.allocation.tacticalTargetPct, 0.06);
  assert.equal(full.allocation.totalTargetPct, 0.1);
  assert.equal(half.allocation.tacticalTargetPct, 0.03);
  assert.equal(half.allocation.totalTargetPct, 0.07);
  assert.equal(none.allocation.tacticalTargetPct, 0);
  assert.equal(none.allocation.totalTargetPct, 0.04);
});

run('caps fast re-entry at half the tactical maximum', () => {
  const strategy = evaluateGoldStrategy({
    product: 'GLD',
    bars: priceBars({ breakout: true }),
    macro: macroInput(),
    asOf: '2026-07-24',
    accountEquity: 100_000,
    baseCurrency: 'USD',
    completedMonthEndCloses: offMonthEnds,
  });
  assert.equal(strategy.decision, 'FAST_REENTRY');
  assert.equal(strategy.allocation.tacticalTargetPct, 0.03);
});

run('uses 2ATR stops and caps risk sizing by tactical and total-gold capacity', () => {
  const tacticalCap = calculatePositionPlan({
    accountEquity: 100_000,
    entryPrice: 100,
    atr14: 2,
    highestCloseSinceEntry: 120,
    tacticalTargetPct: 0.06,
    existingGoldValue: 4_000,
    existingTacticalValue: 0,
  });
  assert.ok(tacticalCap);
  assert.equal(tacticalCap.stopPrice, 96);
  assert.equal(tacticalCap.trailingStopPrice, 116);
  assert.equal(tacticalCap.riskBudget, 500);
  assert.equal(tacticalCap.unconstrainedNotional, 12_500);
  assert.equal(tacticalCap.cappedNotional, 6_000);
  assert.equal(tacticalCap.units, 60);
  assert.equal(tacticalCap.actualRisk, 240);
  assert.equal(tacticalCap.bindingLimit, 'TACTICAL_CAP');

  const totalCap = calculatePositionPlan({
    accountEquity: 100_000,
    entryPrice: 100,
    atr14: 2,
    tacticalTargetPct: 0.06,
    existingGoldValue: 9_500,
    existingTacticalValue: 0,
  });
  assert.equal(totalCap.cappedNotional, 500);
  assert.equal(totalCap.units, 5);
  assert.equal(totalCap.bindingLimit, 'TOTAL_GOLD_CAP');
});

run('raises CORE_REVIEW only when both macro pairs rise twice and both demands weaken', () => {
  const review = evaluateCoreReview({
    realYieldMonthlyChangesBp: [3, 5],
    broadDollarMonthlyChangesPct: [0.2, 0.3],
    etfDemandWeakening: true,
    centralBankDemandWeakening: true,
  });
  assert.equal(review.shouldReview, true);
  assert.equal(review.status, 'REVIEW');

  const keep = evaluateCoreReview({
    realYieldMonthlyChangesBp: [3, -1],
    broadDollarMonthlyChangesPct: [0.2, 0.3],
    etfDemandWeakening: true,
    centralBankDemandWeakening: true,
  });
  assert.equal(keep.shouldReview, false);
  assert.equal(keep.status, 'OK');
});

run('keeps model research-only and leverage disabled', () => {
  const result = evaluateGoldStrategy({
    product: 'GLD',
    bars: priceBars(),
    macro: macroInput(),
    asOf: '2026-07-24',
    accountEquity: 100_000,
    baseCurrency: 'USD',
    completedMonthEndCloses: onMonthEnds,
  });
  assert.equal(result.modelVersion, GOLD_MODEL_VERSION);
  assert.equal(result.modelStatus, 'RESEARCH_ONLY');
  assert.equal(GOLD_POLICY.leverageEnabled, false);
});

run('backtest applies a month-end signal only after the next trading-day close', () => {
  const closes = [
    ['2026-01-02', 100], ['2026-01-30', 100],
    ['2026-02-02', 100], ['2026-02-27', 100],
    ['2026-03-02', 100], ['2026-03-31', 100],
    ['2026-04-01', 100], ['2026-04-30', 100],
    ['2026-05-01', 100], ['2026-05-29', 100],
    ['2026-06-01', 100], ['2026-06-30', 200],
    ['2026-07-01', 400], ['2026-07-02', 800],
  ];
  const bars = closes.map(([date, close]) => ({
    date,
    open: close,
    high: close,
    low: close,
    close,
  }));
  const timeline = buildMonthlySignalTimeline(bars);
  assert.equal(timeline.get(12), 'ON');

  const result = runGoldBacktest({
    bars,
    mode: 'SIX_MONTH_TREND',
    transactionCostPct: 0,
  });
  assert.equal(result.curve[12].date, '2026-07-01');
  assert.equal(result.curve[12].equity, 1);
  assert.equal(result.curve[12].exposure, 1);
  assert.equal(result.curve[13].equity, 2);
});

console.log('gold strategy tests passed');
