import {
  NASDAQ_MODEL_STATUS,
  NASDAQ_MODEL_VERSION,
  NASDAQ_POLICY,
  NASDAQ_PRODUCTS,
} from './policy';
import type {
  NasdaqDataQuality,
  NasdaqExecutionTechnical,
  NasdaqMonthEndTrend,
  NasdaqPositionPlan,
  NasdaqPriceBar,
  NasdaqRegime,
  NasdaqStrategyInput,
  NasdaqStrategyResult,
  NasdaqTacticalProduct,
} from './types';

const DAY_MS = 86_400_000;

function round(value: number, digits = 8) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function validDate(value: string) {
  const normalized = dateOnly(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized;
}

function dayDifference(later: string, earlier: string) {
  if (!validDate(later) || !validDate(earlier)) return Number.POSITIVE_INFINITY;
  return Math.floor(
    (new Date(`${later}T00:00:00Z`).getTime() - new Date(`${earlier}T00:00:00Z`).getTime())
      / DAY_MS,
  );
}

function orderedBars(bars: readonly NasdaqPriceBar[]) {
  return [...bars]
    .map((bar) => ({ ...bar, date: dateOnly(bar.date) }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function isValidBar(bar: NasdaqPriceBar) {
  return validDate(bar.date)
    && [bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite)
    && bar.open > 0
    && bar.high > 0
    && bar.low > 0
    && bar.close > 0
    && bar.high >= Math.max(bar.open, bar.close, bar.low)
    && bar.low <= Math.min(bar.open, bar.close, bar.high);
}

function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function movingAverage(bars: readonly NasdaqPriceBar[], period: number) {
  if (bars.length < period) return null;
  return average(bars.slice(-period).map((bar) => bar.close));
}

export function calculateNasdaqAtr(
  bars: readonly NasdaqPriceBar[],
  period = NASDAQ_POLICY.atrPeriod,
) {
  const ordered = orderedBars(bars);
  if (ordered.length < period || ordered.some((bar) => !isValidBar(bar))) return null;
  const ranges = ordered.map((bar, index) => {
    const previous = ordered[index - 1];
    if (!previous) return bar.high - bar.low;
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previous.close),
      Math.abs(bar.low - previous.close),
    );
  });
  let atr = average(ranges.slice(0, period));
  for (let index = period; index < ranges.length; index += 1) {
    atr = ((atr * (period - 1)) + ranges[index]) / period;
  }
  return round(atr);
}

export function calculateRealizedVolatility20(bars: readonly NasdaqPriceBar[]) {
  const closes = orderedBars(bars).slice(-21).map((bar) => bar.close);
  if (closes.length < 21 || closes.some((close) => close <= 0)) return null;
  const returns = closes.slice(1).map((close, index) => Math.log(close / closes[index]));
  const mean = average(returns);
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0)
    / Math.max(returns.length - 1, 1);
  return round(Math.sqrt(variance) * Math.sqrt(252) * 100);
}

function completedMonthEnds(bars: readonly NasdaqPriceBar[]) {
  const ordered = orderedBars(bars);
  const points: { date: string; close: number }[] = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    if (ordered[index].date.slice(0, 7) !== ordered[index + 1].date.slice(0, 7)) {
      points.push({ date: ordered[index].date, close: ordered[index].close });
    }
  }
  return points;
}

export function calculateTenMonthTrend(
  bars: readonly NasdaqPriceBar[],
): NasdaqMonthEndTrend {
  const ordered = orderedBars(bars);
  const samples = completedMonthEnds(ordered).slice(-NASDAQ_POLICY.monthlyTrendPeriod);
  if (samples.length < NASDAQ_POLICY.monthlyTrendPeriod) {
    return {
      signal: 'UNAVAILABLE',
      signalDate: null,
      effectiveFrom: null,
      isEffective: false,
      latestClose: null,
      average10MonthClose: null,
    };
  }
  const latest = samples.at(-1);
  if (!latest) {
    return {
      signal: 'UNAVAILABLE',
      signalDate: null,
      effectiveFrom: null,
      isEffective: false,
      latestClose: null,
      average10MonthClose: null,
    };
  }
  const average10MonthClose = average(samples.map((point) => point.close));
  const effectiveFrom = ordered.find((bar) => bar.date > latest.date)?.date ?? null;
  return {
    signal: latest.close > average10MonthClose ? 'ON' : 'OFF',
    signalDate: latest.date,
    effectiveFrom,
    isEffective: effectiveFrom !== null,
    latestClose: round(latest.close),
    average10MonthClose: round(average10MonthClose),
  };
}

