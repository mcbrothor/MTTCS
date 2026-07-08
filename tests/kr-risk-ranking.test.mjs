import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const ranking = jiti('../lib/recommendations/kr-risk-ranking.ts');

function candidate(ticker, source, rank, options = {}) {
  return {
    source,
    universe: options.universe || 'KOSPI200',
    ticker,
    exchange: options.universe === 'KOSDAQ150' ? 'KOSDAQ' : 'KOSPI',
    name: ticker,
    score: options.score || 80,
    grade: 'A',
    rank,
    price: options.price || 100,
    priceAsOf: '2026-06-22',
    reason: 'test',
    metrics: {
      dollar_volume_20d: options.dollarVolume ?? 10_000_000_000,
      roc: options.roc ?? 2,
      return_5d_pct: options.return5d ?? 1,
    },
    raw: {},
  };
}

const candidates = [];
for (let index = 0; index < 15; index += 1) {
  const ticker = String(100000 + index);
  candidates.push(candidate(ticker, index < 4 ? 'momentum' : 'leader', index + 1, {
    universe: index >= 10 ? 'KOSDAQ150' : 'KOSPI200',
  }));
  if (index >= 4 && index < 10) candidates.push(candidate(ticker, 'canslim', index + 1));
}
candidates.push(candidate('999999', 'momentum', 1, { roc: 15 }));
candidates.push(candidate('888888', 'leader', 1, { return5d: -5 }));
candidates.push(candidate('777777', 'leader', 1, { dollarVolume: 1_000_000_000 }));

const flowFeatures = new Map(candidates.map((row) => [row.ticker, {
  ticker: row.ticker,
  asOfDate: '2026-06-22',
  latestTradeDate: '2026-06-22',
  provider: 'KIS',
  quality: 'FULL',
  foreignNetBuyAmountMkrw5d: row.ticker === '100004' ? 800 : -800,
  institutionNetBuyAmountMkrw5d: row.ticker === '100004' ? 400 : -400,
  turnoverAmountMkrw5d: 100000,
  combinedNetBuyRatio5d: row.ticker === '100004' ? 1.2 : -1.2,
}]));

const selected = ranking.selectKrRiskAdjustedTop10({
  candidates,
  marketState: { state: 'YELLOW' },
  flowFeatures,
  useFlow: true,
});
assert.equal(selected.length, 10);
assert.equal(selected.filter((row) => row.sources.length === 1 && row.sources[0] === 'momentum').length <= 1, true);
assert.equal(selected.filter((row) => row.pick.universe === 'KOSDAQ150').length <= 4, true);
assert.equal(selected.some((row) => row.pick.ticker === '999999'), false);
assert.equal(selected.some((row) => row.pick.ticker === '888888'), false);
assert.equal(selected.some((row) => row.pick.ticker === '777777'), false);
assert.equal(selected.find((row) => row.pick.ticker === '100004')?.flowScore, 12);

assert.throws(() => ranking.selectKrRiskAdjustedTop10({
  candidates: candidates.slice(0, 3),
  marketState: 'RED',
}), /requires 10 eligible picks/);

const softConstraintCandidates = Array.from({ length: 12 }, (_, index) => candidate(`KQ${index}`, 'leader', index + 1, {
  universe: 'KOSDAQ150',
  dollarVolume: 5_000_000_000,
}));
const softConstraintSelected = ranking.selectKrRiskAdjustedTop10({
  candidates: softConstraintCandidates,
  category: 'KOSDAQ150',
  marketState: 'YELLOW',
});
assert.equal(softConstraintSelected.length, 10);
assert.ok(softConstraintSelected.some((row) => row.riskFlags.includes('soft_constraint_relaxed')));

console.log('KR risk ranking tests passed');
