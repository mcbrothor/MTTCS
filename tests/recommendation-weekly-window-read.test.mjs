import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { readRecommendationMetrics, summarizeTickerContributions } = jiti('../lib/recommendations/read.ts');

{
  const contributions = summarizeTickerContributions([
    { ticker: 'AAA', name: '알파', returnPct: 6, excessReturnPct: 4 },
    { ticker: 'AAA', name: '알파', returnPct: 4, excessReturnPct: 2 },
    { ticker: 'BBB', name: '베타', returnPct: -3, excessReturnPct: -5 },
    { ticker: 'CCC', name: null, returnPct: 1, excessReturnPct: null },
  ]);
  assert.deepEqual(contributions, [
    {
      ticker: 'AAA',
      name: '알파',
      evaluationCount: 2,
      averageReturnPct: 5,
      averageExcessReturnPct: 3,
      contributionPctPoints: 1.5,
    },
    {
      ticker: 'BBB',
      name: '베타',
      evaluationCount: 1,
      averageReturnPct: -3,
      averageExcessReturnPct: -5,
      contributionPctPoints: -1.25,
    },
  ]);
}

const calls = [];
let query;
query = new Proxy({}, {
  get(_target, property) {
    if (property === 'then') {
      return (resolve) => resolve({ data: [], error: null });
    }
    return (...args) => {
      calls.push([property, ...args]);
      return query;
    };
  },
});
const client = {
  from(table) {
    calls.push(['from', table]);
    return query;
  },
};

const result = await readRecommendationMetrics({
  client,
  market: 'US',
  category: 'NASDAQ100',
  evaluationFrom: '2026-07-18',
  evaluationTo: '2026-07-24',
});

assert.deepEqual(result.horizons.map((row) => [row.horizon, row.sampleSize]), [
  ['D5', 0],
  ['D20', 0],
  ['D60', 0],
]);
assert.deepEqual(
  calls.filter(([method]) => method === 'gte' || method === 'lte'),
  [
    ['gte', 'evaluation_date', '2026-07-18'],
    ['lte', 'evaluation_date', '2026-07-24'],
  ],
);
assert.deepEqual(
  calls.filter(([method]) => method === 'order'),
  [
    ['order', 'evaluation_date', { ascending: true }],
    ['order', 'id', { ascending: true }],
  ],
);

{
  const rows = Array.from({ length: 1001 }, (_, index) => ({
    id: `performance-${String(index).padStart(4, '0')}`,
    horizon: 'D5',
    status: 'MATURED',
    return_pct: 1,
    benchmark_return_pct: 0,
    excess_return_pct: 1,
    mfe_pct: 2,
    mae_pct: -1,
    quality_status: 'FULL',
    evaluation_date: '2026-07-24',
    recommendation_picks: {
      id: `pick-${index}`,
      ticker: `TICKER${index}`,
      name: `종목 ${index}`,
      source: 'mixed',
      rank: 1,
      confidence: 0.8,
      universe: 'NASDAQ100',
      candidate_snapshot: {},
      recommendation_publications: {
        id: `publication-${index}`,
        run_date: '2026-07-17',
        market: 'US',
        category: 'NASDAQ100',
        engine_version: 'test',
        is_official: true,
      },
    },
  }));
  const ranges = [];
  const pagedClient = {
    from() {
      const chain = new Proxy({}, {
        get(_target, property) {
          if (property === 'then') {
            return (resolve) => resolve({ data: rows.slice(0, 1000), error: null });
          }
          if (property === 'range') {
            return (from, to) => {
              ranges.push([from, to]);
              return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
            };
          }
          return () => chain;
        },
      });
      return chain;
    },
  };

  const paged = await readRecommendationMetrics({
    client: pagedClient,
    market: 'US',
    category: 'NASDAQ100',
  });
  assert.equal(paged.horizons.find((row) => row.horizon === 'D5')?.sampleSize, 1001);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
}

console.log('recommendation weekly window read tests passed');