export function calculateNasdaqRegime(
  qqqAdjustedBars: readonly NasdaqPriceBar[],
): NasdaqRegime | null {
  const bars = orderedBars(qqqAdjustedBars);
  if (
    bars.length < NASDAQ_POLICY.minimumPriceBars
    || bars.some((bar) => !isValidBar(bar) || bar.product !== 'QQQ' || bar.series !== 'ADJUSTED')
  ) return null;
  const lastBar = bars.at(-1);
  if (!lastBar) return null;
  const close = lastBar.close;
  const ma50 = movingAverage(bars, 50);
  const ma200 = movingAverage(bars, 200);
  const priorDayMa200 = movingAverage(bars.slice(0, -1), 200);
  const volatility = calculateRealizedVolatility20(bars);
  if (ma50 === null || ma200 === null || priorDayMa200 === null || volatility === null) return null;
  const prior20DayHigh = Math.max(...bars.slice(-21, -1).map((bar) => bar.high));
  const previous = bars.at(-2)!;
  const aboveMa200TwoCloses = close > ma200 && previous.close > priorDayMa200;
  const monthlyTrend = calculateTenMonthTrend(bars);
  const fastDeRisk = (
    (monthlyTrend.signal === 'OFF' && monthlyTrend.isEffective)
    || (close < ma200 && previous.close < priorDayMa200)
    || (close < ma200 && volatility >= NASDAQ_POLICY.deRiskVolatilityPct)
  );
  return {
    asOf: lastBar.date,
    close: round(close),
    ma50: round(ma50),
    ma200: round(ma200),
    aboveMa200TwoCloses,
    goldenCross: ma50 > ma200,
    prior20DayHigh: round(prior20DayHigh),
    breakout20: close > prior20DayHigh,
    realizedVolatility20Pct: volatility,
    volatilityScale: round(Math.min(1, NASDAQ_POLICY.volatilityTargetPct / volatility), 6),
    monthlyTrend,
    fastDeRisk,
  };
}

export function calculateExecutionTechnical(
  executionBars: readonly NasdaqPriceBar[],
): NasdaqExecutionTechnical | null {
  const bars = orderedBars(executionBars);
  if (
    bars.length < NASDAQ_POLICY.minimumPriceBars
    || bars.some((bar) => !isValidBar(bar) || bar.series !== 'EXECUTION')
    || new Set(bars.map((bar) => bar.product)).size !== 1
  ) return null;
  const atr14 = calculateNasdaqAtr(bars);
  const ma20 = movingAverage(bars, 20);
  const ma50 = movingAverage(bars, 50);
  const ma200 = movingAverage(bars, 200);
  if (atr14 === null || ma20 === null || ma50 === null || ma200 === null) return null;
  const latest = bars.at(-1);
  if (!latest) return null;
  const prior20DayHigh = Math.max(...bars.slice(-21, -1).map((bar) => bar.high));
  return {
    product: latest.product,
    asOf: latest.date,
    close: round(latest.close),
    ma20: round(ma20),
    ma50: round(ma50),
    ma200: round(ma200),
    atr14,
    atrPct14: round((atr14 / latest.close) * 100),
    prior20DayHigh: round(prior20DayHigh),
    breakout20: latest.close > prior20DayHigh,
  };
}

