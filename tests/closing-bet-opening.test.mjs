import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const { evaluateOpeningPerformance } = jiti('../lib/closing-bet/opening-performance.ts');
const candidate = { ticker: '000810', market: 'KOSPI200', status: 'EXCLUDED' };
const snapshot = { id: 'past', tradeDate: '2026-09-03', market: 'KOSPI200', mode: 'REPLAY', candidates: [candidate], session: { open: '09:00:00', close: '15:30:00' } };
const point = (venue, date, time, close) => ({ venue, date, time, bar: { date, time, close, open: close, high: close, low: close, volume: 1, turnover: null } });
const input = { nextTradeDate: '2026-09-04', now: new Date('2026-09-05T00:00:00Z'),
  basis: point('KRX', '2026-09-03', '15:30:00', 100), nxt: point('NXT', '2026-09-04', '08:05:00', 110), krx: point('KRX', '2026-09-04', '09:05:00', 95) };
const evaluate = (changes = {}) => evaluateOpeningPerformance(snapshot, candidate, { ...input, ...changes });
let result = evaluate();
assert.equal(result.status, 'MEASURED');
assert.equal(result.opening.nxt.price, 110);
assert.ok(Math.abs(result.opening.nxt.returnPct - 10) < 1e-9);
assert.ok(Math.abs(result.opening.krx.returnPct + 5) < 1e-9);
assert.ok(Math.abs(result.opening.nxt.netReturnPct - 9.75) < 1e-9);
assert.equal(result.opening.basisPrice, 100, '추천 시점 가격이 아니라 당일 KRX 종가를 기준으로 한다');
assert.equal(result.exit, null, '서로 다른 시장의 청산가를 단일 성과로 합치지 않는다');
assert.equal(result.opening.nxt.status, 'AVAILABLE', '과거 검토 후보도 진입 범위·손절 가정 없이 가격 성과를 보여준다');
result = evaluate({ nxt: { ...input.nxt, bar: null } });
assert.equal(result.opening.nxt.status, 'DATA_MISSING');
assert.equal(result.opening.nxt.returnPct, null);
assert.equal(result.opening.krx.status, 'AVAILABLE', 'NXT 누락이 KRX 성과를 차단하지 않는다');
for (const nxt of [input.krx, point('NXT', '2026-09-03', '08:05:00', 110), point('NXT', '2026-09-04', '08:04:00', 110), { ...input.nxt, bar: { ...input.nxt.bar, volume: 0 } }]) {
  assert.equal(evaluate({ nxt }).opening.nxt.price, null, '거래소·날짜·정확한 시각·실거래 여부를 확인한다');
}
result = evaluate({ now: new Date('2026-09-04T00:05:59+09:00') });
assert.equal(result.opening.nxt.status, 'PENDING');
assert.equal(result.opening.krx.status, 'PENDING');
result = evaluate({ now: new Date('2026-09-04T08:06:00+09:00') });
assert.equal(result.opening.nxt.status, 'AVAILABLE');
assert.equal(result.opening.krx.status, 'PENDING');
result = evaluate({ basis: { ...input.basis, bar: null } });
assert.equal(result.opening.krx.price, 95);
assert.equal(result.opening.krx.returnPct, null, '매수가가 없으면 수익률을 만들지 않는다');
assert.equal(result.opening.krx.status, 'DATA_MISSING');
assert.equal(evaluate({ nextTradeDate: '2026-09-03' }).opening.nxt.status, 'DATA_MISSING');
assert.equal(evaluate({ nextSession: { open: '10:00:00', close: '16:30:00' } }).opening.krx.status, 'NOT_APPLICABLE');
console.log('closing opening performance tests passed');
