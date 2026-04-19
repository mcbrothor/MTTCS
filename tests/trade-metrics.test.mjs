import assert from 'node:assert/strict';
import { calculateTradeMetrics, deriveTradeStatus } from '../lib/finance/core/trade-metrics.ts';

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const baseTrade = {
  entry_price: 100,
  exit_price: null,
  planned_risk: 500,
  result_amount: null,
  stoploss_price: 96,
  total_shares: 125,
  position_size: 125,
};

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

run('tracks one entry as active with average entry and open risk', () => {
  const metrics = calculateTradeMetrics(baseTrade, [execution({ price: 100, shares: 50 })]);

  assert.equal(metrics.avgEntryPrice, 100);
  assert.equal(metrics.netShares, 50);
  assert.equal(metrics.openRisk, 200);
  assert.equal(metrics.executionProgressPct, 40);
  assert.equal(deriveTradeStatus('PLANNED', metrics), 'ACTIVE');
});

run('calculates partial exit realized pnl from weighted average entry', () => {
  const metrics = calculateTradeMetrics(baseTrade, [
    execution({ price: 100, shares: 50, leg_label: 'E1' }),
    execution({ price: 104, shares: 50, leg_label: 'E2' }),
    execution({ side: 'EXIT', price: 110, shares: 40, fees: 2, leg_label: 'MANUAL' }),
  ]);

  assert.equal(metrics.avgEntryPrice, 102);
  assert.equal(metrics.netShares, 60);
  assert.equal(metrics.realizedPnL, 318);
  assert.equal(metrics.rMultiple, 0.64);
});

run('recalculates remaining average entry after partial exit and later add', () => {
  const metrics = calculateTradeMetrics(baseTrade, [
    execution({ price: 100, shares: 100, executed_at: '2026-01-01T00:00:00.000Z' }),
    execution({ side: 'EXIT', price: 110, shares: 80, leg_label: 'MANUAL', executed_at: '2026-01-02T00:00:00.000Z' }),
    execution({ price: 130, shares: 20, leg_label: 'E2', executed_at: '2026-01-03T00:00:00.000Z' }),
  ]);

  assert.equal(metrics.netShares, 40);
  assert.equal(metrics.avgEntryPrice, 115);
  assert.equal(metrics.historicalAvgEntryPrice, 105);
  assert.equal(metrics.realizedPnL, 800);
});

run('marks fully closed trade completed and computes final r multiple', () => {
  const metrics = calculateTradeMetrics(baseTrade, [
    execution({ price: 100, shares: 125, fees: 1 }),
    execution({ side: 'EXIT', price: 108, shares: 125, fees: 1, leg_label: 'MANUAL' }),
  ]);

  assert.equal(metrics.netShares, 0);
  assert.equal(metrics.realizedPnL, 998);
  assert.equal(metrics.rMultiple, 2);
  assert.equal(deriveTradeStatus('ACTIVE', metrics), 'COMPLETED');
});

run('flags exit shares above entry shares', () => {
  const metrics = calculateTradeMetrics(baseTrade, [
    execution({ price: 100, shares: 10 }),
    execution({ side: 'EXIT', price: 101, shares: 11, leg_label: 'MANUAL' }),
  ]);

  assert.equal(metrics.invalidExitShares, true);
});
