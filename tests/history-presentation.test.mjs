import assert from 'node:assert/strict';
import {
  formatHistoryConfidence,
  getHistoryChecklistSummary,
  getHistoryComparisonSummary,
} from '../lib/history-presentation.ts';

{
  const summary = getHistoryChecklistSummary({
    checklist: {
      sepa: true,
      market: true,
      risk: true,
      entry: false,
      stoploss: true,
      exit: false,
      psychology: true,
    },
  });

  assert.equal(summary.passed, 5);
  assert.equal(summary.failed, 2);
  assert.equal(summary.total, 7);
  assert.equal(summary.passRate, 5 / 7);
}

{
  const summary = getHistoryComparisonSummary({
    status: 'COMPLETED',
    metrics: { rMultiple: 2.1, realizedPnL: 1200 },
    result_amount: 1200,
    final_discipline: 88,
    mistake_tags: [],
    llm_verdict: { recommendation: 'PROCEED' },
  });

  assert.equal(summary.tone, 'positive');
  assert.equal(summary.outcome, 'gain');
  assert.equal(summary.headline, 'Pre-trade conviction and actual outcome aligned.');
}

{
  const summary = getHistoryComparisonSummary({
    status: 'COMPLETED',
    metrics: { rMultiple: -1.3, realizedPnL: -800 },
    result_amount: -800,
    final_discipline: 82,
    mistake_tags: [],
    llm_verdict: { recommendation: 'PROCEED' },
  });

  assert.equal(summary.tone, 'negative');
  assert.equal(summary.outcome, 'loss');
  assert.equal(summary.headline, 'Contest conviction did not survive execution.');
}

{
  const summary = getHistoryComparisonSummary({
    status: 'COMPLETED',
    metrics: { rMultiple: -0.8, realizedPnL: -500 },
    result_amount: -500,
    final_discipline: 91,
    mistake_tags: [],
    llm_verdict: { recommendation: 'SKIP' },
  });

  assert.equal(summary.tone, 'positive');
  assert.equal(summary.headline, 'The skip verdict matched the weak outcome.');
}

{
  const summary = getHistoryComparisonSummary({
    status: 'COMPLETED',
    metrics: { rMultiple: 1.2, realizedPnL: 600 },
    result_amount: 600,
    final_discipline: 55,
    mistake_tags: ['plan_violation'],
    llm_verdict: { recommendation: 'PROCEED' },
  });

  assert.equal(summary.tone, 'negative');
  assert.match(summary.detail, /Plan-violation tag was recorded\./);
}

{
  const summary = getHistoryComparisonSummary({
    status: 'ACTIVE',
    metrics: { rMultiple: null, realizedPnL: null },
    result_amount: null,
    final_discipline: null,
    mistake_tags: [],
    llm_verdict: { recommendation: 'WATCH' },
  });

  assert.equal(summary.tone, 'neutral');
  assert.equal(summary.outcome, 'open');
  assert.equal(summary.headline, 'Outcome is still open.');
}

assert.equal(formatHistoryConfidence(0.834), '83%');
assert.equal(formatHistoryConfidence(null), '-');

console.log('history presentation tests passed');
