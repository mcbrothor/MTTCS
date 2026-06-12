import assert from 'node:assert/strict';
import { normalizeTossCandles } from '../lib/finance/providers/toss-api.ts';

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

run('normalizes Toss daily candles into MTN OHLCData', () => {
  const rows = normalizeTossCandles([
    {
      timestamp: '2026-06-10T00:00:00+09:00',
      openPrice: '100.5',
      highPrice: '110',
      lowPrice: '99.25',
      closePrice: '108.75',
      volume: '1,234,567',
    },
  ]);

  assert.deepEqual(rows, [
    {
      date: '20260610',
      open: 100.5,
      high: 110,
      low: 99.25,
      close: 108.75,
      volume: 1234567,
    },
  ]);
});

run('drops incomplete Toss candle rows', () => {
  const rows = normalizeTossCandles([
    {
      timestamp: '2026-06-10T00:00:00Z',
      openPrice: '100',
      highPrice: '110',
      lowPrice: '90',
      closePrice: '',
      volume: '1000',
    },
  ]);

  assert.deepEqual(rows, []);
});
