import assert from 'node:assert/strict';
import {
  getMasterFilterDailyPrice,
  selectFreshestSufficientHistory,
} from '../lib/master-filter/price-history.ts';

function history(length) {
  return Array.from({ length }, (_, index) => ({
    date: `2026-01-${String((index % 28) + 1).padStart(2, '0')}`,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100 + index,
    volume: 1_000,
  }));
}

{
  const kisCalls = [];
  const result = await getMasterFilterDailyPrice('069500.KS', {
    getYahooDailyPrice: async () => { throw new Error('Yahoo 429'); },
    getMarketDailyPrice: async (...args) => {
      kisCalls.push(args);
      return history(260);
    },
  });

  assert.equal(result.length, 260);
  assert.deepEqual(kisCalls, [['069500', 'KOSPI', 260]]);
}

{
  let kisCalls = 0;
  const yahooHistory = history(220);
  const result = await getMasterFilterDailyPrice('069500.KS', {
    getYahooDailyPrice: async () => yahooHistory,
    getMarketDailyPrice: async () => {
      kisCalls += 1;
      return history(260);
    },
  });

  assert.equal(result, yahooHistory);
  assert.equal(kisCalls, 0);
}

{
  let kisCalls = 0;
  const result = await getMasterFilterDailyPrice('^KS200', {
    getYahooDailyPrice: async () => { throw new Error('Yahoo 429'); },
    getMarketDailyPrice: async () => {
      kisCalls += 1;
      return history(260);
    },
  });

  assert.deepEqual(result, []);
  assert.equal(kisCalls, 0, 'Korean index symbols must not be sent to KIS stock candles');
}

{
  const yahooHistory = history(120);
  const result = await getMasterFilterDailyPrice('229200.KS', {
    getYahooDailyPrice: async () => yahooHistory,
    getMarketDailyPrice: async () => { throw new Error('KIS unavailable'); },
  });

  assert.equal(result, yahooHistory, 'the longest available history should survive provider failure');
}

{
  const stale = history(220).map((bar, index) => ({ ...bar, date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}` }));
  const fresh = history(220).map((bar, index) => ({ ...bar, date: `2026-08-${String((index % 20) + 1).padStart(2, '0')}` }));
  const selected = selectFreshestSufficientHistory(
    ['^KS200', '069500.KS'],
    new Map([['^KS200', stale], ['069500.KS', fresh]]),
  );

  assert.equal(selected, '069500.KS');
}
