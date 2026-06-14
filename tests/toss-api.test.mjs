import assert from 'node:assert/strict';
import { normalizeTossCandles, normalizeTossHoldings } from '../lib/finance/providers/toss-api.ts';

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

run('normalizes Toss holdings into MTN positions', () => {
  const snapshot = normalizeTossHoldings({
    result: {
      summary: {
        totalAsset: '1,500,000',
        cash: '250000',
        timestamp: '2026-06-14T09:00:00+09:00',
      },
      holdings: [
        {
          stockCode: '005930',
          stockName: '삼성전자',
          balanceQuantity: '10',
          averagePurchasePrice: '70000',
          currentPrice: '75000',
          evaluationAmount: '750000',
          evaluationProfitLoss: '50000',
          profitLossRate: '7.14',
          currency: 'KRW',
        },
        {
          stockCode: '000000',
          balanceQuantity: '0',
        },
      ],
    },
  });

  assert.equal(snapshot.totalEquity, 1500000);
  assert.equal(snapshot.cash, 250000);
  assert.equal(snapshot.asOf, '2026-06-14T09:00:00+09:00');
  assert.deepEqual(snapshot.positions, [
    {
      symbol: '005930',
      name: '삼성전자',
      quantity: 10,
      avgPrice: 70000,
      currentPrice: 75000,
      evaluationAmount: 750000,
      purchaseAmount: null,
      profitLoss: 50000,
      profitLossRate: 7.14,
      currency: 'KRW',
    },
  ]);
});
