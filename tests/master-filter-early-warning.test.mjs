import assert from 'node:assert/strict';
import { buildEarlyWarningMatrix } from '../lib/master-filter/early-warning.ts';
import { friendlyDecisionHeadline, friendlyMetricLabel } from '../lib/market-display.ts';

function quote(price, change, ma50 = price) {
  return {
    regularMarketPrice: price,
    regularMarketChangePercent: change,
    fiftyDayAverage: ma50,
  };
}

function baseInput(overrides = {}) {
  return {
    market: 'US',
    mainSymbol: 'SPY',
    mainPrice: 105,
    mainMa50: 100,
    above200Pct: 72,
    currentVix: 16,
    breadthRows: [
      { symbol: 'SPY', above200: true, return20: 4 },
      { symbol: 'QQQ', above200: true, return20: 5 },
      { symbol: 'IWM', above200: true, return20: 3 },
      { symbol: 'RSP', above200: true, return20: 2 },
    ],
    sectorRows: [
      { symbol: 'XLK', name: 'Technology', return20: 5, riskOn: true, rank: 1 },
      { symbol: 'XLI', name: 'Industrials', return20: 4, riskOn: true, rank: 2 },
      { symbol: 'XLY', name: 'Consumer Discretionary', return20: 3, riskOn: true, rank: 3 },
    ],
    macroQuotes: {
      SPY: quote(105, 0.4, 100),
      QQQ: quote(112, 0.7, 108),
      MAGS: quote(62, 0.8, 60),
      'AUDJPY=X': quote(111.2, 0.2, 110),
      IWM: quote(210, 0.3, 205),
      MDY: quote(570, 0.2, 560),
      RSP: quote(170, 0.25, 168),
      XLI: quote(130, 0.4, 126),
      XLRE: quote(42, -0.1, 41),
      IYR: quote(95, -0.1, 94),
      SHY: quote(82, -0.1, 82),
      TLT: quote(92, -0.2, 94),
      GLD: quote(225, -0.1, 220),
      UUP: quote(29, -0.1, 30),
    },
    ...overrides,
  };
}

{
  const matrix = buildEarlyWarningMatrix(baseInput());
  assert.equal(matrix.status, 'OK');
  assert.equal(matrix.rotation.diagnosis, 'BIG_TECH_LEADERSHIP');
  assert.equal(matrix.signals.find((signal) => signal.id === 'index_ma50')?.status, 'OK');
}

{
  const matrix = buildEarlyWarningMatrix(baseInput({
    macroQuotes: {
      ...baseInput().macroQuotes,
      SPY: quote(105, -0.4, 100),
      QQQ: quote(109, -1.1, 108),
      MAGS: quote(59, -1.4, 61),
      IWM: quote(214, 0.7, 205),
      MDY: quote(578, 0.6, 560),
      RSP: quote(173, 0.5, 168),
      XLI: quote(132, 0.6, 126),
    },
  }));
  assert.equal(matrix.rotation.diagnosis, 'HEALTHY_ROTATION');
  assert.equal(matrix.signals.find((signal) => signal.id === 'big_tech_line')?.status, 'WATCH');
  assert.equal(matrix.signals.find((signal) => signal.id === 'money_flow')?.status, 'OK');
}

{
  const matrix = buildEarlyWarningMatrix(baseInput({
    mainPrice: 95,
    mainMa50: 100,
    above200Pct: 22,
    currentVix: 25,
    breadthRows: [
      { symbol: 'SPY', above200: false, return20: -5 },
      { symbol: 'QQQ', above200: false, return20: -6 },
      { symbol: 'IWM', above200: false, return20: -7 },
      { symbol: 'RSP', above200: false, return20: -5 },
    ],
    macroQuotes: {
      ...baseInput().macroQuotes,
      SPY: quote(95, -1.0, 100),
      QQQ: quote(101, -2.1, 108),
      MAGS: quote(57, -2.4, 61),
      'AUDJPY=X': quote(107.5, -1.2, 110),
      IWM: quote(198, -1.2, 205),
      MDY: quote(545, -1.0, 560),
      RSP: quote(160, -0.9, 168),
      XLI: quote(121, -0.8, 126),
      SHY: quote(83, 0.5, 82),
      TLT: quote(96, 0.8, 94),
      GLD: quote(230, 0.7, 220),
      UUP: quote(31, 0.6, 30),
    },
  }));
  assert.equal(matrix.status, 'HALT');
  assert.equal(matrix.rotation.diagnosis, 'BROAD_DE_RISKING');
  assert.equal(matrix.signals.find((signal) => signal.id === 'market_breadth')?.status, 'HALT');
  assert.equal(matrix.signals.find((signal) => signal.id === 'money_flow')?.status, 'HALT');
}

assert.equal(friendlyMetricLabel('Average Daily Range (ADR)'), '20일 평균 하루 변동폭');
assert.equal(friendlyMetricLabel('Follow-Through Day'), '강한 반등 확인 여부');
assert.equal(friendlyDecisionHeadline('GO_FULL', false), '정상 진입 가능');
assert.doesNotMatch(friendlyDecisionHeadline('GO_50', false), /P3|ADR|FTD/);

console.log('master filter early-warning tests passed');
