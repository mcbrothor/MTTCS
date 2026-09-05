import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true });
const { evaluateClosingCandidate } = jiti('../lib/closing-bet/evaluation.ts');
const date = '2026-09-03';
const nextDate = '2026-09-04';
const bar = (date, time, open, high, low, close = open) => ({ date, time, open, high, low, close, volume: 100, turnover: open * 100 });
const entryDay = [bar(date, '153000', 100, 100, 100)];
const morning = (open = 100, high = 101, low = 99) => Array.from({ length: 30 }, (_, minute) =>
  bar(nextDate, `09${String(minute).padStart(2, '0')}00`, open, high, low));
function fixture() {
  const candidate = { ticker: '005930', market: 'KOSPI200', status: 'ACTIONABLE', plan: { entryLow: 99, entryMax: 101, invalidation: 97, target: 105 } };
  const snapshot = { id: 'snapshot-1', market: 'KOSPI200', mode: 'LIVE', tradeDate: date, candidates: [candidate] };
  return { snapshot, candidate };
}
function evaluate(nextDay, override = {}) {
  const { snapshot, candidate } = fixture();
  return evaluateClosingCandidate(override.snapshot ?? snapshot, override.candidate ?? candidate, override.entryDay ?? entryDay, nextDay, override.nextDate ?? nextDate, override.costBps ?? 25);
}

test('reports close-to-open benchmark separately from 09:30 conditional time exit', () => {
  const result = evaluate([...morning(101, 102, 100), bar(nextDate, '093000', 102, 109, 90)]);
  assert.equal(result.status, 'SIMULATED');
  assert.equal(result.entry, 100);
  assert.equal(result.exit, 102);
  assert.ok(Math.abs(result.benchmarkReturnPct - 1) < 1e-10);
  assert.ok(Math.abs(result.netReturnPct - 1.75) < 1e-10);
  assert.equal(result.exitReason, 'TIME_STOP_FIRST_OPEN_AT_OR_AFTER_0930');
  assert.ok(result.warnings.includes('CONDITIONAL_SIMULATION_NOT_ACTUAL_FILL'));
  assert.ok(result.mfePct < 3, 'does not include high after the exit at bar open');
});

test('gap below stop exits at observed open, never at unavailable stop price', () => {
  const result = evaluate([bar(nextDate, '090000', 90, 91, 89)]);
  assert.equal(result.exit, 90);
  assert.equal(result.exitReason, 'GAP_STOP_AT_OBSERVED_OPEN');
  assert.ok(Math.abs(result.netReturnPct + 10.25) < 1e-10);
});

test('both stop and target in one bar conservatively selects the stop', () => {
  const result = evaluate([bar(nextDate, '090000', 100, 106, 96)]);
  assert.equal(result.exit, 97);
  assert.equal(result.exitReason, 'STOP_FIRST_SAME_BAR_AMBIGUITY');
  assert.ok(result.warnings.includes('SAME_BAR_BOTH_LEVELS_STOP_FIRST'));
});

test('time stop uses first available bar at or after 09:30', () => {
  const result = evaluate([...morning(), bar(nextDate, '093100', 101, 102, 100)]);
  assert.equal(result.exit, 101);
  assert.equal(result.exitReason, 'TIME_STOP_FIRST_OPEN_AT_OR_AFTER_0930');
});

test('missing next-day prices remain pending, including September 4 replay', () => {
  const { snapshot, candidate } = fixture();
  snapshot.tradeDate = nextDate;
  snapshot.mode = 'REPLAY';
  const result = evaluateClosingCandidate(snapshot, candidate, [bar(nextDate, '153000', 100, 100, 100)], [], null);
  assert.equal(result.status, 'PENDING');
  assert.equal(result.netReturnPct, null);
  assert.equal(result.benchmarkReturnPct, null);
});

test('incomplete close/open data cannot be substituted with the last or first arbitrary bar', () => {
  const result = evaluate([bar(nextDate, '090100', 100, 101, 99)], { entryDay: [bar(date, '152900', 100, 100, 100)] });
  assert.equal(result.status, 'DATA_MISSING');
  assert.equal(result.entry, null);
  assert.equal(result.benchmarkReturnPct, null);
});

test('entry outside fixed range has benchmark only and no strategy return', () => {
  const result = evaluate([bar(nextDate, '090000', 104, 105, 103)], { entryDay: [bar(date, '153000', 102, 102, 102)] });
  assert.equal(result.status, 'NO_ENTRY');
  assert.equal(result.entry, null);
  assert.notEqual(result.benchmarkReturnPct, null);
  assert.equal(result.netReturnPct, null);
});

test('excluded candidates never simulate entry despite price being in range', () => {
  const { candidate } = fixture();
  candidate.status = 'EXCLUDED';
  const result = evaluate([bar(nextDate, '090000', 100, 101, 99)], { candidate });
  assert.equal(result.status, 'NO_ENTRY');
  assert.equal(result.exitReason, 'CANDIDATE_EXCLUDED');
});

test('missing exit window fails rather than silently marking to last available close', () => {
  const result = evaluate([bar(nextDate, '090000', 100, 101, 99)]);
  assert.equal(result.status, 'DATA_MISSING');
  assert.equal(result.netReturnPct, null);
});

test('timeframe mismatch and invalid costs are rejected', () => {
  assert.equal(evaluate([bar(nextDate, '090000', 100, 101, 99)], { nextDate: date }).status, 'DATA_MISSING');
  assert.throws(() => evaluate([], { costBps: -1 }), /non-negative/);
});

test('replay review candidate can only produce explicitly hypothetical conditional evaluation', () => {
  const { snapshot, candidate } = fixture();
  snapshot.mode = 'REPLAY';
  candidate.status = 'WATCH';
  const result = evaluate([...morning(), bar(nextDate, '093000', 102, 103, 101)], { snapshot, candidate });
  assert.equal(result.status, 'SIMULATED');
  assert.ok(result.warnings.includes('REVIEW_CANDIDATE_HYPOTHETICAL_ENTRY'));
});

test('a gap in the morning path cannot silently skip an unobserved stop', () => {
  const result = evaluate([bar(nextDate, '090000', 100, 101, 99), bar(nextDate, '093000', 102, 103, 101)]);
  assert.equal(result.status, 'DATA_MISSING');
  assert.equal(result.netReturnPct, null);
  assert.ok(result.warnings.includes('INTRADAY_PATH_GAP'));
});

test('special entry and next-day sessions each use their own close and open-plus-30-minute exit', () => {
  const { snapshot, candidate } = fixture();
  snapshot.session = { open: '10:00:00', close: '16:30:00' };
  const entry = [bar(date, '163000', 100, 100, 100)];
  const next = [...morning(102, 103, 101).map((item) => ({ ...item, time: String(Number(item.time) + 10000) })), bar(nextDate, '103000', 103, 104, 102)];
  const result = evaluateClosingCandidate(snapshot, candidate, entry, next, nextDate, 25, { open: '10:00:00', close: '15:30:00' });
  assert.equal(result.status, 'SIMULATED');
  assert.equal(result.close, 100);
  assert.equal(result.exit, 103);
  assert.equal(result.exitReason, 'TIME_STOP_FIRST_OPEN_AT_OR_AFTER_1030');
  assert.ok(Math.abs(result.benchmarkReturnPct - 2) < 1e-10);
});