export function assessNasdaqDataQuality(input: {
  asOf: string;
  qqqAdjustedBars: readonly NasdaqPriceBar[];
  executionBars: readonly NasdaqPriceBar[];
  tacticalProduct: NasdaqTacticalProduct;
  feeMetadataFresh: boolean;
  maxPriceAgeDays?: number;
}): NasdaqDataQuality {
  const reasons: string[] = [];
  const qqq = orderedBars(input.qqqAdjustedBars);
  const execution = orderedBars(input.executionBars);
  if (qqq.length < NASDAQ_POLICY.minimumPriceBars) reasons.push('QQQ 조정주가가 252봉 미만입니다.');
  if (execution.length < NASDAQ_POLICY.minimumPriceBars) reasons.push('선택 상품 OHLC가 252봉 미만입니다.');
  if (qqq.some((bar) => bar.product !== 'QQQ' || bar.series !== 'ADJUSTED')) {
    reasons.push('QQQ 국면 데이터에 다른 상품 또는 미조정 가격이 섞였습니다.');
  }
  if (execution.some(
    (bar) => bar.product !== input.tacticalProduct || bar.series !== 'EXECUTION',
  )) {
    reasons.push('실행 가격에 다른 상품 또는 조정주가가 섞였습니다.');
  }
  if (qqq.some((bar) => !isValidBar(bar)) || execution.some((bar) => !isValidBar(bar))) {
    reasons.push('가격 데이터 형식이 유효하지 않습니다.');
  }
  const qqqAsOf = qqq.at(-1)?.date ?? null;
  const executionAsOf = execution.at(-1)?.date ?? null;
  const maxAge = input.maxPriceAgeDays ?? NASDAQ_POLICY.maxPriceAgeDays;
  if (!qqqAsOf || dayDifference(input.asOf, qqqAsOf) > maxAge) {
    reasons.push('QQQ 조정주가가 누락되었거나 오래되었습니다.');
  }
  if (!executionAsOf || dayDifference(input.asOf, executionAsOf) > maxAge) {
    reasons.push('선택 상품 실행 가격이 누락되었거나 오래되었습니다.');
  }
  if (qqqAsOf && executionAsOf && Math.abs(dayDifference(qqqAsOf, executionAsOf)) > 3) {
    reasons.push('QQQ 국면과 실행 상품의 기준 거래일이 일치하지 않습니다.');
  }
  const blocked = reasons.length > 0;
  if (!input.feeMetadataFresh) reasons.push('상품 비용 정보의 재검토일이 지났습니다.');
  return {
    status: blocked ? 'BLOCKED' : input.feeMetadataFresh ? 'VALID' : 'DEGRADED',
    reasons,
    qqqAdjustedBars: qqq.length,
    executionBars: execution.length,
    asOf: [qqqAsOf, executionAsOf].filter(Boolean).sort().at(0) ?? null,
  };
}

export function calculateNasdaqPosition(input: {
  product: NasdaqTacticalProduct;
  accountEquity: number;
  entryPrice: number;
  unitPriceInBase?: number | null;
  atr14: number;
  tacticalTargetPct: number;
  existingCapitalValue: number;
  existingEffectiveExposureValue: number;
  existingSelectedTacticalValue: number;
  highestClose?: number | null;
  riskPaused?: boolean;
}): NasdaqPositionPlan | null {
  const unitPriceInBase = input.unitPriceInBase === undefined
    ? input.entryPrice
    : input.unitPriceInBase;
  if (
    input.accountEquity <= 0
    || input.entryPrice <= 0
    || unitPriceInBase === null
    || unitPriceInBase <= 0
    || input.atr14 <= 0
    || input.tacticalTargetPct <= 0
  ) return null;
  const product = NASDAQ_PRODUCTS[input.product];
  const riskPct = input.product === 'TQQQ'
    ? NASDAQ_POLICY.tqqqRiskPct
    : NASDAQ_POLICY.qldRiskPct;
  const stopPrice = Math.max(0, input.entryPrice - (NASDAQ_POLICY.atrMultiple * input.atr14));
  const stopDistancePct = (input.entryPrice - stopPrice) / input.entryPrice;
  const riskBudget = input.accountEquity * riskPct;
  const unconstrainedNotional = riskBudget / stopDistancePct;
  const tacticalRemaining = Math.max(
    0,
    (input.accountEquity * input.tacticalTargetPct) - input.existingSelectedTacticalValue,
  );
  const capitalRemaining = Math.max(
    0,
    (input.accountEquity * NASDAQ_POLICY.maxCapitalPct) - input.existingCapitalValue,
  );
  const effectiveRemaining = Math.max(
    0,
    ((input.accountEquity * NASDAQ_POLICY.maxEffectiveExposurePct)
      - input.existingEffectiveExposureValue) / product.leverage,
  );
  const limits = input.riskPaused
    ? [
        { name: 'PAUSED' as const, value: 0 },
      ]
    : [
        { name: 'RISK' as const, value: unconstrainedNotional },
        { name: 'CAPITAL_CAP' as const, value: Math.min(tacticalRemaining, capitalRemaining) },
        { name: 'EFFECTIVE_EXPOSURE_CAP' as const, value: effectiveRemaining },
      ];
  const binding = limits.reduce((lowest, current) => (
    current.value < lowest.value ? current : lowest
  ));
  const units = Math.max(0, Math.floor(binding.value / unitPriceInBase));
  const actualNotional = units * unitPriceInBase;
  const highestClose = Math.max(input.entryPrice, input.highestClose ?? input.entryPrice);
  return {
    product: input.product,
    entryPrice: round(input.entryPrice),
    stopPrice: round(stopPrice),
    trailingStopPrice: round(Math.max(0, highestClose - (NASDAQ_POLICY.atrMultiple * input.atr14))),
    stopDistancePct: round(stopDistancePct * 100),
    riskBudget: round(riskBudget, 2),
    unconstrainedNotional: round(unconstrainedNotional, 2),
    cappedNotional: round(binding.value, 2),
    units,
    actualNotional: round(actualNotional, 2),
    bindingLimit: binding.name,
  };
}

