import assert from 'node:assert/strict';
import { computeP3 } from '../lib/master-filter/compute.ts';

function makeUptrend(symbol = 'SPY') {
  const start = new Date('2025-08-01T00:00:00.000Z');
  return Array.from({ length: 230 }, (_, index) => {
    const close = 100 + index * 0.8;
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      date: date.toISOString().slice(0, 10),
      open: close - 0.2,
      high: close + 0.8,
      low: close - 0.8,
      close,
      volume: 1_000_000 + index,
      symbol,
    };
  });
}

const mainData = makeUptrend();
const vixData = makeUptrend('^VIX').map((row) => ({ ...row, close: 18, high: 19, low: 17 }));
const breadthRows = [
  { symbol: 'SPY', above200: true, return20: 10, nearHigh52: true, nearLow52: false },
  { symbol: 'QQQ', above200: true, return20: 12, nearHigh52: true, nearLow52: false },
  { symbol: 'DIA', above200: true, return20: 8, nearHigh52: true, nearLow52: false },
  { symbol: 'IWM', above200: true, return20: 7, nearHigh52: true, nearLow52: false },
  { symbol: 'RSP', above200: true, return20: 9, nearHigh52: true, nearLow52: false },
];
const sectorRows = [
  { symbol: 'XLK', name: 'Technology', return20: 12, riskOn: true, rank: 1 },
  { symbol: 'XLY', name: 'Consumer Discretionary', return20: 10, riskOn: true, rank: 2 },
  { symbol: 'XLC', name: 'Communication Services', return20: 8, riskOn: true, rank: 3 },
];

{
  const result = computeP3(mainData, vixData, breadthRows, sectorRows, 'SPY', ['SPY', 'QQQ', 'DIA', 'IWM', 'RSP'], undefined, undefined, {
    mainChangePct: -0.95,
    techChangePct: -2.63,
    vixChangePct: 8.9,
  });

  assert.equal(result.state, 'YELLOW');
  assert.equal(result.shockStateCap, 'YELLOW');
  assert.equal(result.metrics.intradayShock?.status, 'WARNING');
}

{
  const result = computeP3(mainData, vixData, breadthRows, sectorRows, '^KS200', ['^KS200', '^KQ150', '069500.KS'], undefined, undefined, {
    mainChangePct: -9.42,
    kospiChangePct: -9.99,
    kosdaqChangePct: -7.94,
  });

  assert.equal(result.state, 'RED');
  assert.equal(result.shockStateCap, 'RED');
  assert.equal(result.metrics.intradayShock?.status, 'FAIL');
}

console.log('master filter shock tests passed');
