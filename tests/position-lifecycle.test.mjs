import assert from 'node:assert/strict';
import { buildPositionLifecycle } from '../lib/finance/core/position-lifecycle.ts';

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

const summary = buildPositionLifecycle([
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

console.log('position lifecycle tests passed');
