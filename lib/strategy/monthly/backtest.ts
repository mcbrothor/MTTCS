import type { MonthlyBar } from './types';

export interface MonthlyBacktestTarget {
  signalAt: string;
  effectiveAt: string;
  weights: Record<string, number>;
}

function normalizedWeights(weights: Record<string, number>) {
  return Object.fromEntries(Object.entries(weights).filter(([, value]) => Number.isFinite(value) && value > 0));
}

function l1Turnover(previous: Record<string, number>, next: Record<string, number>) {
  const tickers = new Set([...Object.keys(previous), ...Object.keys(next)]);
  return [...tickers].reduce((sum, ticker) => sum + Math.abs((next[ticker] || 0) - (previous[ticker] || 0)), 0);
}

export function runMonthlyCloseBacktest(input: {
  calendar: string[];
  barsByTicker: Record<string, Array<Pick<MonthlyBar, 'date' | 'close'>>>;
  targets: MonthlyBacktestTarget[];
  initialWeights?: Record<string, number>;
  transactionCostRate: number;
}) {
  const priceByTicker = new Map(
    Object.entries(input.barsByTicker).map(([ticker, bars]) => [ticker, new Map(bars.map((bar) => [bar.date, bar.close]))]),
  );
  const targetsByEffectiveAt = new Map(input.targets.map((target) => [target.effectiveAt, target]));

  let weights = normalizedWeights(input.initialWeights || {});
  let equity = 1;
  const positionValues: Record<string, number> = {};
  let allocatedWeight = 0;
  for (const [ticker, weight] of Object.entries(weights)) {
    positionValues[ticker] = equity * weight;
    allocatedWeight += weight;
  }
  let cash = equity * Math.max(0, 1 - allocatedWeight);

  const points: Array<{ date: string; equity: number; turnover: number; cost: number; weights: Record<string, number> }> = [];

  for (let index = 0; index < input.calendar.length; index += 1) {
    const date = input.calendar[index];
    const priorDate = input.calendar[index - 1];

    if (priorDate) {
      for (const [ticker, value] of Object.entries(positionValues)) {
        if (!value) continue;
        const prices = priceByTicker.get(ticker);
        const prior = prices?.get(priorDate);
        const current = prices?.get(date);
        if (!prior || !current) continue;
        positionValues[ticker] = value * (current / prior);
      }
      const sumPositions = Object.values(positionValues).reduce((sum, v) => sum + v, 0);
      equity = sumPositions + cash;

      // Reflect price drift in weights
      if (equity > 0) {
        const driftedWeights: Record<string, number> = {};
        for (const [ticker, val] of Object.entries(positionValues)) {
          if (val > 0) {
            driftedWeights[ticker] = val / equity;
          }
        }
        weights = driftedWeights;
      }
    }

    let turnover = 0;
    let cost = 0;
    const target = targetsByEffectiveAt.get(date);
    if (target) {
      const nextWeights = normalizedWeights(target.weights);
      turnover = l1Turnover(weights, nextWeights);
      cost = equity * turnover * input.transactionCostRate;
      equity -= cost;

      let nextAllocated = 0;
      for (const key of Object.keys(positionValues)) {
        delete positionValues[key];
      }
      for (const [ticker, weight] of Object.entries(nextWeights)) {
        positionValues[ticker] = equity * weight;
        nextAllocated += weight;
      }
      cash = equity * Math.max(0, 1 - nextAllocated);
      weights = { ...nextWeights };
    }

    points.push({ date, equity, turnover, cost, weights: { ...weights } });
  }

  return { points, endingEquity: equity };
}
