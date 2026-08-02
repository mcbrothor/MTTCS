import { GOLD_POLICY } from './policy.ts';
import type {
  GoldBacktestInput,
  GoldBacktestMode,
  GoldBacktestPoint,
  GoldBacktestResult,
  GoldPriceBar,
  GoldMonthlyTrendSignal,
} from './types.ts';

const DAY_MS = 86_400_000;
const TRADING_DAYS_PER_YEAR = 252;

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function validBar(bar: GoldPriceBar) {
  return /^\d{4}-\d{2}-\d{2}/.test(bar.date)
    && Number.isFinite(bar.open)
    && Number.isFinite(bar.high)
    && Number.isFinite(bar.low)
    && Number.isFinite(bar.close)
    && bar.open > 0
    && bar.high >= Math.max(bar.open, bar.close, bar.low)
    && bar.low > 0
    && bar.low <= Math.min(bar.open, bar.close);
}

function orderedBars(bars: readonly GoldPriceBar[]) {
  return [...bars]
    .map((bar) => ({ ...bar, date: bar.date.slice(0, 10) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function initialExposure(mode: GoldBacktestMode) {
  if (mode === 'BUY_AND_HOLD') return 1;
  if (mode === 'CORE_TACTICAL') return 0.4;
  return 0;
}

function exposureForSignal(
  mode: GoldBacktestMode,
  signal: Exclude<GoldMonthlyTrendSignal, 'UNAVAILABLE'>,
) {
  if (mode === 'BUY_AND_HOLD') return 1;
  if (mode === 'SIX_MONTH_TREND') return signal === 'ON' ? 1 : 0;
  return signal === 'ON' ? 1 : 0.4;
}

/**
 * Maps a signal generated at a month-end close to the next observed trading
 * day's close. Consumers must apply that day's return with the old exposure
 * and change exposure only after the close, preventing look-ahead.
 */
export function buildMonthlySignalTimeline(
  bars: readonly GoldPriceBar[],
) {
  const ordered = orderedBars(bars);
  const completedMonthEnds: Array<{ index: number; close: number }> = [];
  const effectiveSignals = new Map<
    number,
    Exclude<GoldMonthlyTrendSignal, 'UNAVAILABLE'>
  >();

  for (let index = 0; index < ordered.length - 1; index += 1) {
    if (ordered[index].date.slice(0, 7) === ordered[index + 1].date.slice(0, 7)) {
      continue;
    }
    completedMonthEnds.push({ index, close: ordered[index].close });
    const recent = completedMonthEnds.slice(-GOLD_POLICY.monthlyTrendPeriod);
    if (recent.length < GOLD_POLICY.monthlyTrendPeriod) continue;
    const average = recent.reduce((sum, point) => sum + point.close, 0) / recent.length;
    effectiveSignals.set(index + 1, ordered[index].close > average ? 'ON' : 'OFF');
  }

  return effectiveSignals;
}

function standardDeviation(values: readonly number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce(
    (sum, value) => sum + ((value - mean) ** 2),
    0,
  ) / (values.length - 1);
  return Math.sqrt(variance);
}

function calculateMaxDrawdown(curve: readonly GoldBacktestPoint[]) {
  let peak = curve[0]?.equity ?? 1;
  let maximumDrawdown = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    maximumDrawdown = Math.min(maximumDrawdown, (point.equity / peak) - 1);
  }
  return maximumDrawdown * 100;
}

export function runGoldBacktest(input: GoldBacktestInput): GoldBacktestResult {
  const bars = orderedBars(input.bars);
  if (bars.length < 2) throw new RangeError('금 백테스트에는 최소 2개 가격 봉이 필요합니다.');
  if (bars.some((bar) => !validBar(bar))) {
    throw new RangeError('금 백테스트 가격 봉이 유효하지 않습니다.');
  }
  if (new Set(bars.map((bar) => bar.date)).size !== bars.length) {
    throw new RangeError('금 백테스트 가격 봉에 중복 거래일이 있습니다.');
  }

  const transactionCostPct = input.transactionCostPct ?? 0.001;
  if (!Number.isFinite(transactionCostPct) || transactionCostPct < 0 || transactionCostPct >= 1) {
    throw new RangeError('거래 비용은 0 이상 1 미만이어야 합니다.');
  }
  const annualRiskFreeRate = input.annualRiskFreeRate ?? 0;
  if (!Number.isFinite(annualRiskFreeRate)) {
    throw new RangeError('무위험 수익률이 유효하지 않습니다.');
  }

  const signals = buildMonthlySignalTimeline(bars);
  let exposure = initialExposure(input.mode);
  let currentSignal: Exclude<GoldMonthlyTrendSignal, 'UNAVAILABLE'> | null = null;
  let equity = 1 * (1 - (exposure * transactionCostPct));
  const curve: GoldBacktestPoint[] = [{
    date: bars[0].date,
    equity: round(equity),
    exposure,
    monthlySignal: currentSignal,
  }];
  const strategyReturns: number[] = [];
  let exposureSum = exposure;

  for (let index = 1; index < bars.length; index += 1) {
    const equityBeforeDay = equity;
    const priceReturn = (bars[index].close / bars[index - 1].close) - 1;
    equity *= 1 + (exposure * priceReturn);

    const signal = signals.get(index);
    if (signal) {
      currentSignal = signal;
      const nextExposure = exposureForSignal(input.mode, signal);
      equity *= 1 - (Math.abs(nextExposure - exposure) * transactionCostPct);
      exposure = nextExposure;
    }

    strategyReturns.push((equity / equityBeforeDay) - 1);
    exposureSum += exposure;
    curve.push({
      date: bars[index].date,
      equity: round(equity),
      exposure,
      monthlySignal: currentSignal,
    });
  }

  const startTime = new Date(`${bars[0].date}T00:00:00.000Z`).getTime();
  const endTime = new Date(`${bars.at(-1)!.date}T00:00:00.000Z`).getTime();
  const years = Math.max((endTime - startTime) / DAY_MS / 365.25, 1 / 365.25);
  const cagr = (equity ** (1 / years)) - 1;
  const dailyVolatility = standardDeviation(strategyReturns);
  const annualVolatility = dailyVolatility * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const meanDailyReturn = strategyReturns.length > 0
    ? strategyReturns.reduce((sum, value) => sum + value, 0) / strategyReturns.length
    : 0;
  const dailyRiskFreeRate = ((1 + annualRiskFreeRate) ** (1 / TRADING_DAYS_PER_YEAR)) - 1;
  const sharpe = dailyVolatility > 0
    ? ((meanDailyReturn - dailyRiskFreeRate) / dailyVolatility) * Math.sqrt(TRADING_DAYS_PER_YEAR)
    : 0;

  return {
    mode: input.mode,
    startDate: bars[0].date,
    endDate: bars.at(-1)!.date,
    observations: bars.length,
    cagrPct: round(cagr * 100),
    annualVolatilityPct: round(annualVolatility * 100),
    maxDrawdownPct: round(calculateMaxDrawdown(curve)),
    sharpe: round(sharpe),
    averageExposurePct: round((exposureSum / bars.length) * 100),
    transactionCostPct,
    curve,
  };
}
