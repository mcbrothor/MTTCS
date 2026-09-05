import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { ClosingRepository } = jiti('../lib/closing-bet/repository.ts');
const { CLOSING_OPENING_POLICY } = jiti('../lib/closing-bet/config.ts');
const { deliverClosingText, formatClosingTelegram, sendClosingSnapshot } = jiti('../lib/closing-bet/telegram.ts');

process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_ALLOWED_CHAT_IDS = 'test-chat';
const originalFetch = globalThis.fetch;
const snapshot = { id: 'sample', phase: 'FINAL', mode: 'REPLAY', tradeDate: '2026-09-03', market: 'KOSPI200', asOf: '2026-09-03T15:18:00+09:00',
  universe: { count: 200 }, coverage: { collected: 200, total: 200 }, regime: 'GREEN', picks: [], reviewCandidates: [] };
const candidate = { ticker: '000810', name: '삼성화재', market: 'KOSPI200', rank: 1, score: 90, status: 'WATCH', exclusions: [], warnings: [],
  metrics: { price: 701000, turnover: 100_000_000_000, rangePosition: 0.9, lateReturnPct: 1.2, rvol: 1.4 },
  flow: { kind: 'MISSING' }, plan: { entryLow: 690000, entryMax: 704000, invalidation: 680000, target: 725000 } };
const evaluation = { snapshotId: 'sample', ticker: '000810', market: 'KOSPI200', tradeDate: '2026-09-03', nextTradeDate: '2026-09-04', status: 'MEASURED', close: 701000, entry: null, exit: null, exitReason: null, benchmarkReturnPct: null, netReturnPct: null, maePct: null, mfePct: null, costBps: 25, warnings: [],
  opening: { version: CLOSING_OPENING_POLICY.version, basisPrice: 701000, basis: null, measuredAt: '2026-09-04T00:06:00Z',
    nxt: { venue: 'NXT', time: '08:05:00', status: 'AVAILABLE', price: 697000, returnPct: -0.5706134094151208, netReturnPct: -0.8206134094151208, point: null, warnings: [] },
    krx: { venue: 'KRX', time: '09:05:00', status: 'AVAILABLE', price: 666000, returnPct: -4.99286733238231, netReturnPct: -5.24286733238231, point: null, warnings: [] } } };
class DeliveryClient {
  rows = new Map();
  failReceipt = false;
  writes = 0;
  from = () => {
    const keyOf = (row) => [row.snapshot_id, row.chat_hash, row.kind, row.chunk].join(':');
    return {
      insert: async (row) => {
        this.writes++;
        const key = keyOf(row);
        if (this.rows.has(key)) return { error: { code: '23505' } };
        this.rows.set(key, { ...row }); return { error: null };
      },
      update: (change) => {
        let key; let status;
        const run = () => {
          this.writes++;
          if (this.failReceipt && change.status === 'SENT') return { error: { code: 'TEST_FAIL' }, data: [] };
          const row = this.rows.get(key);
          if (!row || (status && row.status !== status)) return { error: null, data: [] };
          Object.assign(row, change); return { error: null, data: [row] };
        };
        const builder = { match(value) { key = keyOf(value); return builder; }, eq(_, value) { status = value; return builder; },
          async select() { return run(); }, then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); } };
        return builder;
      },
    };
  };
}
let calls = 0;
const success = async () => { calls++; return new Response(JSON.stringify({ ok: true, result: { message_id: calls } })); };
try {
  {
    const db = new DeliveryClient(); globalThis.fetch = success;
    const result = await deliverClosingText(new ClosingRepository(db), snapshot, '검토', 'REVIEW', true);
    assert.equal(result.preview, '검토'); assert.equal(db.writes, 0); assert.equal(calls, 0);
  }
  {
    const db = new DeliveryClient(); const repo = new ClosingRepository(db); globalThis.fetch = success;
    assert.equal((await deliverClosingText(repo, snapshot, '검토', 'REVIEW', false)).sent, 1);
    const before = calls;
    assert.equal((await deliverClosingText(repo, snapshot, '검토', 'REVIEW', false)).skipped, 1);
    assert.equal(calls, before, '성공한 발송은 재실행해도 중복 전송하지 않는다');
  }
  {
    const db = new DeliveryClient(); const repo = new ClosingRepository(db);
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error_code: 429 }), { status: 429 });
    assert.equal((await deliverClosingText(repo, snapshot, '검토', 'REVIEW', false)).failed, 1);
    globalThis.fetch = success;
    assert.equal((await deliverClosingText(repo, snapshot, '검토', 'REVIEW', false)).sent, 1, '확정 실패는 재시도할 수 있다');
  }
  {
    const db = new DeliveryClient(); const repo = new ClosingRepository(db);
    globalThis.fetch = async () => { throw new Error('network uncertain'); };
    await deliverClosingText(repo, snapshot, '검토', 'REVIEW', false);
    assert.equal([...db.rows.values()][0].status, 'UNCERTAIN');
    globalThis.fetch = success; const before = calls;
    await deliverClosingText(repo, snapshot, '검토', 'REVIEW', false);
    assert.equal(calls, before, '응답 유실을 실패로 간주해 중복 전송하지 않는다');
  }
  {
    const db = new DeliveryClient(); db.failReceipt = true; const repo = new ClosingRepository(db); globalThis.fetch = success;
    await deliverClosingText(repo, snapshot, '검토', 'REVIEW', false);
    assert.equal([...db.rows.values()][0].status, 'UNCERTAIN');
    const before = calls; await deliverClosingText(repo, snapshot, '검토', 'REVIEW', false);
    assert.equal(calls, before, '전송 성공 후 DB 장애에서도 중복 전송하지 않는다');
  }
  {
    const text = formatClosingTelegram({ ...snapshot, reviewCandidates: [candidate] }, [evaluation]);
    assert.match(text, /과거 재현.*검토용/); assert.match(text, /현재 매수 추천 아님/);
    assert.match(text, /2026-09-03/); assert.match(text, /KOSPI200/); assert.match(text, /mode=REPLAY/);
    assert.match(text, /NXT 08:05 697,000원 -0.57%/);
    assert.match(text, /KRX 09:05 666,000원 -4.99%/);
    await assert.rejects(sendClosingSnapshot(new ClosingRepository(new DeliveryClient()), { ...snapshot, mode: 'LIVE' }, [], false), /유효시간/);
  }
} finally { globalThis.fetch = originalFetch; }
console.log('closing bet telegram delivery tests passed');
