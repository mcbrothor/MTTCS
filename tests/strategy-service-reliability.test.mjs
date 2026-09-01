import assert from 'node:assert/strict';

import { loadKospi52wDataset } from '../lib/strategy/kospi-52w/service.ts';
import { loadUs52wDataset } from '../lib/strategy/us-52w/service.ts';
import { extractStrategyHoldings } from '../lib/strategy/holdings.ts';
import { decideUsRegime } from '../lib/strategy/us-monthly-v7/engine.ts';

function bars(length = 300, start = 100) {
  return Array.from({ length }, (_, index) => {
    const date = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
    const close = start + index;
    return { date, open: close, high: close + 1, low: close - 1, close, volume: 1_000 };
  });
}

{
  const calls = [];
  const dataset = await loadKospi52wDataset(300, {
    getMarketDailyPrice: async (ticker, exchange) => {
      calls.push({ ticker, exchange });
      return bars();
    },
    getYahooDailyPrice: async (ticker) => ticker === '^KS11' ? bars(300, 3_000) : [],
  });

  assert.equal(calls.some((call) => call.exchange === 'KRX'), false, 'KIS 국내 일봉에 미지원 KRX 코드를 보내면 안 된다');
  assert.equal(calls.find((call) => call.ticker === '229200')?.exchange, 'KOSPI');
  assert.equal(calls.find((call) => call.ticker === '069500')?.exchange, 'KOSPI');
  assert.equal(dataset.quality.status, 'VALID');
  assert.equal(dataset.quality.asOf, bars(300, 3_000).at(-1).date);
}

await assert.rejects(
  loadKospi52wDataset(300, {
    getMarketDailyPrice: async () => { throw new Error('KIS unavailable'); },
    getYahooDailyPrice: async () => { throw new Error('Yahoo unavailable'); },
  }),
  (error) => error?.name === 'StrategyDataUnavailableError' && /benchmark/i.test(error.message),
);

{
  const dataset = await loadUs52wDataset(300, {
    getYahooDailyPrice: async (ticker) => {
      if (ticker === 'SPY') return bars(300, 400);
      if (ticker === 'XLF') return bars();
      throw new Error(`${ticker} unavailable`);
    },
  });
  assert.equal(Object.keys(dataset.universeBars).length, 2);
  assert.equal(dataset.quality.status, 'DEGRADED');
  assert.ok(dataset.quality.warnings.length > 0);
}

assert.deepEqual(
  extractStrategyHoldings(
    [{ ticker: '069500.KS' }, { ticker: 'SPY' }, { ticker: '069500' }, { ticker: null }],
    ['069500', '229200'],
  ),
  ['069500'],
);

assert.deepEqual(decideUsRegime(85, -2), { regime: 'BROAD_TREND', weight: 100 });
assert.deepEqual(decideUsRegime(65, -4), { regime: 'SELECTIVE_TREND', weight: 75 });
assert.deepEqual(decideUsRegime(20, -25), { regime: 'CRASH_100', weight: 100 });

console.log('strategy service reliability tests passed');
