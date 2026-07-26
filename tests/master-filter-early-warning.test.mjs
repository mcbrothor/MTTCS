import assert from 'node:assert/strict';
import { buildEarlyWarningMatrix } from '../lib/master-filter/early-warning.ts';
import {
  friendlyDataSource,
  friendlyDecisionHeadline,
  friendlyFundName,
  friendlyIssue,
  friendlyMarketLabel,
  friendlyMetricLabel,
  friendlyMetricThreshold,
  friendlyMetricValue,
  friendlySectorLabel,
} from '../lib/market-display.ts';

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
      { symbol: 'XLK', name: 'Technology', return1: 1.5, return20: 5, riskOn: true, rank: 1 },
      { symbol: 'XLI', name: 'Industrials', return1: 1.2, return20: 4, riskOn: true, rank: 2 },
      { symbol: 'XLY', name: 'Consumer Discretionary', return1: 0.8, return20: 3, riskOn: true, rank: 3 },
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
  assert.match(matrix.signals.find((signal) => signal.id === 'index_ma50')?.reason ?? '', /SPY와 QQQ가 모두 50일선 위/);
  assert.match(matrix.signals.find((signal) => signal.id === 'big_tech_line')?.reason ?? '', /60달러 이상.*50일선/);
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
  assert.match(matrix.signals.find((signal) => signal.id === 'market_breadth')?.reason ?? '', /25% 미만.*중단/);
  assert.equal(matrix.signals.find((signal) => signal.id === 'money_flow')?.status, 'HALT');
  assert.match(matrix.signals.find((signal) => signal.id === 'money_flow')?.reason ?? '', /방어자산.*시장 참여 폭.*중단/);
}

{
  const matrix = buildEarlyWarningMatrix(baseInput({
    market: 'KR_KOSPI',
    mainSymbol: '^KS200',
    mainPrice: 418,
    mainMa50: 405,
    above200Pct: 67,
    foreignNetBuy5d: 920,
    breadthRows: [
      { symbol: '^KS200', above200: true, return20: 4.2 },
      { symbol: '^KQ11', above200: true, return20: 2.8 },
      { symbol: '069500.KS', above200: true, return20: 3.9 },
    ],
    sectorRows: [
      { symbol: '455850.KS', name: '반도체', return1: 2.1, return20: -8.1, riskOn: true, rank: 1 },
      { symbol: '123310.KS', name: '자동차', return1: 1.4, return20: -5.4, riskOn: true, rank: 2 },
      { symbol: '091220.KS', name: '은행', return1: 0.6, return20: -2.1, riskOn: false, rank: 3 },
    ],
    macroQuotes: {
      '^KS200': quote(418, 0.8, 405),
      '^KQ11': quote(910, 0.5, 890),
      // 한국 시장 결과는 미국 전용 입력이 섞여 와도 참조하면 안 된다.
      QQQ: quote(90, -8, 110),
      MAGS: quote(45, -9, 60),
      'AUDJPY=X': quote(101, -5, 110),
      RSP: quote(150, -4, 170),
      UUP: quote(33, 3, 30),
    },
  }));

  const serialized = JSON.stringify(matrix);
  assert.equal(matrix.rotation.diagnosis, 'HEALTHY_ROTATION');
  assert.ok(matrix.signals.some((signal) => signal.id === 'sector_leadership'));
  assert.ok(matrix.signals.some((signal) => signal.id === 'foreign_flow'));
  assert.doesNotMatch(serialized, /QQQ|MAGS|AUD\/JPY|RSP|UUP|빅테크|미국 시장|해외 성장주/);
}

{
  const matrix = buildEarlyWarningMatrix(baseInput({
    market: 'KR_KOSDAQ',
    mainSymbol: '^KQ11',
    mainPrice: 820,
    mainMa50: 850,
    above200Pct: 25,
    foreignNetBuy5d: -1400,
    breadthRows: [
      { symbol: '^KS11', above200: false, return20: -7 },
      { symbol: '^KQ11', above200: false, return20: -6 },
      { symbol: '229200.KS', above200: false, return20: -7.5 },
    ],
    sectorRows: [
      { symbol: '244580.KS', name: '바이오', return1: -3.5, return20: -4, riskOn: true, rank: 1 },
      { symbol: '455850.KS', name: '반도체', return1: -4.2, return20: -6, riskOn: true, rank: 2 },
      { symbol: '305720.KS', name: '2차전지', return1: -5.1, return20: -8, riskOn: true, rank: 3 },
    ],
    macroQuotes: {
      '^KQ11': quote(820, -2.5, 850),
      '^KS11': quote(2750, -1.8, 2830),
    },
  }));

  assert.equal(matrix.status, 'HALT');
  assert.equal(matrix.rotation.diagnosis, 'BROAD_DE_RISKING');
  assert.equal(matrix.signals.find((signal) => signal.id === 'foreign_flow')?.status, 'HALT');
  assert.match(matrix.signals.find((signal) => signal.id === 'index_ma50')?.value ?? '', /KOSDAQ.*KOSPI/);
}

assert.equal(friendlyMetricLabel('Average Daily Range (ADR)'), '20일 평균 하루 변동폭');
assert.equal(friendlyMetricLabel('Follow-Through Day'), '강한 반등 확인 여부');
assert.equal(friendlyDecisionHeadline('GO_FULL', false), '정상 진입 가능');
assert.doesNotMatch(friendlyDecisionHeadline('GO_50', false), /P3|ADR|FTD/);
assert.equal(friendlyMarketLabel('US'), '미국 시장');
assert.equal(friendlySectorLabel('Technology'), '기술');
assert.equal(friendlyFundName('XLK', 'State Street Technology Select Sector SPDR ETF'), '미국 기술 업종 상장지수펀드');
assert.equal(friendlyDataSource('MTN Aggregator · Market Analysis Engine'), '통합 시장 데이터 · 자체 분석');
assert.match(friendlyIssue('US intraday risk shock detected; GREEN is not allowed.') ?? '', /미국 증시.*진입 가능/);

const volatilityMetric = {
  label: 'Volatility (VIX)',
  value: 18.58,
  threshold: 20,
  status: 'PASS',
  unit: 'pts',
  description: '',
  source: 'CBOE via Yahoo',
};
assert.equal(friendlyMetricValue(volatilityMetric), '18.58포인트');
assert.equal(friendlyMetricThreshold(volatilityMetric), '20 이하이면 안정');

console.log('master filter early-warning tests passed');
