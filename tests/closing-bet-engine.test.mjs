import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { buildClosingSnapshot } = jiti('../lib/closing-bet/engine.ts');
const tradeDate = '2026-09-03';
const asOf = `${tradeDate}T15:18:00+09:00`;
const createdAt = `${tradeDate}T15:18:10+09:00`;
const bar = (time, open, close, turnover, volume = 500_000) => ({
  date: tradeDate, time, open, high: Math.max(open, close) + 100, low: Math.min(open, close) - 100, close, volume, turnover,
});
const daily = Array.from({ length: 60 }, (_, i) => {
  const date = new Date(Date.parse('2026-07-05T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10);
  const close = 90_000 + i * 150;
  return { date, open: close - 500, high: close + 200, low: close - 2_000, close, volume: 500_000, turnover: close * 500_000 };
});
function stock(ticker = '000001', overrides = {}) {
  return {
    ticker, name: `종목 ${ticker}`, market: 'KOSPI200', daily,
    minutes: [bar('090000', 99_500, 99_600, 49_750_000_000), bar('143000', 100_000, 100_200, 50_050_000_000), bar('151700', 100_800, 101_000, 50_400_000_000)],
    quote: { price: 101_000, open: 99_500, high: 101_100, low: 99_000, previousClose: 98_850, volume: 1_500_000, turnover: 150_200_000_000,
      observedAt: `${tradeDate}T15:17:59+09:00`, receivedAt: `${tradeDate}T15:18:02+09:00`, sector: `sector-${ticker}`,
      blockedReasons: [], statusKnown: true, ask: 101_010, bid: 100_990, askVolume: 10_000, bidVolume: 10_000, expectedPrice: 101_050, executionStrength: 105 },
    flow: { foreignNet: 100_000, institutionNet: 80_000, unit: 'SHARES', asOf: `${tradeDate}T14:30:00+09:00`, kind: 'ESTIMATE', venue: 'KRX' },
    historicalSameTimeVolumes: Array(20).fill(500_000),
    evidence: [{ title: '확인된 재료', url: 'https://example.com/disclosure', availableAt: `${tradeDate}T14:00:00+09:00`, kind: 'CATALYST' }], warnings: [],
    ...overrides,
  };
}
function snapshot(inputs = [stock()], overrides = {}) {
  return buildClosingSnapshot({ market: 'KOSPI200', tradeDate, asOf, createdAt, mode: 'LIVE', phase: 'FINAL',
    universe: { name: 'KOSPI200', observedAt: `${tradeDate}T08:00:00+09:00`, count: inputs.length, expectedCount: inputs.length, historicalMembership: true },
    inputs, benchmarkLateReturnPct: 0.2, regime: 'GREEN', ...overrides });
}

test('scores qualified live candidates, caps each market at five and preserves overflow', () => {
  const result = snapshot(Array.from({ length: 7 }, (_, i) => stock(String(i + 1).padStart(6, '0'))));
  assert.equal(result.picks.length, 5);
  assert.deepEqual(result.picks.map((row) => row.rank), [1, 2, 3, 4, 5]);
  assert.equal(result.candidates.length, 7);
  assert.equal(result.reviewCandidates.length, 2);
  assert.equal(result.coverage.collected, 7);
  assert.ok(result.picks.every((row) => row.score >= 75 && row.score <= 100));
  assert.equal(result.picks[0].score, Object.values(result.picks[0].scores).reduce((a, b) => a + b, 0));
});

test('filters foreign-market rows, malformed tickers and duplicates', () => {
  const result = snapshot([stock(), stock(), stock('INVALID'), stock('000002', { market: 'KOSDAQ150' })], {
    universe: { name: 'KOSPI200', observedAt: asOf, count: 1, expectedCount: 1, historicalMembership: true },
  });
  assert.deepEqual(result.candidates.map((row) => row.ticker), ['000001']);
});

test('ignores current/future daily bars, incomplete minute and future news', () => {
  const baseline = snapshot().candidates[0];
  const input = stock();
  input.daily.push({ ...daily.at(-1), date: tradeDate, close: 999_999, high: 999_999 });
  input.minutes.push(bar('151800', 999_000, 999_900, 999_000_000_000));
  input.minutes.push(bar('153000', 888_000, 999_900, 999_000_000_000));
  input.evidence.push({ title: '장후 위험 공시', url: 'https://example.com/later', availableAt: `${tradeDate}T15:31:00+09:00`, kind: 'RISK' });
  const result = snapshot([input]).candidates[0];
  assert.equal(result.metrics.ma20, baseline.metrics.ma20);
  assert.equal(result.metrics.vwap, baseline.metrics.vwap);
  assert.equal(result.chart.length, 3);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.status, 'ACTIONABLE');
});

test('future quote cannot substitute for a cutoff quote or preserve official coverage', () => {
  const input = stock();
  input.quote.observedAt = `${tradeDate}T15:18:01+09:00`;
  const result = snapshot([input]);
  assert.equal(result.picks.length, 0);
  assert.equal(result.coverage.collected, 0);
  assert.ok(result.candidates[0].warnings.includes('QUOTE_STALE_OR_UNVERIFIED'));
});

test('stale quote and unknown security status prevent actionable picks', () => {
  for (const patch of [{ observedAt: `${tradeDate}T15:15:00+09:00` }, { statusKnown: false }]) {
    const input = stock();
    Object.assign(input.quote, patch);
    const result = snapshot([input]);
    assert.equal(result.picks.length, 0);
    assert.equal(result.candidates[0].status, 'WATCH');
  }
});

test('known security blocks override all positive scores', () => {
  const input = stock();
  input.quote.blockedReasons = ['SHORT_TERM_OVERHEATED'];
  const result = snapshot([input]);
  assert.equal(result.picks.length, 0);
  assert.equal(result.candidates[0].status, 'EXCLUDED');
  assert.ok(result.candidates[0].exclusions.includes('SHORT_TERM_OVERHEATED'));
});

test('500 eok gate uses measured turnover without projected volume or extrapolation', () => {
  const input = stock();
  input.quote.turnover = 49_999_999_999;
  const result = snapshot([input]);
  assert.equal(result.picks.length, 0);
  assert.ok(result.candidates[0].exclusions.includes('TURNOVER_BELOW_500EOK'));
  input.quote.turnover = 50_000_000_000;
  assert.ok(!snapshot([input]).candidates[0].exclusions.includes('TURNOVER_BELOW_500EOK'));
});

test('missing optional evidence scores zero without renormalization', () => {
  const input = stock();
  input.flow = { foreignNet: null, institutionNet: null, unit: 'SHARES', asOf: null, kind: 'MISSING', venue: 'UNKNOWN' };
  input.historicalSameTimeVolumes = [];
  input.evidence = [];
  const result = snapshot([input]);
  assert.equal(result.candidates[0].scores.flow, 0);
  assert.equal(result.candidates[0].scores.catalyst, 0);
  assert.equal(result.candidates[0].score, 67);
  assert.equal(result.picks.length, 0);
  assert.equal(result.reviewCandidates.length, 1);
});

test('unknown venue and post-cutoff flow cannot earn points', () => {
  for (const patch of [{ venue: 'UNKNOWN' }, { asOf: `${tradeDate}T15:31:00+09:00` }, { kind: 'PREVIOUS_CONFIRMED', asOf: asOf }]) {
    const input = stock();
    Object.assign(input.flow, patch);
    assert.equal(snapshot([input]).candidates[0].scores.flow, 0);
  }
});

test('replay never publishes official picks and ignores current quotes and status', () => {
  const input = stock();
  input.quote.price = 999_999;
  input.quote.turnover = 999_999;
  input.quote.blockedReasons = ['CURRENT_NOT_HISTORICAL'];
  const result = snapshot([input], { mode: 'REPLAY', createdAt: '2026-09-05T12:00:00+09:00' });
  assert.equal(result.picks.length, 0);
  assert.equal(result.reviewCandidates.length, 1);
  assert.equal(result.candidates[0].metrics.price, 101_000);
  assert.equal(result.candidates[0].metrics.turnover, 150_200_000_000);
  assert.equal(result.candidates[0].sector, null);
  assert.equal(result.candidates[0].scores.execution, 0);
  assert.ok(!result.candidates[0].exclusions.includes('CURRENT_NOT_HISTORICAL'));
});

test('market coverage below 95 percent blocks picks but preserves candidates', () => {
  const result = snapshot([stock()], { universe: { name: 'KOSPI200', observedAt: asOf, count: 200, expectedCount: 200, historicalMembership: true } });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.picks.length, 0);
  assert.equal(result.reviewCandidates.length, 1);
  assert.equal(result.coverage.failed, 199);
});