function actionCopy(decision: NasdaqStrategyResult['decision'], product: NasdaqTacticalProduct) {
  switch (decision) {
    case 'DATA_BLOCKED':
      return { now: '데이터 복구 전 신규 투입을 멈춥니다.', avoid: '마지막 성공값만 보고 매수하지 않습니다.', nextCondition: '조정주가와 실행 OHLC가 모두 정상화되어야 합니다.' };
    case 'RISK_PAUSED':
      return { now: '기존 노출만 점검합니다.', avoid: 'QQQ·레버리지 신규 매수를 하지 않습니다.', nextCondition: '위험 일시중지를 해제하고 한도를 재확인합니다.' };
    case 'DELEVERAGE':
      return { now: `${product} 전술 노출을 축소·청산합니다.`, avoid: '하락 중 물타기를 하지 않습니다.', nextCondition: '10개월 추세와 200일선 조건이 다시 회복되어야 합니다.' };
    case 'TRIM_EXPOSURE':
      return { now: '유효 나스닥 노출을 30% 이하로 줄입니다.', avoid: '추가 레버리지를 투입하지 않습니다.', nextCondition: '한도 복귀 후에만 신규 계획을 계산합니다.' };
    case 'TQQQ_READY':
      return { now: 'TQQQ 제한 전술 진입 조건을 검토합니다.', avoid: '3배 일일 목표를 장기 3배 수익으로 오해하지 않습니다.', nextCondition: '추세 유지·20일 돌파·RV20 18% 이하가 계속 필요합니다.' };
    case 'QLD_READY':
      return { now: 'QLD 전술 수량과 2ATR 손절을 확인합니다.', avoid: 'TQQQ와 동시에 보유하지 않습니다.', nextCondition: '10개월 추세 또는 200일선 이탈 시 디레버리징합니다.' };
    case 'QQQ_ACCUMULATE':
      return { now: 'QQQ 코어 10% 목표를 3회 분할합니다.', avoid: '코어를 한 번에 채우지 않습니다.', nextCondition: '코어 충족 후에만 레버리지 전술을 검토합니다.' };
    case 'DEFENSIVE':
      return { now: '현금 대기와 기존 QQQ 코어 점검이 우선입니다.', avoid: 'QLD·TQQQ 신규 진입을 하지 않습니다.', nextCondition: '월말 10개월 추세 ON과 QQQ 200일선 2일 회복이 필요합니다.' };
    default:
      return { now: 'QQQ 코어를 유지합니다.', avoid: '조건 없는 레버리지 추격 매수를 하지 않습니다.', nextCondition: '선택 상품의 전술 조건 충족 여부를 기다립니다.' };
  }
}

