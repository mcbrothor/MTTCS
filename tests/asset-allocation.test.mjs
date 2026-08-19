import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateHaaAllocation, HAA_DEFENSIVE_UNIVERSE, HAA_OFFENSIVE_UNIVERSE } from '../lib/finance/core/asset-allocation.ts';

const all = [...HAA_OFFENSIVE_UNIVERSE, ...HAA_DEFENSIVE_UNIVERSE, 'TIP', 'BIL'];
function series(growth) {
  return Array.from({ length: 13 }, (_, index) => ({ date: `2025-${String(index + 1).padStart(2, '0')}-28`, close: 100 * (1 + growth * index) }));
}

test('HAA risk-on selects only offensive assets and never leaks defensive assets', () => {
  const monthlyPrices = Object.fromEntries(all.map((ticker, index) => [ticker, series(ticker === 'TIP' ? 0.01 : 0.002 + index / 1000)]));
  const result = calculateHaaAllocation({ monthlyPrices, asOf: '2026-08-20', provider: 'GOLDEN' });
  assert.equal(result.regime, 'RISK_ON');
  assert.equal(result.targets.length, 4);
  assert.ok(result.targets.every((target) => target.sleeve === 'OFFENSIVE'));
  assert.ok(result.targets.every((target) => target.targetWeightPct === 25));
});

test('TIP zero boundary is risk-off and BIL is the floor', () => {
  const monthlyPrices = Object.fromEntries(all.map((ticker) => [ticker, series(ticker === 'BIL' ? 0.01 : 0)]));
  const result = calculateHaaAllocation({ monthlyPrices, asOf: '2026-08-20', provider: 'GOLDEN' });
  assert.equal(result.regime, 'RISK_OFF');
  assert.deepEqual(result.targets.map((target) => target.ticker), ['BIL']);
});

test('HAA blocks when 13 months are unavailable', () => {
  const result = calculateHaaAllocation({ monthlyPrices: { TIP: series(0.01).slice(1), BIL: series(0.001) }, asOf: '2026-08-20', provider: 'GOLDEN' });
  assert.equal(result.quality, 'BLOCKED');
  assert.equal(result.regime, 'BLOCKED');
});

test('equal offensive momentum uses a deterministic universe order', () => {
  const monthlyPrices = Object.fromEntries(all.map((ticker) => [ticker, series(ticker === 'TIP' ? 0.01 : 0.005)]));
  const result = calculateHaaAllocation({ monthlyPrices, asOf: '2026-08-20', provider: 'GOLDEN' });
  assert.deepEqual(result.targets.map((target) => target.ticker), ['SPY', 'IWM', 'VEA', 'VWO']);
});
