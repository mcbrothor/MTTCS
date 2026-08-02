import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { loadActivePicks } = jiti('../lib/recommendations/jobs.ts');

const publication = {
  run_date: '2026-07-31',
  market: 'US',
  category: 'NASDAQ100',
  generated_at: '2026-07-31T12:00:00.000Z',
};
const sourceRows = [
  {
    id: 'active-pick',
    publication_id: 'publication-1',
    ticker: 'ACTIVE',
    exchange: 'NAS',
    source: 'mixed',
    sector: 'Technology',
    rank: 1,
    confidence: 0.9,
    benchmark_symbol: '^NDX',
    signal_price: 100,
    action_state: 'ACTIVE',
    recommendation_publications: publication,
  },
  {
    id: 'watchlist-pick',
    publication_id: 'publication-1',
    ticker: 'WATCH',
    exchange: 'NAS',
    source: 'mixed',
    sector: 'Technology',
    rank: 2,
    confidence: 0.8,
    benchmark_symbol: '^NDX',
    signal_price: 90,
    action_state: 'WATCHLIST',
    recommendation_publications: publication,
  },
];

const calls = [];
const client = {
  from(table) {
    assert.equal(table, 'recommendation_picks');
    const filters = {};
    const builder = {
      select(columns) {
        calls.push(['select', columns]);
        return builder;
      },
      eq(column, value) {
        calls.push(['eq', column, value]);
        filters[column] = value;
        return builder;
      },
      in(column, values) {
        calls.push(['in', column, values]);
        return builder;
      },
      gte(column, value) {
        calls.push(['gte', column, value]);
        return builder;
      },
      order(column, options) {
        calls.push(['order', column, options]);
        return builder;
      },
      range(from, to) {
        calls.push(['range', from, to]);
        const data = sourceRows.filter((row) => (
          !filters.action_state || row.action_state === filters.action_state
        ));
        return Promise.resolve({ data, error: null });
      },
    };
    return builder;
  },
};

const picks = await loadActivePicks(client, 'US');
assert.deepEqual(picks.map((pick) => pick.id), ['active-pick']);
assert.ok(calls.some(([method, column, value]) => (
  method === 'eq' && column === 'action_state' && value === 'ACTIVE'
)), 'performance loading must filter ACTIVE picks at the database boundary');
assert.match(
  calls.find(([method]) => method === 'select')[1],
  /\baction_state\b/,
  'selected rows retain their action-state evidence',
);

console.log('recommendation performance job tests passed');
