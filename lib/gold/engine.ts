import {
  GOLD_MODEL_STATUS,
  GOLD_MODEL_VERSION,
  GOLD_POLICY,
  GOLD_PRODUCTS,
} from './policy.ts';
import type {
  GoldCoreReview,
  GoldCoreReviewInput,
  GoldDataQuality,
  GoldDataQualityInput,
  GoldMacroComponentScore,
  GoldMacroInput,
  GoldMacroScore,
  GoldMacroSeriesInput,
  GoldMonthEndClose,
  GoldMonthlyTrend,
  GoldPositionInput,
  GoldPositionPlan,
  GoldPriceBar,
  GoldSeriesPoint,
  GoldStrategyInput,
  GoldStrategyResult,
  GoldTechnicalIndicators,
  GoldTechnicalOptions,
} from './types.ts';

const DAY_MS = 86_400_000;

function round(value: number, digits = 8) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function datePart(value: string) {
  return value.slice(0, 10);
}

function parseDate(value: string) {
  const normalized = datePart(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized
    ? null
    : date;
}

function differenceInDays(later: string, earlier: string) {
  const laterDate = parseDate(later);
  const earlierDate = parseDate(earlier);
  if (!laterDate || !earlierDate) return null;
  return Math.floor((laterDate.getTime() - earlierDate.getTime()) / DAY_MS);
}

function isFinitePositive(value: number) {
  return Number.isFinite(value) && value > 0;
}

function isValidBar(bar: GoldPriceBar) {
  return Boolean(
    parseDate(bar.date)
      && isFinitePositive(bar.open)
      && isFinitePositive(bar.high)
      && isFinitePositive(bar.low)
      && isFinitePositive(bar.close)
      && bar.high >= Math.max(bar.open, bar.low, bar.close)
      && bar.low <= Math.min(bar.open, bar.high, bar.close),
  );
}

function normalizedBars(bars: readonly GoldPriceBar[]) {
  return [...bars]
    .map((bar) => ({ ...bar, date: datePart(bar.date) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function movingAverage(bars: readonly GoldPriceBar[], period: number) {
  return average(bars.slice(-period).map((bar) => bar.close));
}

function trueRange(bar: GoldPriceBar, previous?: GoldPriceBar) {
  if (!previous) return bar.high - bar.low;
  return Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - previous.close),
    Math.abs(bar.low - previous.close),
  );
}

/**
 * Wilder ATR. The initial value is the arithmetic mean of the first `period`
 * true ranges; every subsequent value uses Wilder's recursive smoothing.
 */
export function calculateAtr(bars: readonly GoldPriceBar[], period = GOLD_POLICY.atrPeriod) {
  if (!Number.isInteger(period) || period <= 0 || bars.length < period) return null;
  const ordered = normalizedBars(bars);
  if (ordered.some((bar) => !isValidBar(bar))) return null;
  const ranges = ordered.map((bar, index) => trueRange(bar, ordered[index - 1]));
  let atr = average(ranges.slice(0, period));
  for (let index = period; index < ranges.length; index += 1) {
    atr = ((atr * (period - 1)) + ranges[index]) / period;
  }
  return round(atr);
}

export function extractCompletedMonthEndCloses(
  bars: readonly GoldPriceBar[],
): GoldMonthEndClose[] {
  const ordered = normalizedBars(bars);
  const closes: GoldMonthEndClose[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (current.date.slice(0, 7) !== next.date.slice(0, 7)) {
      closes.push({ date: current.date, close: current.close });
    }
  }
  return closes;
}

function normalizeMonthEnds(monthEnds: readonly GoldMonthEndClose[]) {
  const byMonth = new Map<string, GoldMonthEndClose>();
  for (const point of monthEnds) {
    if (!parseDate(point.date) || !isFinitePositive(point.close)) continue;
    const normalized = { date: datePart(point.date), close: point.close };
    const month = normalized.date.slice(0, 7);
    const existing = byMonth.get(month);
    if (!existing || normalized.date > existing.date) byMonth.set(month, normalized);
  }
  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Uses the latest completed month-end close and includes that close in the
 * six-month average. The signal becomes effective only after the first daily
 * close strictly following the signal date.
 */
export function calculateMonthlyTrend(
  monthEndCloses: readonly GoldMonthEndClose[],
  dailyBars: readonly GoldPriceBar[] = [],
): GoldMonthlyTrend {
  const orderedMonthEnds = normalizeMonthEnds(monthEndCloses);
  const samples = orderedMonthEnds.slice(-GOLD_POLICY.monthlyTrendPeriod);
  if (samples.length < GOLD_POLICY.monthlyTrendPeriod) {
    return {
      signal: 'UNAVAILABLE',
      isEffective: false,
      signalDate: null,
      effectiveFrom: null,
      latestMonthEndClose: null,
      average6MonthEndClose: null,
      samples,
    };
  }

  const latest = samples.at(-1)!;
  const sixMonthAverage = average(samples.map((point) => point.close));
  const effectiveFrom = normalizedBars(dailyBars)
    .find((bar) => bar.date > latest.date)?.date ?? null;

  return {
    signal: latest.close > sixMonthAverage ? 'ON' : 'OFF',
    isEffective: effectiveFrom !== null,
    signalDate: latest.date,
    effectiveFrom,
    latestMonthEndClose: round(latest.close),
    average6MonthEndClose: round(sixMonthAverage),
    samples,
  };
}

export function calculateTechnicalIndicators(
  bars: readonly GoldPriceBar[],
  options: GoldTechnicalOptions = {},
): GoldTechnicalIndicators | null {
  if (bars.length < GOLD_POLICY.minimumPriceBars) return null;
  const ordered = normalizedBars(bars);
  if (ordered.some((bar) => !isValidBar(bar))) return null;
  if (new Set(ordered.map((bar) => bar.date)).size !== ordered.length) return null;

  const latest = ordered.at(-1)!;
  const atr14 = calculateAtr(ordered, GOLD_POLICY.atrPeriod);
  if (atr14 === null) return null;
  const prior20DayHigh = Math.max(
    ...ordered.slice(-(GOLD_POLICY.breakoutPeriod + 1), -1).map((bar) => bar.high),
  );
  const monthEnds = options.completedMonthEndCloses
    ?? extractCompletedMonthEndCloses(ordered);
  const monthlyTrend = calculateMonthlyTrend(monthEnds, ordered);

  return {
    asOf: latest.date,
    close: latest.close,
    ma20: round(movingAverage(ordered, 20)),
    ma50: round(movingAverage(ordered, 50)),
    ma100: round(movingAverage(ordered, 100)),
    ma200: round(movingAverage(ordered, 200)),
    atr14,
    atrPct14: round((atr14 / latest.close) * 100),
    prior20DayHigh: round(prior20DayHigh),
    breakout20: latest.close > prior20DayHigh,
    monthlyTrend,
  };
}

function scoreRealYield(changeBp: number): GoldMacroComponentScore {
  if (changeBp <= -10) return 1;
  if (changeBp >= 10) return -1;
  return 0;
}

function scoreBroadDollar(changePct: number): GoldMacroComponentScore {
  if (changePct <= -1) return 1;
  if (changePct >= 1) return -1;
  return 0;
}

function scoreEtfFlow(netFlow: number): GoldMacroComponentScore {
  if (netFlow > 0) return 1;
  if (netFlow < 0) return -1;
  return 0;
}

function tacticalLimitForScore(score: number): 0 | 0.03 | 0.06 {
  if (score <= -1) return 0;
  if (score <= 1) return 0.03;
  return 0.06;
}

export function calculateMacroScore(
  input: GoldMacroInput,
  weeklyCutoff: string | null = null,
): GoldMacroScore {
  const realYield = Number.isFinite(input.realYield20DayChangeBp)
    ? scoreRealYield(input.realYield20DayChangeBp!)
    : null;
  const broadDollar = Number.isFinite(input.broadDollar20DayChangePct)
    ? scoreBroadDollar(input.broadDollar20DayChangePct!)
    : null;
  const goldEtfFlow = Number.isFinite(input.goldEtfNetFlow)
    ? scoreEtfFlow(input.goldEtfNetFlow!)
    : null;
  const componentValues = [realYield, broadDollar, goldEtfFlow];
  const partialScore = componentValues.reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const missing: GoldMacroScore['missing'][number][] = [];
  if (realYield === null) missing.push('REAL_YIELD');
  if (broadDollar === null) missing.push('BROAD_DOLLAR');
  if (goldEtfFlow === null) missing.push('GOLD_ETF_FLOW');
  const complete = missing.length === 0;

  return {
    complete,
    score: complete ? partialScore : null,
    partialScore,
    tacticalLimitPct: complete ? tacticalLimitForScore(partialScore) : 0,
    weeklyCutoff,
    components: { realYield, broadDollar, goldEtfFlow },
    inputs: { ...input },
    missing,
  };
}

export function getWeeklyFridayCutoff(asOf: string) {
  const date = parseDate(asOf);
  if (!date) return null;
  const daysSinceFriday = (date.getUTCDay() + 2) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceFriday);
  return date.toISOString().slice(0, 10);
}

function observationsThrough(
  points: readonly GoldSeriesPoint[],
  cutoff: string,
) {
  const byDate = new Map<string, GoldSeriesPoint>();
  for (const point of points) {
    if (!parseDate(point.date) || !Number.isFinite(point.value)) continue;
    const date = datePart(point.date);
    if (date <= cutoff) byDate.set(date, { date, value: point.value });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Freezes both FRED series at the latest Friday on or before `asOf` and uses
 * the latest observation versus the observation 20 rows earlier.
 */
export function calculateMacroScoreFromSeries(
  input: GoldMacroSeriesInput,
): GoldMacroScore {
  const cutoff = getWeeklyFridayCutoff(input.asOf);
  if (!cutoff) {
    return calculateMacroScore({
      realYield20DayChangeBp: null,
      broadDollar20DayChangePct: null,
      goldEtfNetFlow: input.goldEtfNetFlow,
      etfReferenceMonth: input.etfReferenceMonth,
    });
  }

  const realYield = observationsThrough(input.realYield, cutoff);
  const broadDollar = observationsThrough(input.broadDollar, cutoff);
  const realLatest = realYield.at(-1);
  const realPrevious = realYield.at(-21);
  const dollarLatest = broadDollar.at(-1);
  const dollarPrevious = broadDollar.at(-21);
  const realYieldChangeBp = realLatest && realPrevious
    ? (realLatest.value - realPrevious.value) * 100
    : null;
  const broadDollarChangePct = dollarLatest && dollarPrevious && dollarPrevious.value > 0
    ? ((dollarLatest.value / dollarPrevious.value) - 1) * 100
    : null;

  return calculateMacroScore({
    realYield20DayChangeBp: realYieldChangeBp,
    broadDollar20DayChangePct: broadDollarChangePct,
    goldEtfNetFlow: input.goldEtfNetFlow,
    realYieldAsOf: realLatest?.date ?? null,
    broadDollarAsOf: dollarLatest?.date ?? null,
    etfReferenceMonth: input.etfReferenceMonth,
  }, cutoff);
}

function monthEndDate(referenceMonth: string) {
  if (!/^\d{4}-\d{2}$/.test(referenceMonth)) return null;
  const [year, month] = referenceMonth.split('-').map(Number);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function assessGoldDataQuality(
  input: GoldDataQualityInput,
): GoldDataQuality {
  const reasons: string[] = [];
  const ordered = normalizedBars(input.bars);
  const maxAgeDays = input.maxPriceAgeDays ?? GOLD_POLICY.maxPriceAgeDays;

  if (input.bars.length < GOLD_POLICY.minimumPriceBars) {
    reasons.push(`상품 OHLC가 ${GOLD_POLICY.minimumPriceBars}봉 미만입니다.`);
  }
  if (ordered.some((bar) => !isValidBar(bar))) {
    reasons.push('상품 OHLC에 유효하지 않은 가격 또는 날짜가 있습니다.');
  }
  if (new Set(ordered.map((bar) => bar.date)).size !== ordered.length) {
    reasons.push('상품 OHLC에 중복 거래일이 있습니다.');
  }
  if (ordered.some((bar) => bar.product && bar.product !== input.product)) {
    reasons.push('선택 상품과 다른 상품의 OHLC가 섞여 있습니다.');
  }

  const latestDate = ordered.at(-1)?.date ?? null;
  const ageDays = latestDate ? differenceInDays(input.asOf, latestDate) : null;
  if (!latestDate) {
    reasons.push('상품 최종 가격 기준일이 없습니다.');
  } else if (ageDays === null || ageDays < 0) {
    reasons.push('상품 가격 기준일과 평가 기준일이 올바르지 않습니다.');
  } else if (ageDays > maxAgeDays) {
    reasons.push(`상품 가격이 ${ageDays}일 지연되었습니다.`);
  }

  const priceComplete = reasons.length === 0;
  const macroReasons: string[] = [];
  if (!input.macro.complete) {
    macroReasons.push('완전한 매크로 입력이 없어 전술 비중을 차단합니다.');
  }
  const referenceMonth = input.macro.inputs.etfReferenceMonth;
  const referenceMonthEnd = referenceMonth ? monthEndDate(referenceMonth) : null;
  if (!referenceMonthEnd) {
    macroReasons.push('WGC ETF 흐름 기준월이 없습니다.');
  } else {
    const etfAgeDays = differenceInDays(input.asOf, referenceMonthEnd);
    if (
      etfAgeDays === null
      || etfAgeDays > GOLD_POLICY.maxEtfFlowAgeAfterMonthEndDays
    ) {
      macroReasons.push('WGC ETF 흐름이 허용된 45일 갱신 주기를 넘었습니다.');
    }
  }
  reasons.push(...macroReasons);

  return {
    status: !priceComplete ? 'BLOCKED' : macroReasons.length > 0 ? 'DEGRADED' : 'OK',
    priceComplete,
    macroComplete: input.macro.complete && macroReasons.length === 0,
    reasons,
  };
}

export function evaluateCoreReview(
  input?: GoldCoreReviewInput | null,
): GoldCoreReview {
  const insufficient = !input
    || input.realYieldMonthlyChangesBp.length < 2
    || input.broadDollarMonthlyChangesPct.length < 2
    || input.realYieldMonthlyChangesBp.slice(-2).some((value) => !Number.isFinite(value))
    || input.broadDollarMonthlyChangesPct.slice(-2).some((value) => !Number.isFinite(value))
    || typeof input.etfDemandWeakening !== 'boolean'
    || typeof input.centralBankDemandWeakening !== 'boolean';

  if (insufficient || !input) {
    return {
      status: 'INSUFFICIENT',
      shouldReview: false,
      ratesAndDollarRisingTwoMonths: false,
      demandWeakening: false,
      reasons: ['코어 재검토에 필요한 2개월 매크로·수요 입력이 부족합니다.'],
    };
  }

  const ratesAndDollarRisingTwoMonths = input.realYieldMonthlyChangesBp
    .slice(-2)
    .every((value) => value > 0)
    && input.broadDollarMonthlyChangesPct.slice(-2).every((value) => value > 0);
  const demandWeakening = input.etfDemandWeakening === true
    && input.centralBankDemandWeakening === true;
  const shouldReview = ratesAndDollarRisingTwoMonths && demandWeakening;
  return {
    status: shouldReview ? 'REVIEW' : 'OK',
    shouldReview,
    ratesAndDollarRisingTwoMonths,
    demandWeakening,
    reasons: shouldReview
      ? ['실질금리와 달러가 2개월 연속 상승했고 ETF·중앙은행 수요가 함께 약화했습니다.']
      : ['코어 자동 매도 조건은 아니며 4% 목표 비중을 유지합니다.'],
  };
}

export function calculatePositionPlan(
  input: GoldPositionInput,
): GoldPositionPlan | null {
  if (
    !isFinitePositive(input.accountEquity)
    || !isFinitePositive(input.entryPrice)
    || !isFinitePositive(input.atr14)
    || !isFinitePositive(input.unitPriceInBaseCurrency ?? input.entryPrice)
    || !Number.isFinite(input.tacticalTargetPct)
    || input.tacticalTargetPct <= 0
  ) {
    return null;
  }

  const riskPct = Math.min(
    Math.max(input.riskPct ?? GOLD_POLICY.defaultRiskPct, 0),
    GOLD_POLICY.maxRiskPct,
  );
  if (riskPct <= 0) return null;
  const stopPrice = Math.max(
    input.entryPrice - (input.atr14 * GOLD_POLICY.atrStopMultiple),
    0,
  );
  const stopDistancePct = (input.entryPrice - stopPrice) / input.entryPrice;
  if (stopDistancePct <= 0) return null;

  const highestClose = isFinitePositive(input.highestCloseSinceEntry ?? 0)
    ? input.highestCloseSinceEntry!
    : input.entryPrice;
  const trailingStopPrice = Math.max(
    highestClose - (input.atr14 * GOLD_POLICY.atrStopMultiple),
    0,
  );
  const riskBudget = input.accountEquity * riskPct;
  const unconstrainedNotional = riskBudget / stopDistancePct;
  const tacticalCapacity = Math.max(
    (input.accountEquity * input.tacticalTargetPct) - (input.existingTacticalValue ?? 0),
    0,
  );
  const totalGoldCapacity = Math.max(
    (input.accountEquity * GOLD_POLICY.maxGoldPct) - (input.existingGoldValue ?? 0),
    0,
  );
  const cappedNotional = Math.min(
    unconstrainedNotional,
    tacticalCapacity,
    totalGoldCapacity,
  );
  const unitPriceInBaseCurrency = input.unitPriceInBaseCurrency ?? input.entryPrice;
  const units = Math.max(Math.floor(cappedNotional / unitPriceInBaseCurrency), 0);
  const actualNotional = units * unitPriceInBaseCurrency;

  let bindingLimit: GoldPositionPlan['bindingLimit'] = 'RISK';
  if (cappedNotional === 0) bindingLimit = 'NONE';
  else if (tacticalCapacity <= unconstrainedNotional && tacticalCapacity <= totalGoldCapacity) {
    bindingLimit = 'TACTICAL_CAP';
  } else if (totalGoldCapacity <= unconstrainedNotional) {
    bindingLimit = 'TOTAL_GOLD_CAP';
  }

  return {
    entryPrice: round(input.entryPrice),
    stopPrice: round(stopPrice),
    trailingStopPrice: round(trailingStopPrice),
    stopDistancePct: round(stopDistancePct),
    riskBudget: round(riskBudget),
    unconstrainedNotional: round(unconstrainedNotional),
    cappedNotional: round(cappedNotional),
    units,
    actualNotional: round(actualNotional),
    actualRisk: round(actualNotional * stopDistancePct),
    bindingLimit,
  };
}

function isMacroScore(value: GoldMacroInput | GoldMacroScore): value is GoldMacroScore {
  return 'components' in value && 'complete' in value;
}

export function evaluateGoldStrategy(
  input: GoldStrategyInput,
): GoldStrategyResult {
  const macro = isMacroScore(input.macro)
    ? input.macro
    : calculateMacroScore(input.macro);
  const quality = assessGoldDataQuality({
    product: input.product,
    bars: input.bars,
    macro,
    asOf: input.asOf,
    maxPriceAgeDays: input.maxPriceAgeDays,
  });
  const technical = quality.priceComplete
    ? calculateTechnicalIndicators(input.bars, {
      completedMonthEndCloses: input.completedMonthEndCloses,
    })
    : null;
  const coreReview = evaluateCoreReview(input.coreReview);
  const reasons = [...quality.reasons];

  const monthlyOn = technical?.monthlyTrend.signal === 'ON'
    && technical.monthlyTrend.isEffective;
  const fastReentry = technical?.monthlyTrend.signal === 'OFF'
    && technical.monthlyTrend.isEffective
    && technical.breakout20
    && macro.complete
    && (macro.score ?? -3) >= 1;

  let tacticalTargetPct: 0 | 0.03 | 0.06 = 0;
  if (
    quality.status === 'OK'
    && !input.riskPaused
    && macro.complete
  ) {
    if (monthlyOn) {
      tacticalTargetPct = macro.tacticalLimitPct;
    } else if (fastReentry) {
      tacticalTargetPct = 0.03;
    }
  }

  const totalTargetPct: 0.04 | 0.07 | 0.1 = tacticalTargetPct === 0.06
    ? 0.1
    : tacticalTargetPct === 0.03
      ? 0.07
      : 0.04;
  const accountEquity = Math.max(
    Number.isFinite(input.accountEquity) ? input.accountEquity : 0,
    0,
  );
  const existingGoldValue = Math.max(input.existingGoldValue ?? 0, 0)
    + Math.max(input.externalPhysicalGoldValue ?? 0, 0);
  const coreTargetValue = accountEquity * GOLD_POLICY.coreTargetPct;
  const tacticalTargetValue = accountEquity * tacticalTargetPct;
  const totalTargetValue = accountEquity * totalTargetPct;

  const product = GOLD_PRODUCTS[input.product];
  const baseCurrency = input.baseCurrency ?? 'KRW';
  let unitPriceInBaseCurrency: number | null = technical?.close ?? null;
  if (technical && product.currency !== baseCurrency) {
    unitPriceInBaseCurrency = isFinitePositive(input.fxRateToBase ?? 0)
      ? technical.close * input.fxRateToBase!
      : null;
    if (unitPriceInBaseCurrency === null && tacticalTargetPct > 0) {
      reasons.push('상품 통화와 기준 통화가 달라 포지션 수량 계산에 환율이 필요합니다.');
    }
  }

  const position = (
    technical
    && tacticalTargetPct > 0
    && unitPriceInBaseCurrency !== null
  )
    ? calculatePositionPlan({
      accountEquity,
      entryPrice: technical.close,
      atr14: technical.atr14,
      tacticalTargetPct,
      existingGoldValue,
      existingTacticalValue: Math.max(input.existingTacticalValue ?? 0, 0),
      unitPriceInBaseCurrency,
      highestCloseSinceEntry: input.highestCloseSinceEntry,
    })
    : null;

  let decision: GoldStrategyResult['decision'];
  if (quality.status === 'BLOCKED') {
    decision = 'BLOCKED';
  } else if (input.riskPaused) {
    decision = 'RISK_PAUSED';
    reasons.push('사용자가 신규 위험 투입을 일시중지했습니다.');
  } else if (coreReview.shouldReview) {
    decision = 'CORE_REVIEW';
    reasons.push(...coreReview.reasons);
  } else if (tacticalTargetPct > 0 && fastReentry) {
    decision = 'FAST_REENTRY';
    reasons.push('20일 최고가 돌파와 매크로 +1 이상으로 전술 한도의 절반만 허용합니다.');
  } else if (tacticalTargetPct > 0 && monthlyOn) {
    decision = 'TREND_ENTRY';
    reasons.push('유효한 6개월 월말 추세와 매크로 비중 조건을 충족했습니다.');
  } else if (existingGoldValue < coreTargetValue) {
    decision = 'CORE_ONLY';
    reasons.push('전술 진입은 대기하고 코어 4%를 분할 구축할 수 있습니다.');
  } else {
    decision = 'WAIT';
    reasons.push('신규 전술 비중을 활성화할 조건이 충족되지 않았습니다.');
  }

  return {
    modelVersion: GOLD_MODEL_VERSION,
    modelStatus: GOLD_MODEL_STATUS,
    product: input.product,
    asOf: datePart(input.asOf),
    decision,
    technical,
    macro,
    quality,
    coreReview,
    allocation: {
      maxGoldPct: GOLD_POLICY.maxGoldPct,
      coreTargetPct: GOLD_POLICY.coreTargetPct,
      tacticalMaxPct: GOLD_POLICY.tacticalMaxPct,
      tacticalTargetPct,
      totalTargetPct,
      coreTargetValue: round(coreTargetValue),
      tacticalTargetValue: round(tacticalTargetValue),
      totalTargetValue: round(totalTargetValue),
      existingGoldValue: round(existingGoldValue),
      targetGapValue: round(totalTargetValue - existingGoldValue),
    },
    position,
    reasons,
  };
}
