import assert from 'node:assert/strict';
import {
  buildConservativeDrawdownSeries,
  calculateAuthoritativeCandidateRisk,
  calculateCurrentDrawdownPct,
  calculateRollingLossLimits,
  findServerManagedTradePatchFields,
  isMacroContextFresh,
  isOpenPositionRiskVerifiable,
  projectWorstCaseSectorContext,
  resolveAuthoritativeRiskEquity,
  resolvePlannedRiskReservation,
  selectConservativeMacroContext,
} from '../lib/finance/core/server-risk-context.ts';

{
  const resolved = resolveAuthoritativeRiskEquity({
    requestedEquity: 100_000,
    snapshotAmount: 100_000,
    accountEquity: 100_000,
    accountCash: 40_000,
    basis: 'CURRENT_ACCOUNT',
    fallbackUsed: false,
  });
  assert.deepEqual(resolved, { ok: true, equity: 100_000, basis: 'CURRENT_ACCOUNT' });
}

{
  const rejectedFallback = resolveAuthoritativeRiskEquity({
    requestedEquity: 50_000,
    snapshotAmount: 50_000,
    accountEquity: 100_000,
    accountCash: 40_000,
    basis: 'MANUAL',
    fallbackUsed: true,
  });
  assert.equal(rejectedFallback.ok, false);
  assert.equal(rejectedFallback.code, 'CAPITAL_FALLBACK_FORBIDDEN');

  const rejectedUnverifiedCash = resolveAuthoritativeRiskEquity({
    requestedEquity: 50_000,
    snapshotAmount: 50_000,
    accountEquity: 100_000,
    accountCash: 40_000,
    basis: 'AVAILABLE_CASH',
    fallbackUsed: false,
  });
  assert.equal(rejectedUnverifiedCash.ok, false);
  assert.equal(rejectedUnverifiedCash.code, 'CAPITAL_SNAPSHOT_STALE');
}

{
  assert.equal(calculateAuthoritativeCandidateRisk({
    submittedRisk: 500,
    entryPrice: 100,
    stoplossPrice: 90,
    totalShares: 100,
  }), 1_000);
  assert.equal(calculateAuthoritativeCandidateRisk({
    submittedRisk: 1_250,
    entryPrice: 100,
    stoplossPrice: 90,
    totalShares: 100,
  }), 1_250);
  assert.equal(isOpenPositionRiskVerifiable({ hasEntries: false, netShares: 100 }), false);
  assert.equal(isOpenPositionRiskVerifiable({ hasEntries: true, netShares: 0 }), false);
  assert.equal(isOpenPositionRiskVerifiable({ hasEntries: true, netShares: 25 }), true);
  assert.deepEqual(resolvePlannedRiskReservation({
    submittedRisk: 500,
    entryPrice: 100,
    stoplossPrice: 90,
    totalShares: 100,
  }), { risk: 1_000, exposure: 10_000 });
  assert.deepEqual(resolvePlannedRiskReservation({
    submittedRisk: 500,
    entryPrice: 100,
    stoplossPrice: null,
    totalShares: 100,
  }), { risk: 500, exposure: 10_000 });
  assert.equal(resolvePlannedRiskReservation({
    submittedRisk: null,
    entryPrice: 100,
    stoplossPrice: 90,
    totalShares: 100,
  }), null);
}

{
  assert.equal(calculateCurrentDrawdownPct(95_000, [10_000, -15_000]), 13.6364);
  assert.equal(calculateCurrentDrawdownPct(100_000, []), 0);
  assert.equal(calculateCurrentDrawdownPct(100_000, [Number.NaN]), null);
}

{
  const now = new Date('2026-08-02T12:00:00.000Z');
  assert.deepEqual(calculateRollingLossLimits(100_000, [
    { completedAt: '2026-08-02T00:30:00.000Z', pnl: -1_500 },
    { completedAt: '2026-07-31T10:00:00.000Z', pnl: 500 },
    { completedAt: '2026-07-27T12:00:00.000Z', pnl: -3_500 },
    { completedAt: '2026-07-20T12:00:00.000Z', pnl: -99_000 },
  ], now), {
    dailyLossPct: 1.5,
    weeklyLossPct: 4.5,
    dailyRealizedPnl: -1_500,
    weeklyRealizedPnl: -4_500,
    windowMode: 'ROLLING_24H_7D',
  });
  assert.equal(calculateRollingLossLimits(100_000, [
    { completedAt: '', pnl: -100 },
  ], now), null);
  assert.equal(calculateRollingLossLimits(100_000, [
    { completedAt: '2026-08-02T00:00:00.000Z', pnl: Number.NaN },
  ], now), null);
}