test('red and unknown regimes block official picks; watch phase never publishes picks', () => {
  for (const regime of ['RED', 'UNKNOWN']) {
    assert.equal(snapshot([stock()], { regime }).picks.length, 0);
    assert.equal(snapshot([stock()], { regime }).status, 'BLOCKED');
  }
  assert.equal(snapshot([stock()], { phase: 'WATCH' }).picks.length, 0);
});

test('wide/crossed books, price chase and overheated price fail execution gates', () => {
  for (const [patch, expected] of [
    [{ ask: 101_400, bid: 100_900 }, 'SPREAD_TOO_WIDE'],
    [{ ask: 102_000, bid: 101_900 }, 'ENTRY_ATR_EXCEEDED'],
    [{ expectedPrice: 103_000 }, 'EXPECTED_PRICE_ABOVE_ENTRY_MAX'],
    [{ price: 106_000, high: 106_100, ask: 106_010, bid: 105_990 }, 'OVEREXTENDED_FROM_VWAP'],
  ]) {
    const input = stock();
    Object.assign(input.quote, patch);
    const result = snapshot([input]);
    assert.equal(result.picks.length, 0);
    assert.ok(result.candidates[0].exclusions.includes(expected), expected);
  }
  const crossed = stock();
  crossed.quote.ask = 100_900;
  assert.equal(snapshot([crossed]).picks.length, 0);
});

