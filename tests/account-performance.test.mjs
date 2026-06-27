import assert from 'node:assert/strict';
import {
  buildTradePerformanceRecord,
  calculateAccountBalanceDelta,
  evaluatePyramidExecutionCompliance,
  evaluateStopRaiseCompliance,
} from '../lib/finance/core/account-performance.ts';
import { calculateTradeMetrics } from '../lib/finance/core/trade-metrics.ts';
import { calculateOnlPyramidPlan } from '../lib/finance/core/position-sizing.ts';

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

const pyramidPlan = calculateOnlPyramidPlan(9_000_000, 100, 0.01);
const trade = {
  id: 'trade-1',
  ticker: '005930',
  direction: 'LONG',
  status: 'COMPLETED',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-05T00:00:00.000Z',
  chk_risk: true,
  chk_entry: true,
  chk_stoploss: true,
  chk_exit: true,
  chk_psychology: true,
  sepa_evidence: null,
  total_equity: 9_000_000,
  planned_risk: 90_000,
  risk_percent: 0.01,
  atr_value: 2,
  entry_price: 100,
  stoploss_price: 100,
  position_size: pyramidPlan.completedShares,
  total_shares: pyramidPlan.completedShares,
  entry_targets: null,
  trailing_stops: { initial: 95, afterEntry2: 95, afterEntry3: 100 },
  risk_policy_snapshot: { market: 'KR', profile: 'STANDARD', baseRiskPct: 0.01, maxSingleTradeRiskPct: 0.02, maxPortfolioHeatPct: 0.05, maxSectorExposurePct: 0.35, maxSectorRiskPct: 0.03, maxPositions: null, atrLookback: 20, atrStopMultiple: 2, pyramidSpacingAtr: 0.5, drawdownSoftLimitPct: 0.05, drawdownHardLimitPct: 0.08, dailyLossLimitPct: 0.02, weeklyLossLimitPct: 0.04, pyramidPlan },
  exit_price: 120,
  exit_reason: '목표가도달',
  result_amount: null,
  final_discipline: null,
  emotion_note: null,
  executions: [
    execution({ price: 100, shares: pyramidPlan.legs[0].shares, leg_label: 'E1', executed_at: '2026-01-01T00:00:00.000Z' }),
    execution({ price: 102.5, shares: pyramidPlan.legs[1].shares, leg_label: 'E2', executed_at: '2026-01-02T00:00:00.000Z' }),
    execution({ price: 105.0625, shares: pyramidPlan.legs[2].shares, leg_label: 'E3', executed_at: '2026-01-03T00:00:00.000Z' }),
    execution({ side: 'EXIT', price: 120, shares: pyramidPlan.completedShares, fees: 500, leg_label: 'MANUAL', executed_at: '2026-01-04T00:00:00.000Z' }),
  ],
};

const metrics = calculateTradeMetrics(trade, trade.executions);
const record = buildTradePerformanceRecord(trade, metrics, '2026-01-05T00:00:00.000Z');

assert.equal(record.market, 'KR');
assert.equal(record.realized_pnl, 322_865.87);
assert.equal(record.r_multiple, 3.59);
assert.equal(record.pyramid_compliant, true);
assert.equal(record.stop_raise_compliant, true);
assert.equal(record.performance_snapshot.pyramid.planned.policy.model, 'ONL_PYRAMID');
assert.equal(evaluatePyramidExecutionCompliance(trade), true);
assert.equal(evaluateStopRaiseCompliance(trade), true);

const firstDelta = calculateAccountBalanceDelta({
  market: 'KR',
  realizedPnl: record.realized_pnl,
  previousRecordedPnl: null,
  currentSettings: { total_equity: 9_000_000, cash: 1_800_000 },
});

assert.equal(firstDelta.realizedPnLDelta, 322_865.87);
assert.equal(firstDelta.equityAfter, 9_322_865.87);
assert.equal(firstDelta.cashAfter, 2_122_865.87);

const correctionDelta = calculateAccountBalanceDelta({
  market: 'KR',
  realizedPnl: 360_000,
  previousRecordedPnl: record.realized_pnl,
  currentSettings: { total_equity: firstDelta.equityAfter, cash: firstDelta.cashAfter },
});

assert.equal(correctionDelta.realizedPnLDelta, 37_134.13);
assert.equal(correctionDelta.equityAfter, 9_360_000);
assert.equal(correctionDelta.cashAfter, 2_160_000);

console.log('account performance tests passed');