{
  const now = new Date('2026-07-31T12:00:00.000Z');
  assert.equal(isMacroContextFresh('2026-07-30', now), true);
  assert.equal(isMacroContextFresh('2026-07-20', now), false);
  assert.equal(isMacroContextFresh('invalid', now), false);

  const macro = selectConservativeMacroContext([
    { indexCode: 'SPY', actionLevel: 'FULL', calcDate: '2026-07-30' },
    { indexCode: 'SPY', actionLevel: 'HALT', calcDate: '2026-07-29' },
    { indexCode: 'QQQ', actionLevel: 'REDUCED', calcDate: '2026-07-30' },
    { indexCode: 'OLD', actionLevel: 'HALT', calcDate: '2026-07-01' },
  ], now, ['SPY', 'QQQ']);
  assert.deepEqual(macro, {
    actionLevel: 'REDUCED',
    calcDate: '2026-07-30',
    indexCodes: ['QQQ', 'SPY'],
  });
  assert.equal(selectConservativeMacroContext([
    { indexCode: 'SPY', actionLevel: 'FULL', calcDate: '2026-07-30' },
  ], now, ['SPY', 'QQQ']), null);
}

{
  assert.deepEqual(
    findServerManagedTradePatchFields({ id: 'trade-1', plan_note: 'safe edit', total_equity: 999_999, risk_gate: {} }),
    ['total_equity', 'risk_gate']
  );

  assert.deepEqual(
    findServerManagedTradePatchFields(
      { id: 'trade-1', ticker: ' aapl ', total_equity: '100000', total_shares: 25, risk_gate: { status: 'PASS' } },
      { ticker: 'AAPL', total_equity: 100_000, total_shares: null, position_size: 25, risk_gate: { status: 'PASS' } }
    ),
    []
  );
  assert.deepEqual(
    findServerManagedTradePatchFields(
      { id: 'trade-1', total_equity: 90_000, risk_gate: { status: 'BLOCK' } },
      { total_equity: 100_000, risk_gate: { status: 'PASS' } }
    ),
    ['total_equity', 'risk_gate']
  );
}

{
  const projected = projectWorstCaseSectorContext({
    portfolio: {
      totalEquity: 100_000,
      investedCapital: 30_000,
      cash: 70_000,
      cashPct: 70,
      activePositions: 1,
      maxPositions: 10,
      totalOpenRisk: 2_000,
      openRiskPct: 2,
      sectorExposure: [{ sector: 'Technology', exposure: 30_000, exposurePct: 30, count: 1 }],
      sectorRisk: [{ sector: 'Technology', openRisk: 2_000, riskPct: 2, count: 1 }],
      warnings: [],
    },
    candidateExposure: 10_000,
    candidateRisk: 1_000,
    totalEquity: 100_000,
  });
  assert.deepEqual(projected, { sectorExposurePct: 40, sectorRiskPct: 3 });

  const diversified = projectWorstCaseSectorContext({
    portfolio: {
      totalEquity: 100_000,
      investedCapital: 30_000,
      cash: 70_000,
      cashPct: 70,
      activePositions: 1,
      maxPositions: 10,
      totalOpenRisk: 2_000,
      openRiskPct: 2,
      sectorExposure: [{ sector: 'Technology', exposure: 30_000, exposurePct: 30, count: 1 }],
      sectorRisk: [{ sector: 'Technology', openRisk: 2_000, riskPct: 2, count: 1 }],
      warnings: [],
    },
    candidateExposure: 10_000,
    candidateRisk: 1_000,
    totalEquity: 100_000,
    candidateSector: 'Healthcare',
  });
  assert.deepEqual(diversified, { sectorExposurePct: 10, sectorRiskPct: 1 });
}

{
  assert.deepEqual(buildConservativeDrawdownSeries([
    { tradeId: 'recorded', completedAt: '2026-01-01', recordedPnl: 500, plannedRisk: 100 },
    { tradeId: 'legacy-result', completedAt: '2026-01-02', fallbackPnl: -200, plannedRisk: 100 },
    { tradeId: 'legacy-risk', completedAt: '2026-01-03', plannedRisk: 300 },
  ]), {
    ok: true,
    pnls: [500, -200, -300],
    degraded: true,
    fallbackTradeIds: ['legacy-result', 'legacy-risk'],
  });
  assert.deepEqual(buildConservativeDrawdownSeries([
    { tradeId: 'unknown', completedAt: '2026-01-01' },
  ]), {
    ok: false,
    unresolvedTradeIds: ['unknown'],
  });
}

console.log('server risk context tests passed');
