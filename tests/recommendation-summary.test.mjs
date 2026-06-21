import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const { summarizeFrequentRecommendationPicks } = jiti('../lib/recommendations/read.ts');

const rows = [
  { ticker: 'nvda', name: 'NVIDIA', rank: 3, runDate: '2026-06-20' },
  { ticker: 'NVDA', name: 'NVIDIA', rank: 1, runDate: '2026-06-18' },
  { ticker: 'AMAT', name: 'Applied Materials', rank: 2, runDate: '2026-06-20' },
  { ticker: 'AMAT', name: 'Applied Materials', rank: 4, runDate: '2026-06-19' },
  { ticker: 'MRVL', name: 'Marvell', rank: 1, runDate: '2026-06-17' },
];

const summary = summarizeFrequentRecommendationPicks(rows, 2);
assert.deepEqual(summary, [
  { ticker: 'NVDA', name: 'NVIDIA', recommendationCount: 2, averageRank: 2, latestRunDate: '2026-06-20' },
  { ticker: 'AMAT', name: 'Applied Materials', recommendationCount: 2, averageRank: 3, latestRunDate: '2026-06-20' },
]);

console.log('recommendation summary tests passed');
