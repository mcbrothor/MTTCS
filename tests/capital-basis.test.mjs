import assert from 'node:assert/strict';
import { buildCapitalSnapshot } from '../lib/finance/core/capital-basis.ts';

const portfolio = {
  totalEquity: 100_000,
  investedCapital: 60_000,
  marketValue: 70_000,
  cash: 30_000,
  cashPct: 30,
  activePositions: 3,
  maxPositions: 8,
  totalOpenRisk: 4_500,
  openRiskPct: 4.5,
  riskBudgetRemaining: 1_500,
  unknownRiskPositions: 1,
  sectorExposure: [],
  warnings: [],
};

const base = {
  market: 'US',
  portfolio,
  fallbackEquity: 50_000,
  manualAmount: 80_000,
  scenarioPct: -10,
  capturedAt: '2026-06-28T00:00:00.000Z',
};

assert.equal(buildCapitalSnapshot({ ...base, basis: 'CURRENT_ACCOUNT' }).amount, 100_000);
assert.equal(buildCapitalSnapshot({ ...base, basis: 'CONSERVATIVE' }).amount, 95_500);
assert.equal(buildCapitalSnapshot({ ...base, basis: 'AVAILABLE_CASH' }).amount, 30_000);
assert.equal(buildCapitalSnapshot({ ...base, basis: 'MANUAL' }).amount, 80_000);
assert.equal(buildCapitalSnapshot({ ...base, basis: 'SCENARIO' }).amount, 90_000);

const fallback = buildCapitalSnapshot({ ...base, basis: 'CURRENT_ACCOUNT', portfolio: null });
assert.equal(fallback.amount, 50_000);
assert.equal(fallback.fallbackUsed, true);

console.log('capital basis tests passed');
