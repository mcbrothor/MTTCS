import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateInvestorFlowOscillator } from '../lib/recommendations/investor-flow-oscillator.ts';
import { selectInvestorFlowBatch } from '../lib/recommendations/investor-flow-batch.ts';

function row(ticker, day, amount, turnover = 1000) {
  return {
    ticker,
    tradeDate: `2026-08-${String(day).padStart(2, '0')}`,
    foreignNetBuyQty: 0,
    institutionNetBuyQty: 0,
    foreignNetBuyAmountMkrw: amount / 2,
    institutionNetBuyAmountMkrw: amount / 2,
    turnoverAmountMkrw: turnover,
    provider: 'KIS',
    quality: 'FULL',
    observedAt: '2026-08-20T00:00:00Z',
    rawJson: {},
  };
}

test('flow oscillator aggregates stocks by sector and finds bearish divergence', () => {
  const rows = [15, 16, 17, 18, 19].flatMap((day) => [row('000001', day, -30), row('000002', day, -30)]);
  const result = calculateInvestorFlowOscillator({
    rows,
    sectors: { '000001': '반도체', '000002': '반도체' },
    priceReturns5d: { '000001': 5, '000002': 3 },
    requestedStocks: 2,
    asOf: '2026-08-20',
  });
  assert.equal(result.quality, 'FULL');
  assert.equal(result.sectors[0].sector, '반도체');
  assert.equal(result.sectors[0].priceFlowDivergence, 'BEARISH');
  assert.equal(result.state, 'OUTFLOW');
});

test('flow oscillator blocks instead of emitting a false normal signal without data', () => {
  const result = calculateInvestorFlowOscillator({ rows: [], sectors: {}, requestedStocks: 350, asOf: '2026-08-20' });
  assert.equal(result.quality, 'BLOCKED');
  assert.equal(result.state, 'BLOCKED');
});

test('stale flow never emits a normal state', () => {
  const staleRows = [1, 2, 3, 4, 5].map((day) => ({ ...row('000001', day, 20), quality: 'STALE' }));
  const result = calculateInvestorFlowOscillator({ rows: staleRows, sectors: { '000001': '반도체' }, requestedStocks: 1, asOf: '2026-08-20' });
  assert.equal(result.quality, 'STALE');
  assert.equal(result.state, 'BLOCKED');
});

test('KIS collection exposes a cursor instead of silently dropping stocks after 40', () => {
  const tickers = Array.from({ length: 45 }, (_, index) => String(index + 1).padStart(6, '0'));
  const first = selectInvestorFlowBatch({ tickers, batchSize: 40 });
  const second = selectInvestorFlowBatch({ tickers, batchSize: 40, cursor: first.nextCursor });
  assert.equal(first.tickers.length, 40);
  assert.equal(first.nextCursor, 40);
  assert.equal(second.tickers.length, 5);
  assert.equal(second.nextCursor, null);
  assert.equal(second.allTickers.length, 45);
});
