import { calculateNasdaqRegime } from './engine';
import { NASDAQ_POLICY } from './policy';
import type {
  NasdaqBacktestMode,
  NasdaqBacktestPoint,
  NasdaqBacktestResult,
  NasdaqPriceBar,
  NasdaqProductCode,
} from './types';

function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function annualizedMetrics(curve: readonly NasdaqBacktestPoint[], turnoverPct: number) {
  const returns = curve.slice(1).map((point, index) => (point.equity / curve[index].equity) - 1);
  const years = Math.max((curve.length - 1) / 252, 1 / 252);
  const last = curve.at(-1);
  const first = curve[0];
  if (!last || !first) throw new Error('curve empty');
  const cagr = (last.equity / first.equity) ** (1 / years) - 1;
  const mean = returns.reduce((sum, value) => sum + value, 0) / Math.max(returns.length, 1);
  const variance = returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0)
    / Math.max(returns.length - 1, 1);
  const annualVolatility = Math.sqrt(variance) * Math.sqrt(252);
  const downside = returns.filter((value) => value < 0);
  const downsideVariance = downside.reduce((sum, value) => sum + (value ** 2), 0)
    / Math.max(downside.length, 1);
  const downsideVolatility = Math.sqrt(downsideVariance) * Math.sqrt(252);
  let peak = curve[0].equity;
  let maxDrawdown = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.equity);
    maxDrawdown = Math.min(maxDrawdown, (point.equity / peak) - 1);
  }
  const annualReturn = mean * 252;
  return {
    cagrPct: round(cagr * 100),
    annualVolatilityPct: round(annualVolatility * 100),
    maxDrawdownPct: round(maxDrawdown * 100),
    sharpe: annualVolatility > 0 ? round(annualReturn / annualVolatility) : 0,
    sortino: downsideVolatility > 0 ? round(annualReturn / downsideVolatility) : 0,
    calmar: maxDrawdown < 0 ? round(cagr / Math.abs(maxDrawdown)) : 0,
    turnoverPct: round(turnoverPct),
  };
}

function exposureForMode(
  mode: NasdaqBacktestMode,
  qqqHistory: readonly NasdaqPriceBar[],
) {
  if (mode === 'QQQ_BUY_HOLD') return { QQQ: 1, QLD: 0, TQQQ: 0 };
  if (mode === 'QLD_BUY_HOLD') return { QQQ: 0, QLD: 1, TQQQ: 0 };
  if (mode === 'TQQQ_BUY_HOLD') return { QQQ: 0, QLD: 0, TQQQ: 1 };
  const regime = calculateNasdaqRegime(qqqHistory);
  const trendOn = Boolean(
    regime?.monthlyTrend.signal === 'ON'
    && regime.monthlyTrend.isEffective
    && regime.aboveMa200TwoCloses,
  );
  if (mode === 'QQQ_TEN_MONTH') return { QQQ: trendOn ? 1 : 0, QLD: 0, TQQQ: 0 };
  if (mode === 'QQQ_QLD_RULES') {
    const tactical = trendOn
      && (regime?.realizedVolatility20Pct ?? Infinity) < NASDAQ_POLICY.leverageBlockVolatilityPct
      ? NASDAQ_POLICY.qldMaxCapitalPct * (regime?.volatilityScale ?? 0)
      : 0;
    return { QQQ: trendOn ? NASDAQ_POLICY.qqqCoreTargetPct : 0, QLD: tactical, TQQQ: 0 };
  }
  const tactical = trendOn
    && Boolean(regime?.goldenCross)
    && Boolean(regime?.breakout20)
    && (regime?.realizedVolatility20Pct ?? Infinity) <= NASDAQ_POLICY.tqqqMaxVolatilityPct
    ? NASDAQ_POLICY.tqqqMaxCapitalPct * (regime?.volatilityScale ?? 0)
    : 0;
  return { QQQ: trendOn ? NASDAQ_POLICY.qqqCoreTargetPct : 0, QLD: 0, TQQQ: tactical };
}