test('same sector is capped at two and concentration points preserve score ceiling', () => {
  const inputs = Array.from({ length: 4 }, (_, i) => {
    const item = stock(String(i + 1).padStart(6, '0'));
    item.quote.sector = '반도체';
    return item;
  });
  const result = snapshot(inputs);
  assert.equal(result.picks.length, 2);
  assert.ok(result.candidates.every((item) => item.score === 100));
});

test('empty inputs produce blocked snapshot and malformed cutoff is rejected', () => {
  assert.equal(snapshot([]).status, 'BLOCKED');
  assert.throws(() => snapshot([stock()], { asOf: 'invalid' }), /timestamp/);
});

test('actual final collection timestamp is accepted before auction, never at or after 15:20', () => {
  const input = stock();
  input.quote.observedAt = `${tradeDate}T15:18:30+09:00`;
  input.quote.receivedAt = `${tradeDate}T15:18:35+09:00`;
  assert.equal(snapshot([input], { asOf: `${tradeDate}T15:18:37+09:00`, createdAt: `${tradeDate}T15:18:40+09:00` }).picks.length, 1);
  assert.throws(() => snapshot([input], { asOf: `${tradeDate}T15:20:00+09:00` }), /cutoff/);
  assert.throws(() => snapshot([input], { mode: 'REPLAY', asOf: `${tradeDate}T15:18:37+09:00` }), /cutoff/);
  assert.equal(snapshot([stock()], { createdAt: `${tradeDate}T15:20:00+09:00` }).picks.length, 0);
});

test('review list prioritizes nonexcluded candidates over higher-scoring known blocks', () => {
  const blocked = stock();
  blocked.quote.blockedReasons = ['TRADING_HALTED'];
  const watch = stock('000002', { historicalSameTimeVolumes: [] });
  watch.quote.statusKnown = false;
  const result = snapshot([blocked, watch]);
  assert.equal(result.reviewCandidates[0].ticker, '000002');
  assert.equal(result.reviewCandidates[1].status, 'EXCLUDED');
});

