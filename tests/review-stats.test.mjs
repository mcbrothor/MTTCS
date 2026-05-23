import assert from 'node:assert/strict';
import {
  buildReviewStatsSummary,
  filterTradesByMistakeTag,
} from '../lib/review-stats.ts';

const trades = [
  {
    id: 't1',
    status: 'COMPLETED',
    exit_reason: 'target',
    mistake_tags: ['late_entry', 'plan_violation'],
    setup_tags: ['vcp'],
    result_amount: 1000,
    metrics: { rMultiple: 2, realizedPnL: 1000 },
  },
  {
    id: 't2',
    status: 'COMPLETED',
    exit_reason: 'stop',
    mistake_tags: ['late_entry'],
    setup_tags: ['vcp', 'breakout'],
    result_amount: -500,
    metrics: { rMultiple: -1, realizedPnL: -500 },
  },
  {
    id: 't3',
    status: 'COMPLETED',
    exit_reason: null,
    mistake_tags: ['early_exit'],
    setup_tags: ['breakout'],
    result_amount: 250,
    metrics: { rMultiple: 0.5, realizedPnL: 250 },
  },
  {
    id: 't4',
    status: 'ACTIVE',
    exit_reason: null,
    mistake_tags: ['late_entry'],
    setup_tags: ['watch'],
    result_amount: null,
    metrics: { rMultiple: null, realizedPnL: null },
  },
];

const summary = buildReviewStatsSummary(trades);

assert.equal(summary.completedCount, 3);
assert.equal(summary.exitReasons[0].reason, 'stop');
assert.equal(summary.exitReasons[0].count, 1);
assert.equal(summary.mistakeTags[0].tag, 'late_entry');
assert.equal(summary.mistakeTags[0].count, 2);
assert.equal(summary.mistakeTags[0].avgR, 0.5);
assert.equal(summary.mistakeTags[0].winRate, 50);
assert.equal(summary.setupTags[0].tag, 'breakout');
assert.equal(summary.setupTags[0].count, 2);

const filtered = filterTradesByMistakeTag(trades, 'late_entry');
assert.deepEqual(filtered.map((trade) => trade.id), ['t1', 't2', 't4']);
assert.equal(filterTradesByMistakeTag(trades, null).length, 4);

console.log('review stats tests passed');
