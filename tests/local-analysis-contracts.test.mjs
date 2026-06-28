import assert from 'node:assert/strict';
import {
  buildLocalAnalysisQueueSummary,
  classifyWorkerFreshness,
  isLocalAnalysisJobType,
  normalizeLocalAnalysisAction,
  normalizeLocalAnalysisPayload,
} from '../lib/local-analysis/contracts.ts';

{
  assert.equal(isLocalAnalysisJobType('FINANCIAL_AUDIT'), true);
  assert.equal(isLocalAnalysisJobType('UNKNOWN'), false);
}

{
  const payload = normalizeLocalAnalysisPayload('FINANCIAL_AUDIT', {
    ticker: ' nvda ',
    market: 'US',
    financials: 'bad',
  });
  assert.equal(payload.ticker, 'NVDA');
  assert.deepEqual(payload.financials, []);
}

{
  const payload = normalizeLocalAnalysisPayload('RECOMMENDATION_BACKTEST', {
    strategyKey: 'daily-top10',
    picks: [{ return_pct: 3 }],
  });
  assert.equal(payload.strategy_key, 'daily-top10');
  assert.deepEqual(payload.trades, [{ return_pct: 3 }]);
}

{
  assert.throws(
    () => normalizeLocalAnalysisPayload('THESIS_CHECK', { assumptions: [] }),
    /requires ticker or thesis_id/,
  );
  assert.equal(normalizeLocalAnalysisAction('retry'), 'retry');
  assert.equal(normalizeLocalAnalysisAction('REQUEUE'), 'requeue');
  assert.throws(() => normalizeLocalAnalysisAction('delete'), /action must be one of/);
}

{
  const summary = buildLocalAnalysisQueueSummary([
    { status: 'queued' },
    { status: 'running' },
    { status: 'succeeded' },
    { status: 'failed' },
    { status: 'failed' },
    { status: 'cancelled' },
    { status: 'unknown' },
  ]);
  assert.deepEqual(summary, {
    total: 7,
    queued: 1,
    running: 1,
    succeeded: 1,
    failed: 2,
    cancelled: 1,
  });
}

{
  const now = Date.parse('2026-06-28T00:00:00.000Z');
  assert.deepEqual(classifyWorkerFreshness(null, now), { state: 'missing', ageSeconds: null });
  assert.deepEqual(classifyWorkerFreshness('not-a-date', now), { state: 'invalid', ageSeconds: null });
  assert.deepEqual(classifyWorkerFreshness('2026-06-27T23:59:30.000Z', now), { state: 'fresh', ageSeconds: 30 });
  assert.deepEqual(classifyWorkerFreshness('2026-06-27T23:55:00.000Z', now), { state: 'stale', ageSeconds: 300 });
}

console.log('local analysis contracts tests passed');
