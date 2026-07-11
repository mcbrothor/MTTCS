import assert from 'node:assert/strict';
import { buildPositionLifecycle } from '../lib/finance/core/position-lifecycle.ts';
import { calculateTradeMetrics } from '../lib/finance/core/trade-metrics.ts';

function execution(overrides) {
  return {
    id: crypto.randomUUID(),
    trade_id: 'trade-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    executed_at: '2026-01-01T00:00:00.000Z',
    side: 'ENTRY',
    price: 100,
    shares: 100,
    fees: 0,
    leg_label: 'E1',
    note: null,
    ...overrides,
  };
}

const summary = buildPositionLifecycle('LONG', [
  execution({ price: 100, shares: 100, leg_label: 'E1' }),
  execution({ price: 105, shares: 50, leg_label: 'E2', executed_at: '2026-01-02T00:00:00.000Z' }),
  execution({ side: 'EXIT', price: 110, shares: 60, leg_label: 'MANUAL', executed_at: '2026-01-03T00:00:00.000Z' }),
  execution({ side: 'EXIT', price: 115, shares: 40, leg_label: 'MANUAL', executed_at: '2026-01-04T00:00:00.000Z' }),
]);

assert.equal(summary.entryCount, 2);
assert.equal(summary.exitCount, 2);
assert.equal(summary.pyramidCount, 1);
assert.equal(summary.partialExitCount, 2);
assert.equal(summary.events[0].action, 'INITIAL_ENTRY');
assert.equal(summary.events[1].action, 'PYRAMID');
assert.equal(summary.events[2].action, 'PARTIAL_EXIT');
assert.equal(summary.events[2].positionAfter, 90);
assert.equal(summary.events[3].positionAfter, 50);
assert.equal(Math.round(summary.realizedPnL * 100) / 100, 1033.33);

const shortExecutions = [
  execution({ price: 100, shares: 100, fees: 1, leg_label: 'E1' }),
  execution({ price: 95, shares: 50, fees: 1, leg_label: 'E2', executed_at: '2026-01-02T00:00:00.000Z' }),
  execution({ side: 'EXIT', price: 90, shares: 60, fees: 2, leg_label: 'MANUAL', executed_at: '2026-01-03T00:00:00.000Z' }),
  execution({ side: 'EXIT', price: 85, shares: 90, fees: 3, leg_label: 'MANUAL', executed_at: '2026-01-04T00:00:00.000Z' }),
];
const shortSummary = buildPositionLifecycle('SHORT', shortExecutions);
const shortMetrics = calculateTradeMetrics({
  direction: 'SHORT',
  entry_price: 100,
  exit_price: null,
  planned_risk: 500,
  result_amount: null,
  stoploss_price: 105,
  total_shares: 150,
  position_size: 150,
}, shortExecutions);

assert.equal(shortSummary.pyramidCount, 1);
assert.equal(shortSummary.partialExitCount, 1);
assert.equal(shortSummary.events.at(-1).action, 'FULL_EXIT');
assert.equal(Math.round(shortSummary.realizedPnL * 100) / 100, 1693);
assert.equal(Math.round(shortSummary.realizedPnL * 100) / 100, shortMetrics.realizedPnL);

assert.throws(() => buildPositionLifecycle(undefined, []), /Unsupported trade direction/);

console.log('position lifecycle tests passed');
