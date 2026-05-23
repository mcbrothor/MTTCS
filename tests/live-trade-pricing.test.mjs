import assert from 'node:assert/strict';
import { buildLivePriceMap } from '../lib/finance/core/live-trade-pricing.ts';

const calls = {
  us: [],
  kr: [],
};

const priceMap = await buildLivePriceMap(
  [
    { ticker: 'NVDA', status: 'ACTIVE' },
    { ticker: 'META', status: 'ACTIVE' },
    { ticker: '005930', status: 'ACTIVE' },
    { ticker: 'AAPL', status: 'PLANNED' },
  ],
  {
    async getUsQuotes(tickers) {
      calls.us.push([...tickers]);
      return tickers.map((ticker, index) => ({
        symbol: ticker,
        regularMarketPrice: 100 + index,
      }));
    },
    async getKrPrice(ticker) {
      calls.kr.push(ticker);
      return 70_000;
    },
  }
);

assert.deepEqual(calls.us, [['NVDA', 'META']]);
assert.deepEqual(calls.kr, ['005930']);
assert.equal(priceMap.get('NVDA'), 100);
assert.equal(priceMap.get('META'), 101);
assert.equal(priceMap.get('005930'), 70000);
assert.equal(priceMap.has('AAPL'), false);

console.log('live trade pricing tests passed');
