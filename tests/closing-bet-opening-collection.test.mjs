import assert from 'node:assert/strict';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url);
const { collectOpeningEvaluations } = jiti('../lib/closing-bet/opening-collection.ts');
const { CLOSING_OPENING_POLICY } = jiti('../lib/closing-bet/config.ts');

const candidate = { ticker: '000810', name: '삼성화재', market: 'KOSPI200', status: 'WATCH' };
const snapshot = {
  id: 'snap-20260903-kospi', tradeDate: '2026-09-03', market: 'KOSPI200', mode: 'REPLAY', phase: 'FINAL',
  session: { open: '09:00:00', close: '15:30:00' }, picks: [], reviewCandidates: [candidate], candidates: [candidate],
};
const point = (venue, date, time, close) => ({ venue, date, time, bar: { date, time, open: close, high: close, low: close, close, volume: 10, turnover: null } });

class Repo {
  saved = [];
  cached = new Map();
  constructor(evaluations = []) { this.rows = evaluations; }
  async evaluations() { return this.rows; }
  async cache(key) { return this.cached.get(key) ?? null; }
  async putCache(key, payload) { this.cached.set(key, { payload }); }
  async saveEvaluations(rows) { this.saved = rows; }
}

{
  const calls = [];
  const repo = new Repo();
  const rows = await collectOpeningEvaluations(snapshot, {
    repo, dryRun: false, now: new Date('2026-09-05T00:00:00+09:00'), next: { date: '2026-09-04', open: '09:00:00', close: '15:30:00' },
    readPoint: async (ticker, date, time, venue) => { calls.push([ticker, date, time, venue]); return point(venue, date, time, venue === 'KRX' && date === '2026-09-03' ? 701000 : venue === 'NXT' ? 697000 : 666000); },
  });
  assert.equal(calls.length, 3, '추천일 KRX 종가, 익일 NXT 08:05, 익일 KRX 09:05를 각각 읽는다');
  assert.equal(rows[0].status, 'MEASURED');
  assert.equal(rows[0].opening.basisPrice, 701000);
  assert.equal(rows[0].opening.nxt.price, 697000);
  assert.equal(rows[0].opening.krx.price, 666000);
  assert.equal(repo.saved.length, 1, 'write 모드에서는 새 평가를 저장한다');
}

{
  const oldOpening = { version: CLOSING_OPENING_POLICY.version, basisPrice: 100, basis: point('KRX', '2026-09-03', '15:30:00', 100), measuredAt: 'old',
    nxt: { venue: 'NXT', time: '08:05:00', status: 'AVAILABLE', price: 110, returnPct: 10, netReturnPct: 9.75, point: point('NXT', '2026-09-04', '08:05:00', 110), warnings: [] },
    krx: { venue: 'KRX', time: '09:05:00', status: 'AVAILABLE', price: 95, returnPct: -5, netReturnPct: -5.25, point: point('KRX', '2026-09-04', '09:05:00', 95), warnings: [] } };
  const repo = new Repo([{ snapshotId: snapshot.id, ticker: candidate.ticker, nextTradeDate: '2026-09-04', opening: oldOpening }]);
  const rows = await collectOpeningEvaluations(snapshot, {
    repo, dryRun: true, now: new Date('2026-09-05T00:00:00+09:00'), next: { date: '2026-09-04', open: '09:00:00', close: '15:30:00' },
    readPoint: async () => { throw new Error('새 기준 평가가 있으면 KIS를 다시 호출하지 않는다'); },
  });
  assert.equal(rows[0].opening.nxt.price, 110);
  assert.equal(repo.saved.length, 0, 'dry-run에서는 저장하지 않는다');
}

console.log('closing opening collection tests passed');
