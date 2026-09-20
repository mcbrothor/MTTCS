import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';
import { buildCodexDailyTop5Prompt } from '../scripts/lib/codex-cli-worker-utils.mjs';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const daily = jiti('../lib/daily-screeners/index.ts');
assert.throws(() => daily.assertDailyGenerationDate('2026-09-18', '2026-09-21'), /stored publication replay/);
assert.doesNotThrow(() => daily.assertDailyGenerationDate('2026-09-21', '2026-09-21'));
const candidates = Array.from({ length: 10 }, (_, index) => ({
  source: 'minervini', universe: 'SP500', ticker: `SP${index}`, exchange: 'NYS',
  name: `Stock ${index}`, score: 80 - index, grade: 'A', price: 100,
  priceAsOf: '2026-09-21', reason: 'fixture', metrics: {}, raw: {},
}));
const raw = JSON.stringify({ categories: { SP500: candidates.map((row, index) => ({
  rank: index + 1, ticker: row.ticker, reason: 'fixture', confidence: 0.8,
})) } });

// A failed NASDAQ source must not invalidate a complete S&P 500 response.
const parsed = daily.parseDailyCategoryTop10Response(raw, candidates, ['SP500']);
assert.equal(parsed.categories.SP500.length, 10);
assert.equal(parsed.categories.NASDAQ100.length, 0);
assert.throws(() => daily.parseDailyCategoryTop10Response(raw, candidates), /NASDAQ100/);
assert.throws(() => daily.parseDailyCategoryTop10Response(
  JSON.stringify({ categories: { SP500: JSON.parse(raw).categories.SP500.slice(0, 9) } }), candidates, ['SP500'],
), /exactly 10/);

const rules = daily.ruleBasedDailyCategoryTop10(candidates, ['SP500']);
assert.equal(rules.categories.SP500.length, 10);
assert.equal(rules.categories.NASDAQ100.length, 0);
const prompt = daily.buildDailyCategoryTop10Prompt({ runDate: '2026-09-21', candidates, categories: ['SP500'] });
assert.match(prompt, /대상 카테고리: SP500/);
const shape = prompt.split('\n').find((line) => line.startsWith('필수 JSON shape: '));
assert.deepEqual(Object.keys(JSON.parse(shape.slice('필수 JSON shape: '.length)).categories), ['SP500']);
const codexPrompt = buildCodexDailyTop5Prompt(prompt, ['SP500']);
assert.doesNotMatch(codexPrompt, /must include categories.NASDAQ100/);
assert.match(codexPrompt, /categories.SP500/);

const eligibility = daily.resolveDailyCategoryAvailability([...candidates, ...candidates], ['SP500', 'NASDAQ100']);
assert.deepEqual(eligibility.readyCategories, ['SP500']);
assert.equal(eligibility.counts.SP500, 10);
assert.deepEqual(eligibility.failedCategories.map((row) => row.category), ['NASDAQ100']);
const loaded = await daily.loadDailyScreenerUniverses(['NASDAQ100', 'SP500', 'KOSDAQ150'], async (universe) => {
  if (universe === 'NASDAQ100') throw new Error('upstream table missing');
  return { items: universe === 'SP500' ? candidates : [] };
}, 5);
assert.equal(loaded.rows.get('SP500').length, 5);
assert.equal(loaded.rows.has('NASDAQ100'), false);
assert.deepEqual(loaded.failures.map((row) => row.universe), ['NASDAQ100', 'KOSDAQ150']);
assert.match(loaded.failures[0].message, /upstream table missing/);
console.log('Daily market isolation tests passed.');