/**
 * Uses actual adjusted ETF histories. Exposure decided at close `t` is first
 * applied to return `t -> t+1`, preventing same-close look-ahead.
 */
export function runNasdaqBacktest(input: {
  qqq: readonly NasdaqPriceBar[];
  qld: readonly NasdaqPriceBar[];
  tqqq: readonly NasdaqPriceBar[];
  mode: NasdaqBacktestMode;
  transactionCostPct?: number;
  cashAnnualRatePct?: number;
}): NasdaqBacktestResult {
  const cost = input.transactionCostPct ?? 0.1;
  const cashDaily = ((input.cashAnnualRatePct ?? 0) / 100) / 252;
  const maps = {
    QQQ: new Map(input.qqq.map((bar) => [bar.date, bar])),
    QLD: new Map(input.qld.map((bar) => [bar.date, bar])),
    TQQQ: new Map(input.tqqq.map((bar) => [bar.date, bar])),
  };
  const required: NasdaqProductCode[] = input.mode === 'QLD_BUY_HOLD' || input.mode === 'QQQ_QLD_RULES'
    ? ['QQQ', 'QLD']
    : input.mode === 'TQQQ_BUY_HOLD' || input.mode === 'QQQ_TQQQ_RULES'
      ? ['QQQ', 'TQQQ']
      : ['QQQ'];
  const dates = input.qqq
    .map((bar) => bar.date)
    .filter((date) => required.every((product) => maps[product].has(date)))
    .sort();
  if (dates.length < NASDAQ_POLICY.minimumPriceBars + 2) {
    throw new Error(
      `${input.mode} 백테스트 공통 실제 조정주가가 부족합니다: ${dates.length}봉.`,
    );
  }

  let equity = 1;
  let previousWeights = { QQQ: 0, QLD: 0, TQQQ: 0 };
  let turnover = 0;
  const curve: NasdaqBacktestPoint[] = [{
    date: dates[NASDAQ_POLICY.minimumPriceBars - 1],
    equity,
    capitalExposure: 0,
    effectiveExposure: 0,
  }];

  for (let index = NASDAQ_POLICY.minimumPriceBars - 1; index < dates.length - 1; index += 1) {
    const date = dates[index];
    const nextDate = dates[index + 1];
    const qqqHistory = input.qqq.filter((bar) => bar.date <= date);
    const weights = exposureForMode(input.mode, qqqHistory);
    const oneWayTurnover = (
      Math.abs(weights.QQQ - previousWeights.QQQ)
      + Math.abs(weights.QLD - previousWeights.QLD)
      + Math.abs(weights.TQQQ - previousWeights.TQQQ)
    );
    equity *= 1 - (oneWayTurnover * cost / 100);
    turnover += oneWayTurnover * 100;
    const capitalExposure = weights.QQQ + weights.QLD + weights.TQQQ;
    let portfolioReturn = (1 - capitalExposure) * cashDaily;
    for (const product of ['QQQ', 'QLD', 'TQQQ'] as const) {
      const current = maps[product].get(date);
      const next = maps[product].get(nextDate);
      if (!current || !next || current.close <= 0) continue;
      portfolioReturn += weights[product] * ((next.close / current.close) - 1);
    }
    equity *= 1 + portfolioReturn;
    const effectiveExposure = weights.QQQ + (weights.QLD * 2) + (weights.TQQQ * 3);
    curve.push({
      date: nextDate,
      equity: round(equity, 8),
      capitalExposure: round(capitalExposure * 100),
      effectiveExposure: round(effectiveExposure * 100),
    });
    previousWeights = weights;
  }

  const metrics = annualizedMetrics(curve, turnover);
  const lastPoint = curve.at(-1);
  if (!lastPoint) throw new Error('curve empty');
  return {
    mode: input.mode,
    startDate: curve[0].date,
    endDate: lastPoint.date,
    observations: curve.length,
    ...metrics,
    averageEffectiveExposurePct: round(
      curve.reduce((sum, point) => sum + point.effectiveExposure, 0) / curve.length,
    ),
    maxEffectiveExposurePct: round(Math.max(...curve.map((point) => point.effectiveExposure))),
    curve,
  };
}
