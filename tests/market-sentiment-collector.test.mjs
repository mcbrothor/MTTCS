import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePutCallVolumeRatio,
  getKisKospiIndexHistory,
  getKisKospiPutCallRatio,
  parseKisIndexRows,
} from '../lib/market-sentiment/collector.ts';

test('KIS index rows are sorted, deduplicated, and invalid closes are rejected', () => {
  assert.deepEqual(parseKisIndexRows([
    { stck_bsop_date: '20260819', bstp_nmix_prpr: '6,471.17' },
    { stck_bsop_date: '20260818', bstp_nmix_prpr: '6400' },
    { stck_bsop_date: '20260819', bstp_nmix_prpr: '6472' },
    { stck_bsop_date: 'bad', bstp_nmix_prpr: '1' },
  ]), [
    { tradeDate: '2026-08-18', indexClose: 6400 },
    { tradeDate: '2026-08-19', indexClose: 6472 },
  ]);
});

test('Put/Call ratio uses actual option-board volumes', () => {
  assert.equal(calculatePutCallVolumeRatio([{ acml_vol: '1,000' }, { acml_vol: '500' }], [{ acml_vol: '750' }]), 0.5);
  assert.equal(calculatePutCallVolumeRatio([{ acml_vol: '0' }], [{ acml_vol: '10' }]), null);
});

test('KIS option collector resolves the nearest expiry and keeps call/put sides separate', async () => {
  const calls = [];
  const result = await getKisKospiPutCallRatio(async (input) => {
    calls.push(input);
    return input.trId === 'FHPIO056104C0'
      ? { output: [{ mtrt_yymm: '202609' }] }
      : { output1: [{ acml_vol: '100' }], output2: [{ acml_vol: '120' }] };
  });
  assert.deepEqual(result, { expiry: '202609', ratio: 1.2 });
  assert.equal(calls[1].params.FID_MRKT_CLS_CODE, 'CO');
  assert.equal(calls[1].params.FID_MRKT_CLS_CODE1, 'PO');
});

test('KIS index collector paginates backward until the target history is filled', async () => {
  let requestCount = 0;
  const result = await getKisKospiIndexHistory({
    targetBars: 126,
    endDate: '2026-08-20',
    request: async () => {
      const page = requestCount++;
      return { output2: Array.from({ length: 50 }, (_, index) => {
        const date = new Date(Date.UTC(2026, 7, 19 - page * 50 - index));
        return { stck_bsop_date: date.toISOString().slice(0, 10).replaceAll('-', ''), bstp_nmix_prpr: String(6000 - page * 50 - index) };
      }) };
    },
  });
  assert.equal(result.length, 126);
  assert.equal(requestCount, 3);
  assert.ok(result[0].tradeDate < result.at(-1).tradeDate);
});