export function evaluateNasdaqStrategy(input: NasdaqStrategyInput): NasdaqStrategyResult {
  const tacticalProduct = input.settings.tacticalProduct;
  const feeMetadataFresh = input.feeMetadataFresh ?? (
    NASDAQ_PRODUCTS[tacticalProduct].feeReviewAfter >= input.asOf
  );
  const quality = assessNasdaqDataQuality({
    asOf: input.asOf,
    qqqAdjustedBars: input.qqqAdjustedBars,
    executionBars: input.tacticalExecutionBars,
    tacticalProduct,
    feeMetadataFresh,
    maxPriceAgeDays: input.maxPriceAgeDays,
  });
  const regime = calculateNasdaqRegime(input.qqqAdjustedBars);
  const execution = calculateExecutionTechnical(input.tacticalExecutionBars);
  const settings = input.settings;
  const existingCapitalValue = settings.externalNasdaqValue
    + settings.existingQqqValue
    + settings.existingQldValue
    + settings.existingTqqqValue;
  const existingEffectiveExposureValue = settings.externalNasdaqValue
    + settings.existingQqqValue
    + (settings.existingQldValue * 2)
    + (settings.existingTqqqValue * 3);
  const effectivePct = settings.accountEquity > 0
    ? existingEffectiveExposureValue / settings.accountEquity
    : 0;
  const selectedExisting = tacticalProduct === 'QLD'
    ? settings.existingQldValue
    : settings.existingTqqqValue;
  const anyTacticalHeld = settings.existingQldValue > 0 || settings.existingTqqqValue > 0;
  const monthlyOn = regime?.monthlyTrend.signal === 'ON' && regime.monthlyTrend.isEffective;
  const generalLeverageReady = Boolean(
    regime
    && monthlyOn
    && regime.aboveMa200TwoCloses
    && regime.realizedVolatility20Pct < NASDAQ_POLICY.leverageBlockVolatilityPct
    && !input.stoppedOrExitedToday,
  );
  const qldReady = tacticalProduct === 'QLD'
    && generalLeverageReady
    && quality.status === 'VALID';
  const tqqqReady = tacticalProduct === 'TQQQ'
    && generalLeverageReady
    && quality.status === 'VALID'
    && settings.tqqqOptIn
    && Boolean(regime?.goldenCross)
    && Boolean(regime?.breakout20)
    && (regime?.realizedVolatility20Pct ?? Infinity) <= NASDAQ_POLICY.tqqqMaxVolatilityPct;

  let tacticalCapitalTargetPct = 0;
  if (quality.status === 'VALID' && qldReady && regime) {
    tacticalCapitalTargetPct = NASDAQ_POLICY.qldMaxCapitalPct * regime.volatilityScale;
  }
  if (quality.status === 'VALID' && tqqqReady && regime) {
    tacticalCapitalTargetPct = NASDAQ_POLICY.tqqqMaxCapitalPct * regime.volatilityScale;
  }
  tacticalCapitalTargetPct = round(tacticalCapitalTargetPct, 6);

  let decision: NasdaqStrategyResult['decision'];
  const reasons: string[] = [...quality.reasons];
  if (quality.status === 'BLOCKED' || !regime || !execution) {
    decision = 'DATA_BLOCKED';
  } else if (settings.riskPaused) {
    decision = 'RISK_PAUSED';
    tacticalCapitalTargetPct = 0;
  } else if (regime.fastDeRisk && anyTacticalHeld) {
    decision = 'DELEVERAGE';
    tacticalCapitalTargetPct = 0;
    reasons.push('월말 추세 또는 QQQ 200일선 기반 빠른 위험 축소 조건이 발생했습니다.');
  } else if (effectivePct > NASDAQ_POLICY.maxEffectiveExposurePct) {
    decision = 'TRIM_EXPOSURE';
    tacticalCapitalTargetPct = 0;
    reasons.push('현재 유효 나스닥 노출이 30% 상한을 초과했습니다.');
  } else if (tqqqReady) {
    decision = 'TQQQ_READY';
    reasons.push('TQQQ 고급 진입 게이트가 모두 충족되었습니다.');
  } else if (qldReady) {
    decision = 'QLD_READY';
    reasons.push('QLD 추세·변동성 게이트가 충족되었습니다.');
  } else if (
    monthlyOn
    && regime.aboveMa200TwoCloses
    && settings.accountEquity > 0
    && settings.existingQqqValue < settings.accountEquity * NASDAQ_POLICY.qqqCoreTargetPct
  ) {
    decision = 'QQQ_ACCUMULATE';
    reasons.push('QQQ 코어 목표가 미달이고 장기·중기 추세가 양호합니다.');
  } else if (!monthlyOn || !regime.aboveMa200TwoCloses) {
    decision = 'DEFENSIVE';
    reasons.push('10개월 추세 또는 200일선 확인 조건이 충족되지 않았습니다.');
  } else {
    decision = 'QQQ_HOLD';
    reasons.push('QQQ 코어 유지가 우선이며 선택 레버리지 조건은 대기 상태입니다.');
  }

  if (tacticalProduct === 'TQQQ' && !settings.tqqqOptIn) {
    tacticalCapitalTargetPct = 0;
    reasons.push('TQQQ 위험 확인이 잠겨 있습니다.');
  }
  if (settings.existingQldValue > 0 && settings.existingTqqqValue > 0) {
    tacticalCapitalTargetPct = 0;
    reasons.push('QLD와 TQQQ 동시 보유가 감지되어 신규 전술 비중을 차단했습니다.');
    if (decision !== 'DATA_BLOCKED' && decision !== 'RISK_PAUSED') decision = 'TRIM_EXPOSURE';
  }

  const tacticalLeverage = NASDAQ_PRODUCTS[tacticalProduct].leverage;
  const qqqTargetPct = (
    quality.status !== 'BLOCKED'
    && monthlyOn
    && Boolean(regime?.aboveMa200TwoCloses)
  ) ? NASDAQ_POLICY.qqqCoreTargetPct : Math.min(
    NASDAQ_POLICY.qqqCoreTargetPct,
    settings.accountEquity > 0 ? settings.existingQqqValue / settings.accountEquity : 0,
  );
  const totalCapitalTargetPct = Math.min(
    NASDAQ_POLICY.maxCapitalPct,
    qqqTargetPct + tacticalCapitalTargetPct,
  );
  const totalEffectiveTargetPct = Math.min(
    NASDAQ_POLICY.maxEffectiveExposurePct,
    qqqTargetPct + (tacticalCapitalTargetPct * tacticalLeverage),
  );
  const position = execution && ['QLD_READY', 'TQQQ_READY'].includes(decision)
    ? calculateNasdaqPosition({
        product: tacticalProduct,
        accountEquity: settings.accountEquity,
        entryPrice: execution.close,
        unitPriceInBase: settings.baseCurrency === 'USD'
          ? execution.close
          : input.usdKrw && input.usdKrw > 0
            ? execution.close * input.usdKrw
            : null,
        atr14: execution.atr14,
        tacticalTargetPct: tacticalCapitalTargetPct,
        existingCapitalValue,
        existingEffectiveExposureValue,
        existingSelectedTacticalValue: selectedExisting,
        highestClose: input.highestTacticalClose,
        riskPaused: settings.riskPaused,
      })
    : null;

  return {
    modelVersion: NASDAQ_MODEL_VERSION,
    modelStatus: NASDAQ_MODEL_STATUS,
    asOf: input.asOf,
    decision,
    regime,
    execution,
    quality,
    settings,
    allocation: {
      maxCapitalPct: NASDAQ_POLICY.maxCapitalPct,
      maxEffectiveExposurePct: NASDAQ_POLICY.maxEffectiveExposurePct,
      qqqCoreTargetPct: NASDAQ_POLICY.qqqCoreTargetPct,
      tacticalCapitalTargetPct,
      tacticalEffectiveTargetPct: round(tacticalCapitalTargetPct * tacticalLeverage, 6),
      totalCapitalTargetPct: round(totalCapitalTargetPct, 6),
      totalEffectiveTargetPct: round(totalEffectiveTargetPct, 6),
      existingCapitalValue: round(existingCapitalValue, 2),
      existingEffectiveExposureValue: round(existingEffectiveExposureValue, 2),
      capitalTargetValue: round(settings.accountEquity * totalCapitalTargetPct, 2),
      effectiveTargetValue: round(settings.accountEquity * totalEffectiveTargetPct, 2),
      targetGapValue: round(
        (settings.accountEquity * totalCapitalTargetPct) - existingCapitalValue,
        2,
      ),
    },
    position,
    actions: actionCopy(decision, tacticalProduct),
    reasons,
  };
}
