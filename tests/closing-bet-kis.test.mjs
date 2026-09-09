import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

process.env.NEXT_PHASE = 'phase-production-build';
const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { createClosingKisClient, closingKisRequest } = jiti('../lib/closing-bet/kis.ts');
const now = () => new Date('2026-09-05T03:00:00Z');
const minute = (time, amount, extra = {}) => ({ stck_bsop_date: '20260904', stck_cntg_hour: time, stck_oprc: '100', stck_hgpr: '110', stck_lwpr: '90', stck_prpr: '100', cntg_vol: '10', acml_tr_pbmn: String(amount), ...extra });
const daily = (date, extra = {}) => ({ stck_bsop_date: date, stck_oprc: '100', stck_hgpr: '110', stck_lwpr: '90', stck_clpr: '100', acml_vol: '100', acml_tr_pbmn: '10000', ...extra });

{
  let calls = 0;
  const client = createClosingKisClient({ now, request: async () => {
    if (++calls === 1) throw new Error('CLOSING_KIS_REQUEST_FAILED');
    return { output: [{ bass_dt: '20260904', opnd_yn: 'Y' }] };
  } });
  assert.equal((await client.getClosingSession('2026-09-04')).isOpen, true);
  assert.equal(calls, 2, '일시적인 조회 실패만 한 번 재시도한다');
  calls = 0;
  const failed = createClosingKisClient({ now, request: async () => { calls++; throw new Error('CLOSING_KIS_PROVIDER_ERROR'); } });
  await assert.rejects(failed.getClosingSession('2026-09-04'), /PROVIDER_ERROR/);
  assert.equal(calls, 1, '확정된 업무 오류는 반복 요청하지 않는다');
}

// KIS omits minutes without trades when fake ticks are disabled. Valid cumulative differences remain actual turnover.
{
  const client = createClosingKisClient({ now, request: async () => ({ output2: [
    minute('090000', 1000), minute('090200', 2000), minute('090500', 3000),
  ] }) });
  const result = await client.getClosingMinutes('041960', '2026-09-04', '09:06:00');
  assert.deepEqual(result.map((bar) => bar.turnover), [1000, 1000, 1000]);
}

// Historical output1 belongs to today. Only dated output2 rows may enter the bars.
{
  const requests = [];
  const client = createClosingKisClient({ now, request: async (endpoint, tr, params) => {
    requests.push({ endpoint, tr, params });
    return { output1: { acml_vol: '99999999999', stck_prpr: '999999' }, output2: [
      minute('091200', 13000), minute('091100', 12000), minute('091000', 11000),
      minute('091000', 11000), minute('090900', 10000),
      minute('091000', 50000, { stck_bsop_date: '20260905' }),
    ] };
  } });
  const result = await client.getClosingMinutes('005930', '2026-09-04', '09:11:00');
  assert.deepEqual(result.map((bar) => bar.time), ['09:09:00', '09:10:00']);
  assert.equal(result[0].turnover, null, 'partial history cannot invent an initial cumulative baseline');
  assert.equal(result[1].turnover, 1000);
  assert.equal(result[1].volume, 10);
  assert.ok(result.every((bar) => bar.close === 100 && bar.date === '2026-09-04'));
  assert.equal(requests[1].params.FID_INPUT_HOUR_1, '090800', 'pagination moves one minute before the oldest returned bar');
  assert.ok(requests.every((r) => r.params.FID_COND_MRKT_DIV_CODE === 'J'));
}

// A full session starts with the opening cumulative amount, including a valid closing minute when requested.
{
  const client = createClosingKisClient({ now, request: async () => ({ output2: [
    minute('090000', 1000), minute('090100', 2000), minute('090200', 2000, { cntg_vol: '0' }),
    minute('152900', 5000), minute('153000', 6000), minute('153100', 7000),
  ] }) });
  const result = await client.getClosingMinutes('005930', '2026-09-04', '15:32:00');
  assert.deepEqual(result.map((bar) => bar.time), ['09:00:00', '09:01:00', '09:02:00', '15:29:00', '15:30:00']);
  assert.deepEqual(result.map((bar) => bar.turnover), [1000, 1000, 0, null, 1000]);
}

// Decreasing cumulative money, impossible amounts, and missing volume never become usable turnover.
{
  const client = createClosingKisClient({ now, request: async () => ({ output2: [
    minute('090000', 1000), minute('090100', 500), minute('090200', 900000),
    minute('090300', 901000, { cntg_vol: '' }), minute('090400', 902000),
  ] }) });
  const result = await client.getClosingMinutes('005930', '2026-09-04', '09:06:00');
  assert.deepEqual(result.map((bar) => bar.turnover), [1000, null, null, null]);
  assert.equal(result.some((bar) => bar.time === '09:03:00'), false);
}

