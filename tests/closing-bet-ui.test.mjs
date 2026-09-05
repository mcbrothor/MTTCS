import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { jsx: { runtime: 'automatic' } });
const { selectClosingSnapshots, displayedClosingCandidates } = jiti('../components/closing-bet/view-model.ts');
const { ClosingMarketPanel, ClosingEvaluationPanel, fetchClosingDashboard } = jiti('../components/closing-bet/ClosingBetDashboard.tsx');

const candidate = {
  ticker: '005930', name: '테스트 종목', market: 'KOSPI200', rank: 1, score: 80,
  scores: { late: 20, liquidity: 15, chart: 15, flow: 10, catalyst: 5, execution: 10, character: 5 },
  status: 'ACTIONABLE', quality: 'FULL', sector: '테스트 업종', reasons: ['LATE_STRENGTH_HELD'], exclusions: [], warnings: ['SAME_TIME_RVOL_MISSING_NO_SCORE'],
  metrics: { price: 10000, changePct: 3.5, turnover: 60_000_000_000, vwap: 9900, rangePosition: 0.95, lateReturnPct: 2, relativeLateReturnPct: 1, rvol: null, dailyVolumeRatio: 1.5, ma20: 9500, ma60: 9000, atr14: 200, breakout: 9900, spreadBps: 10 },
  flow: { foreignNet: 1000, institutionNet: null, unit: 'SHARES', asOf: '2026-09-04T06:15:00Z', kind: 'ESTIMATE', venue: 'KRX' },
  evidence: [{ title: '확인된 재료', url: 'https://example.com/evidence', availableAt: '2026-09-04T06:00:00Z', kind: 'CATALYST' }, { title: '잘못된 링크', url: 'javascript:alert(1)', availableAt: '2026-09-04T06:00:00Z', kind: 'RISK' }],
  plan: { entryLow: 9900, entryMax: 10050, invalidation: 9800, target: 10300, exitRule: '익일 09:30까지 청산', expiresAt: '2026-09-04T06:28:00Z' }, chart: [],
};
const snapshot = {
  id: 'snapshot-live', modelVersion: 'test', tradeDate: '2026-09-04', asOf: '2026-09-04T06:18:00Z', createdAt: '2026-09-04T06:19:00Z', market: 'KOSPI200', mode: 'LIVE', phase: 'FINAL', venue: 'KRX', status: 'READY', regime: 'GREEN', benchmarkLateReturnPct: 0.5,
  universe: { name: '코스피 시가총액 상위 200', observedAt: '2026-09-04T00:00:00Z', count: 200, expectedCount: 200, historicalMembership: false },
  coverage: { collected: 195, total: 200, failed: 5 }, picks: [candidate], reviewCandidates: [], candidates: [candidate], warnings: [],
};
const replay = { ...snapshot, id: 'snapshot-replay', mode: 'REPLAY', picks: [{ ...candidate, name: '실전 목록에만 있는 종목' }], reviewCandidates: [{ ...candidate, name: '과거 검토 후보' }] };

