import assert from 'node:assert/strict';

import { runMonthlyCloseBacktest } from '../lib/strategy/monthly/backtest.ts';

const barsByTicker = {
  CASH: [
    { date: '2026-01-30', close: 100 },
    { date: '2026-02-02', close: 100 },
    { date: '2026-02-03', close: 100 },
    { date: '2026-02-04', close: 100 },
  ],
  RISK: [
    { date: '2026-01-30', close: 100 },
    { date: '2026-02-02', close: 120 },
    { date: '2026-02-03', close: 144 },
    { date: '2026-02-04', close: 158.4 },
  ],
};

const result = runMonthlyCloseBacktest({
  calendar: ['2026-01-30', '2026-02-02', '2026-02-03', '2026-02-04'],
  barsByTicker,
  targets: [{
    signalAt: '2026-01-30',
    effectiveAt: '2026-02-02',
    weights: { RISK: 1 },
  }],
  initialWeights: { CASH: 1 },
  transactionCostRate: 0,
});

assert.equal(result.points.find((point) => point.date === '2026-02-02').equity, 1, '체결일 종가까지의 상승을 선취하면 안 된다');
assert.equal(result.points.find((point) => point.date === '2026-02-03').equity, 1.2, '체결 다음 close-to-close 수익부터 반영해야 한다');
assert.equal(result.points.at(-1).equity, 1.32);

// F02: Weight drift verification (price change without rebalancing must follow buy-and-hold accounting)
{
  const driftResult = runMonthlyCloseBacktest({
    calendar: ['2026-08-03', '2026-08-04', '2026-08-05'],
    barsByTicker: {
      A: [{ date: '2026-08-03', close: 100 }, { date: '2026-08-04', close: 200 }, { date: '2026-08-05', close: 100 }],
      B: [{ date: '2026-08-03', close: 100 }, { date: '2026-08-04', close: 100 }, { date: '2026-08-05', close: 100 }],
    },
    targets: [],
    initialWeights: { A: 0.5, B: 0.5 },
    transactionCostRate: 0,
  });

  const equities = driftResult.points.map((p) => p.equity);
  assert.deepEqual(equities, [1, 1.5, 1], 'Asset path without rebalancing must return to 1 when asset A drops back to entry');
  assert.equal(driftResult.points[1].turnover, 0);
  assert.equal(driftResult.points[2].turnover, 0);
}

console.log('monthly strategy backtest timing and weight drift tests passed');