// A live caller cannot request an unfinished minute merely by supplying a later cutoff.
{
  const client = createClosingKisClient({ now: () => new Date('2026-09-04T00:01:30Z'), request: async () => ({ output2: [minute('090000', 1000), minute('090100', 2000)] }) });
  assert.deepEqual((await client.getClosingMinutes('005930', '2026-09-04', '15:18:00')).map((bar) => bar.time), ['09:00:00']);
}

// Daily history uses only dates at or before the requested end, including zero actual turnover.
{
  const params = [];
  const client = createClosingKisClient({ now, request: async (_endpoint, _tr, input) => {
    params.push(input);
    return { output1: { acml_tr_pbmn: '99999999999999' }, output2: [daily('20260905'), daily('20260904'), daily('20260903', { acml_tr_pbmn: '0' })] };
  } });
  const result = await client.getClosingDaily('005930', '2026-09-04', 2);
  assert.deepEqual(result.map((bar) => bar.date), ['2026-09-03', '2026-09-04']);
  assert.deepEqual(result.map((bar) => bar.turnover), [0, 10000]);
  assert.equal(params[0].FID_INPUT_DATE_2, '20260904');
  assert.equal(params[0].FID_ORG_ADJ_PRC, '1', 'raw prices preserve contemporaneous turnover units');
}

// Current quote enrichments preserve unknown status instead of assuming a safe security.
{
  const current = { stck_prpr: '100', stck_oprc: '95', stck_hgpr: '102', stck_lwpr: '94', prdy_vrss: '5', prdy_vrss_sign: '5', acml_vol: '1000', acml_tr_pbmn: '98000', bstp_kor_isnm: '반도체', temp_stop_yn: 'N', mrkt_warn_cls_code: '02', short_over_yn: 'N', sltr_yn: 'N', mang_issu_cls_code: 'N' };
  const client = createClosingKisClient({ now, request: async () => ({ output: current }) });
  const result = await client.getClosingQuote('005930');
  assert.equal(result.previousClose, 105);
  assert.equal(result.statusKnown, true);
  assert.deepEqual(result.blockedReasons, ['시장경고']);
  assert.equal(result.ask, null);
  delete current.mang_issu_cls_code;
  assert.equal((await client.getClosingQuote('005930')).statusKnown, false);
  current.acml_vol = '';
  await assert.rejects(() => client.getClosingQuote('005930'), /CLOSING_KIS_QUOTE_INVALID/);
}

// An unavailable strength endpoint does not turn a valid orderbook into an invented strength.
{
  const client = createClosingKisClient({ now, request: async (endpoint) => {
    if (endpoint.endsWith('inquire-ccnl')) throw new Error('network secret-token');
    return { output1: { askp1: '101', bidp1: '100', askp_rsqn1: '30', bidp_rsqn1: '20' }, output2: { antc_cnpr: '102' } };
  } });
  assert.deepEqual(await client.getClosingOrderbook('005930'), { ask: 101, bid: 100, askVolume: 30, bidVolume: 20, expectedPrice: 102, executionStrength: null });
  const failed = createClosingKisClient({ request: async () => { throw new Error('authorization Bearer secret'); } });
  await assert.rejects(() => failed.getClosingOrderbook('005930'), { message: 'CLOSING_KIS_REQUEST_FAILED' });
}

// Replay never requests today's estimate, and same-day finalized investor rows are excluded.
{
  const calls = [];
  const client = createClosingKisClient({ now, request: async (endpoint) => {
    calls.push(endpoint);
    return { output: [
      { stck_bsop_date: '20260904', frgn_ntby_qty: '999999', orgn_ntby_qty: '888888' },
      { stck_bsop_date: '20260903', frgn_ntby_qty: '20', orgn_ntby_qty: '' },
    ] };
  } });
  const result = await client.getClosingFlow('005930', '2026-09-04', '2026-09-04T15:18:00+09:00');
  assert.equal(result.kind, 'PREVIOUS_CONFIRMED');
  assert.equal(result.foreignNet, 20);
  assert.equal(result.institutionNet, null);
  assert.equal(result.unit, 'SHARES');
  assert.ok(calls.every((endpoint) => endpoint.endsWith('inquire-investor')));
}