const replayHtml = renderToStaticMarkup(createElement(ClosingMarketPanel, { market: 'KOSPI200', snapshot: replay, mode: 'REPLAY' }));
assert.match(replayHtml, /과거 검토 후보/);
assert.doesNotMatch(replayHtml, /실전 목록에만 있는 종목|조건부 추천/);
assert.equal((replayHtml.match(/미선정/g) || []).length, 4);
assert.match(replayHtml, /장중 가집계/);
assert.match(replayHtml, /15:15/);
assert.match(replayHtml, /97.5%/);
assert.match(replayHtml, /장 후반 가격 강도 유지/);
assert.match(replayHtml, /동시간 상대 거래량 미확인/);
assert.doesNotMatch(replayHtml, /LATE_STRENGTH_HELD|SAME_TIME_RVOL_MISSING_NO_SCORE/);
assert.match(replayHtml, /https:\/\/example.com\/evidence/);
assert.doesNotMatch(replayHtml, /href="javascript:/);

const watchHtml = renderToStaticMarkup(createElement(ClosingMarketPanel, { market: 'KOSPI200', mode: 'LIVE', snapshot: { ...snapshot, phase: 'WATCH', picks: [], reviewCandidates: [candidate] } }));
assert.match(watchHtml, /테스트 종목/);
assert.match(watchHtml, /예비 관찰 · 정식 추천 아님/);
assert.doesNotMatch(watchHtml, /조건부 추천/);

const emptyHtml = renderToStaticMarkup(createElement(ClosingMarketPanel, { market: 'KOSDAQ150', mode: 'LIVE' }));
assert.match(emptyHtml, /실전 결과가 없습니다/);
assert.equal((emptyHtml.match(/미선정/g) || []).length, 5);
assert.doesNotMatch(emptyHtml, /테스트 종목|10000/);

const selected = selectClosingSnapshots([
  { ...snapshot, id: 'old-kosdaq', tradeDate: '2026-09-03', market: 'KOSDAQ150' },
  { ...snapshot, id: 'early', asOf: '2026-09-04T05:30:00Z' },
  snapshot,
  { ...replay, tradeDate: '2026-09-05' },
], 'LIVE');
assert.equal(selected.tradeDate, '2026-09-04');
assert.equal(selected.latest.get('KOSPI200').id, 'snapshot-live');
assert.equal(selected.latest.has('KOSDAQ150'), false, '다른 거래일의 코스닥 결과를 섞지 않는다.');
assert.equal(displayedClosingCandidates({ ...snapshot, picks: Array.from({ length: 8 }, (_, index) => ({ ...candidate, ticker: String(index), rank: index + 1 })) }).length, 5);
const orderedReview = [{ ...candidate, ticker: '267250', rank: null, score: 46, status: 'WATCH' }, { ...candidate, ticker: '042700', rank: null, score: 54, status: 'EXCLUDED' }];
assert.deepEqual(displayedClosingCandidates({ ...replay, reviewCandidates: orderedReview }).map((item) => item.ticker), ['267250', '042700'], '웹은 텔레그램과 같은 검토 순위를 유지하고 점수순으로 다시 정렬하지 않는다');
assert.deepEqual(displayedClosingCandidates({ ...snapshot, phase: 'WATCH', reviewCandidates: orderedReview }).map((item) => item.ticker), ['267250', '042700']);

const evaluation = { snapshotId: snapshot.id, ticker: candidate.ticker, market: 'KOSPI200', tradeDate: snapshot.tradeDate, nextTradeDate: '2026-09-07', status: 'NO_ENTRY', close: 10000, entry: 9999, exit: 12345, exitReason: null, benchmarkReturnPct: 0, netReturnPct: 23.46, maePct: 0, mfePct: 24, costBps: 25, warnings: [] };
const evaluationHtml = renderToStaticMarkup(createElement(ClosingEvaluationPanel, { snapshots: [snapshot], evaluations: [evaluation, { ...evaluation, snapshotId: 'unrelated', ticker: '노출하면안됨' }] }));
assert.match(evaluationHtml, /실제 주문이나 계좌 체결 결과를 의미하지 않습니다/);
assert.match(evaluationHtml, /진입 조건 미충족/);
assert.doesNotMatch(evaluationHtml, /23.46%|12,345원|노출하면안됨/);

const response = (snapshots = [], dates = []) => new Response(JSON.stringify({ data: { snapshots, evaluations: [], dates }, meta: {} }), { status: 200 });
const requests = [];
const autoResult = await fetchClosingDashboard({ date: '', mode: 'AUTO', fetcher: async (url) => { requests.push(url); return requests.length === 1 ? response([], ['2026-09-04']) : response([replay], ['2026-09-03']); } });
assert.deepEqual(requests, ['/api/closing-bet?mode=LIVE', '/api/closing-bet?mode=REPLAY']);
assert.equal(autoResult.mode, 'REPLAY');
assert.equal(autoResult.fallback, true);

let liveRequests = 0;
const liveResult = await fetchClosingDashboard({ date: '2026-09-04', mode: 'AUTO', fetcher: async (url) => { liveRequests += 1; assert.equal(url, '/api/closing-bet?mode=LIVE&date=2026-09-04'); return response([snapshot]); } });
assert.equal(liveRequests, 1);
assert.equal(liveResult.mode, 'LIVE');

let explicitLiveRequests = 0;
const emptyResult = await fetchClosingDashboard({ date: '', mode: 'LIVE', fetcher: async () => { explicitLiveRequests += 1; return response(); } });
assert.equal(explicitLiveRequests, 1, '사용자가 직접 선택한 실전 탭은 과거 재현으로 전환하지 않는다.');
assert.equal(emptyResult.mode, 'LIVE');
await assert.rejects(fetchClosingDashboard({ date: '', mode: 'AUTO', fetcher: async () => new Response(JSON.stringify({ message: '수집 상태 조회 실패' }), { status: 503 }) }), /수집 상태 조회 실패/);
await assert.rejects(fetchClosingDashboard({ date: '', mode: 'LIVE', fetcher: async () => new Response(JSON.stringify({ data: null }), { status: 200 }) }), /응답 형식/);

console.log('closing bet UI contract tests passed');