test('later minutes cannot substitute for the 14:30 baseline or a missing market return', () => {
  const input = stock();
  input.minutes = input.minutes.filter((item) => item.time !== '143000');
  const result = snapshot([input]);
  assert.equal(result.candidates[0].metrics.lateReturnPct, null);
  assert.equal(result.picks.length, 0);
  assert.equal(snapshot([stock()], { benchmarkLateReturnPct: null }).picks.length, 0);
});

test('an absent opening minute is not described as full-session VWAP', () => {
  const input = stock();
  input.minutes[0] = { ...input.minutes[0], time: '090100' };
  const result = snapshot([input], { mode: 'REPLAY' });
  assert.equal(result.candidates[0].metrics.vwap, null);
  assert.equal(result.picks.length, 0);
});

test('a trend continuation below the prior high is distinct from a failed intraday breakout', () => {
  const input = stock();
  Object.assign(input.quote, { price: 98_400, high: 98_500, low: 97_000 });
  assert.ok(!snapshot([input]).candidates[0].exclusions.includes('BREAKOUT_NOT_HELD'));
  input.quote.high = 100_000;
  assert.ok(snapshot([input]).candidates[0].exclusions.includes('BREAKOUT_NOT_HELD'));
});

test('same-time rvol always uses completed volume at fixed 15:18, not later live cumulative volume', () => {
  const input = stock();
  Object.assign(input.quote, { volume: 9_000_000, observedAt: `${tradeDate}T15:18:59+09:00`, receivedAt: `${tradeDate}T15:19:01+09:00` });
  input.minutes.push(bar('151800', 101_000, 101_000, 900_000_000_000, 9_000_000));
  const result = snapshot([input], { asOf: `${tradeDate}T15:19:00+09:00`, createdAt: `${tradeDate}T15:19:05+09:00` });
  assert.equal(result.candidates[0].metrics.rvol, 3);
});

test('special session shifts close-relative cutoff and expiry without using normal-hours gates', () => {
  const input = stock();
  input.minutes = input.minutes.map((item) => ({ ...item, time: String(Number(item.time) + 10000).padStart(6, '0') }));
  Object.assign(input.quote, { observedAt: `${tradeDate}T16:17:59+09:00`, receivedAt: `${tradeDate}T16:18:02+09:00` });
  const result = snapshot([input], { asOf: `${tradeDate}T16:18:00+09:00`, createdAt: `${tradeDate}T16:18:10+09:00`, session: { open: '10:00:00', close: '16:30:00' } });
  assert.equal(result.picks.length, 1);
  assert.equal(result.picks[0].plan.expiresAt, `${tradeDate}T16:28:00+09:00`);
  assert.deepEqual(result.session, { open: '10:00:00', close: '16:30:00' });
  assert.throws(() => snapshot([stock()], { session: { open: '25:00:00', close: '26:30:00' } }), /session/);
});

test('basic scan coverage is independent of noncandidate quote freshness after detailed collection', () => {
  const inputs = Array.from({ length: 200 }, (_, index) => {
    const input = stock(String(index + 1).padStart(6, '0'));
    if (index) {
      input.daily = [];
      input.minutes = [];
      Object.assign(input.quote, { turnover: 10_000_000_000, observedAt: `${tradeDate}T15:15:00+09:00`, receivedAt: `${tradeDate}T15:15:02+09:00` });
    }
    return input;
  });
  const result = snapshot(inputs);
  assert.deepEqual(result.coverage, { collected: 200, total: 200, failed: 0 });
  assert.equal(result.picks.length, 1);
  assert.equal(result.picks[0].ticker, '000001');
  assert.ok(result.candidates.find((row) => row.ticker === '000002').warnings.includes('QUOTE_STALE_OR_UNVERIFIED'));
});