// Estimate clock/date must actually be supplied; a schedule bucket cannot pretend to be an exact observation.
{
  const client = createClosingKisClient({ now: () => new Date('2026-09-04T06:18:00Z'), request: async (endpoint) => endpoint.endsWith('investor-trend-estimate') ? { output2: [{ bsop_hour_gb: '4', frgn_fake_ntby_qty: '300', orgn_fake_ntby_qty: '200' }] } : { output: [] } });
  assert.equal((await client.getClosingFlow('005930', '2026-09-04', '2026-09-04T15:18:00+09:00')).kind, 'MISSING');
  const dated = createClosingKisClient({ now: () => new Date('2026-09-04T06:18:00Z'), request: async () => ({ output2: [
    { stck_bsop_date: '20260904', bsop_hour_gb: '143000', frgn_fake_ntby_qty: '0', orgn_fake_ntby_qty: '200' },
    { stck_bsop_date: '20260904', bsop_hour_gb: '153000', frgn_fake_ntby_qty: '9999', orgn_fake_ntby_qty: '9999' },
  ] }) });
  const result = await dated.getClosingFlow('005930', '2026-09-04', '2026-09-04T15:18:00+09:00');
  assert.equal(result.kind, 'ESTIMATE');
  assert.equal(result.foreignNet, 0);
  assert.equal(result.venue, 'UNKNOWN');
}

// Holiday replies are cached for the trading date and may contain more than the requested day.
{
  let calls = 0;
  const client = createClosingKisClient({ now, request: async () => { calls++; return { output: [{ bass_dt: '20260904', opnd_yn: 'Y' }, { bass_dt: '20260905', opnd_yn: 'N' }] }; } });
  assert.equal((await client.getClosingSession('2026-09-04')).isOpen, true);
  assert.equal((await client.getClosingSession('2026-09-05')).isOpen, false);
  assert.equal(calls, 1);
  await assert.rejects(() => client.getClosingSession('2026-09-06'), /CLOSING_KIS_SESSION_UNAVAILABLE/);
  const override = createClosingKisClient({ now, sessionOverrides: () => JSON.stringify({ '2026-09-04': { isOpen: true, open: '10:00:00', close: '16:30:00' } }), request: async () => { throw new Error('must not fetch'); } });
  assert.deepEqual(await override.getClosingSession('2026-09-04'), { isOpen: true, open: '10:00:00', close: '16:30:00' });
  const invalid = createClosingKisClient({ sessionOverrides: () => '{' });
  await assert.rejects(() => invalid.getClosingSession('2026-09-04'), /CLOSING_KIS_INVALID_SESSION_OVERRIDE/);
}

// Invalid inputs fail before requesting remote data.
{
  const client = createClosingKisClient({ now, request: async () => { throw new Error('must not fetch'); } });
  await assert.rejects(() => client.getClosingMinutes('005930', '2026-02-30'), /INVALID_DATE/);
  await assert.rejects(() => client.getClosingMinutes('005930', '2026-09-06'), /FUTURE_DATE/);
  await assert.rejects(() => client.getClosingMinutes('005930', '2026-09-04', '25:00:00'), /INVALID_TIME/);
  await assert.rejects(() => client.getClosingDaily('005930', '2026-09-04', 0), /INVALID_COUNT/);
  await assert.rejects(() => closingKisRequest('/oauth2/tokenP', 'ABC', {}), /INVALID_REQUEST/);
}

console.log('closing-bet-kis: all boundary and point-in-time checks passed');

// Opening performance must use exact, venue-specific, traded minute closes.
{
  const requests = [];
  const client = createClosingKisClient({ now, request: async (endpoint, tr, params) => {
    requests.push(params);
    return { output1: { stck_prpr: '999999' }, output2: [
      minute('080400', 1000), minute('080500', 2000),
      minute('080500', 3000, { stck_bsop_date: '20260903' }),
    ] };
  } });
  const point = await client.getClosingPricePoint('000810', '2026-09-04', '08:05:00', 'NXT');
  assert.equal(point.venue, 'NXT');
  assert.equal(point.bar.time, '08:05:00');
  assert.equal(point.bar.close, 100);
  assert.equal(requests[0].FID_COND_MRKT_DIV_CODE, 'NX');
  assert.equal(requests[0].FID_INPUT_HOUR_1, '080600');
  assert.equal(requests[0].FID_FAKE_TICK_INCU_YN, 'N');
  await client.getClosingPricePoint('000810', '2026-09-04', '09:05:00', 'KRX');
  assert.equal(requests[1].FID_COND_MRKT_DIV_CODE, 'J');
  const missing = createClosingKisClient({ now, request: async () => ({ output2: [minute('080400', 1000), minute('080500', 2000, { cntg_vol: '0' })] }) });
  assert.equal((await missing.getClosingPricePoint('000810', '2026-09-04', '08:05:00', 'NXT')).bar, null);
  const pending = createClosingKisClient({ now: () => new Date('2026-09-04T08:05:59+09:00'), request: async () => { throw new Error('must not request an incomplete bar'); } });
  assert.equal((await pending.getClosingPricePoint('000810', '2026-09-04', '08:05:00', 'NXT')).bar, null);
}
