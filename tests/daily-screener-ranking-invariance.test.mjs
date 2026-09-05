import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { ruleBasedDailyCategoryTop10 } = jiti('../lib/daily-screeners/index.ts');

const createCandidate = (ticker, source, score, category = 'NASDAQ100', exchange = 'NAS') => ({
  ticker,
  name: ticker,
  exchange,
  universe: category,
  source,
  score,
  grade: 'Review',
  price: 100,
  priceAsOf: '2026-09-04',
  reason: 'synthetic review probe',
  metrics: {},
  raw: {},
});

const fillers = [];
for (const cat of ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150']) {
  const ex = cat.startsWith('K') ? 'KOSPI' : 'NAS';
  for (let i = 0; i < 10; i++) {
    fillers.push(createCandidate(`F_${cat}_${i}`, 'minervini', 10 + i, cat, ex));
  }
}

const candA1 = createCandidate('AAA', 'minervini', 80);
const candA2 = createCandidate('AAA', 'canslim', 20);
const candA3 = createCandidate('AAA', 'leader', 30);
const candB = createCandidate('BBB', 'minervini', 90);

// Order 1: A1, A2, A3, B
const list1 = [candA1, candA2, candA3, candB, ...fillers];
const res1 = ruleBasedDailyCategoryTop10(list1);

// Order 2: A3, A2, A1, B (reversed order of A sources)
const list2 = [candA3, candA2, candA1, candB, ...fillers];
const res2 = ruleBasedDailyCategoryTop10(list2);

// Order 3: duplicate A1 present
const list3 = [candA3, candA2, candA1, candA1, candB, ...fillers];
const res3 = ruleBasedDailyCategoryTop10(list3);

const getTop2Tickers = (res) => res.categories.NASDAQ100.slice(0, 2).map((p) => p.ticker);

assert.deepEqual(getTop2Tickers(res1), getTop2Tickers(res2), 'Top 2 ranking must be invariant to candidate ordering');
assert.deepEqual(getTop2Tickers(res1), getTop2Tickers(res3), 'Top 2 ranking must be invariant to duplicate candidates');

console.log('F01: Daily screener candidate ranking invariance test passed successfully.');