test('basic success metadata survives a failed candidate quote refresh without making that candidate actionable', () => {
  const inputs = Array.from({ length: 20 }, (_, index) => stock(String(index + 1).padStart(6, '0')));
  inputs[0].quote = null;
  inputs[1].quote = null;
  const result = snapshot(inputs, { basicScan: { startedAt: `${tradeDate}T15:15:00+09:00`, completedAt: `${tradeDate}T15:16:00+09:00`, successfulTickers: inputs.map((item) => item.ticker) } });
  assert.equal(result.coverage.collected, 20);
  assert.equal(result.coverage.failed, 0);
  assert.equal(result.picks.length, 5);
  assert.ok(result.picks.every((row) => !['000001', '000002'].includes(row.ticker)));
});

test('coverage metadata cannot inflate the pool with duplicate or foreign tickers', () => {
  const result = snapshot([stock()], { basicScan: { startedAt: `${tradeDate}T15:15:00+09:00`, completedAt: `${tradeDate}T15:16:00+09:00`, successfulTickers: ['000001', '000001', '999999'] } });
  assert.equal(result.coverage.collected, 1);
});

test('basic scan metadata outside the session, after cutoff, or older than ten minutes is rejected', () => {
  for (const [startedAt, completedAt] of [
    [`${tradeDate}T08:00:00+09:00`, `${tradeDate}T08:01:00+09:00`],
    [`${tradeDate}T15:15:00+09:00`, `${tradeDate}T15:18:01+09:00`],
    [`${tradeDate}T15:00:00+09:00`, `${tradeDate}T15:01:00+09:00`],
  ]) {
    const result = snapshot([stock()], { basicScan: { startedAt, completedAt, successfulTickers: ['000001'] } });
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.coverage.collected, 0);
    assert.equal(result.picks.length, 0);
  }
});

test('late relative strength matches benchmark fixed-cutoff minutes while the entry plan uses the fresh quote', () => {
  const input = stock();
  Object.assign(input.quote, { price: 101_500, high: 101_600, ask: 101_510, bid: 101_490, observedAt: `${tradeDate}T15:18:59+09:00`, receivedAt: `${tradeDate}T15:19:01+09:00` });
  input.minutes.push(bar('151800', 101_000, 101_500, 50_500_000_000));
  const result = snapshot([input], { asOf: `${tradeDate}T15:19:00+09:00`, createdAt: `${tradeDate}T15:19:05+09:00` });
  assert.equal(result.candidates[0].metrics.price, 101_500);
  assert.ok(Math.abs(result.candidates[0].metrics.lateReturnPct - 1) < 1e-10);
  assert.ok(Math.abs(result.candidates[0].metrics.relativeLateReturnPct - 0.8) < 1e-10);
});

test('replay review puts verified liquidity and core data ahead of an incomplete watch candidate', () => {
  const incomplete = stock('000001');
  incomplete.minutes = incomplete.minutes.map((item) => ({ ...item, turnover: null }));
  const verified = stock('000002');
  verified.minutes[2] = { ...verified.minutes[2], low: 100_200, high: 101_500, close: 100_400 };
  const result = snapshot([incomplete, verified], { mode: 'REPLAY' });
  const unknown = result.candidates.find((item) => item.ticker === '000001');
  assert.equal(unknown.status, 'WATCH');
  assert.equal(unknown.metrics.turnover, null);
  assert.equal(result.candidates.find((item) => item.ticker === '000002').status, 'EXCLUDED');
  assert.equal(result.reviewCandidates[0].ticker, '000002');
  assert.equal(result.reviewCandidates[1].ticker, '000001');
});

test('review ranks complete technical evidence before missing history when both meet liquidity', () => {
  const incomplete = stock('000001', { daily: [] });
  const verified = stock('000002');
  verified.quote.high = 103_000;
  const result = snapshot([incomplete, verified]);
  assert.equal(result.reviewCandidates[0].ticker, '000002');
  assert.equal(result.reviewCandidates[1].ticker, '000001');
});
