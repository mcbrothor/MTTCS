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

console.log('monthly strategy backtest timing tests passed');
