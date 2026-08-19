import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const flow = jiti('../lib/recommendations/kr-investor-flow.ts');

const parsed = flow.parseKisInvestorFlowRows({
  ticker: '005930',
  provider: 'KIS_INQUIRE_INVESTOR',
  observedAt: '2026-06-22T07:00:00.000Z',
  rows: [
    { stck_bsop_date: '20260618', frgn_ntby_qty: '-1,000', orgn_ntby_qty: '200', frgn_ntby_tr_pbmn: '-300', orgn_ntby_tr_pbmn: '50', acml_tr_pbmn: '10000', ignored: 'x' },
    { stck_bsop_date: '20260619', frgn_ntby_qty: '500', orgn_ntby_qty: '-100', frgn_ntby_tr_pbmn: '150', orgn_ntby_tr_pbmn: '-30', acml_tr_pbmn: '12000' },
    { stck_bsop_date: '20260622', frgn_ntby_qty: '2000', orgn_ntby_qty: '1000', frgn_ntby_tr_pbmn: '800', orgn_ntby_tr_pbmn: '400', acml_tr_pbmn: '18000' },
    { stck_bsop_date: '20260623', frgn_ntby_qty: '999', orgn_ntby_qty: '999', frgn_ntby_tr_pbmn: '999', orgn_ntby_tr_pbmn: '999', acml_tr_pbmn: '999' },
  ],
});

assert.equal(parsed[0].foreignNetBuyQty, -1000);
assert.deepEqual(Object.keys(parsed[0].rawJson).sort(), ['acml_tr_pbmn', 'frgn_ntby_qty', 'frgn_ntby_tr_pbmn', 'frgn_shnu_tr_pbmn', 'orgn_ntby_qty', 'orgn_ntby_tr_pbmn', 'orgn_shnu_tr_pbmn', 'prsn_shnu_tr_pbmn', 'stck_bsop_date', 'stck_clpr'].sort());

const derivedTurnover = flow.parseKisInvestorFlowRows({
  ticker: '005930',
  provider: 'KIS_INQUIRE_INVESTOR',
  rows: [{ stck_bsop_date: '20260622', prsn_shnu_tr_pbmn: '100', frgn_shnu_tr_pbmn: '200', orgn_shnu_tr_pbmn: '300' }],
});
assert.equal(derivedTurnover[0].turnoverAmountMkrw, 600);

const features = flow.buildKrInvestorFlowFeatures({
  ticker: '005930',
  asOfDate: '2026-06-22',
  rows: parsed,
  benchmarkTradeDates: ['2026-06-18', '2026-06-19', '2026-06-22'],
});
assert.equal(features.quality, 'FULL');
assert.equal(features.foreignNetBuyQty3d, 1500);
assert.equal(features.institutionNetBuyQty3d, 1100);
assert.equal(features.foreignNetBuyDays3d, 2);
assert.equal(features.institutionNetBuyDays3d, 2);
assert.equal(features.turnoverAmountMkrw5d, 40000);
assert.equal(features.combinedNetBuyRatio5d, 2.675);
assert.equal(features.latestTradeDate, '2026-06-22', 'future rows are blocked');

const stale = flow.buildKrInvestorFlowFeatures({
  ticker: '005930',
  asOfDate: '2026-06-22',
  rows: parsed.filter((row) => row.tradeDate <= '2026-06-18'),
  benchmarkTradeDates: ['2026-06-18', '2026-06-19', '2026-06-22'],
});
assert.equal(stale.quality, 'STALE');

const missing = flow.buildKrInvestorFlowFeatures({ ticker: '000660', asOfDate: '2026-06-22', rows: [] });
assert.equal(missing.quality, 'MISSING');
assert.equal(missing.combinedNetBuyRatio5d, null);

const observedLater = flow.buildKrInvestorFlowFeatures({
  ticker: '005930',
  asOfDate: '2026-06-22',
  recommendationAt: '2026-06-22T06:59:59.000Z',
  rows: parsed,
});
assert.equal(observedLater.quality, 'MISSING', 'rows observed after recommendation time are blocked');

{
  const calls = [];
  const client = {
    from(table) {
      assert.equal(table, 'kr_investor_flow_daily');
      return {
        async upsert(payload, options) {
          calls.push({ payload, options });
          return { error: null };
        },
      };
    },
  };
  await flow.upsertKrInvestorFlowDaily(client, parsed.slice(0, 1));
  await flow.upsertKrInvestorFlowDaily(client, parsed.slice(0, 1));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.onConflict, 'ticker,trade_date,provider');
  assert.deepEqual(calls[0].payload[0].raw_json, parsed[0].rawJson);
}

{
  const starts = [];
  const provider = {
    name: 'TEST',
    async fetchDaily(ticker) {
      starts.push({ ticker, at: Date.now() });
      return [];
    },
  };
  const result = await flow.collectKrInvestorFlows({
    tickers: ['005930', '000660', '005930', 'bad'],
    asOfDate: '2026-06-22',
    provider,
    concurrency: 2,
    intervalMs: 20,
  });
  assert.deepEqual(result.tickers, ['005930', '000660']);
  assert.ok(starts[1].at - starts[0].at >= 15, 'requests share a global rate limit');
}

{
  let primaryCalls = 0;
  let fallbackCalls = 0;
  const provider = flow.createKisKrInvestorFlowProvider(async ({ path }) => {
    if (path.endsWith('/inquire-investor')) {
      primaryCalls += 1;
      const error = new Error('rate limited');
      error.isAxiosError = true;
      error.response = { status: 429 };
      throw error;
    }
    fallbackCalls += 1;
    return { output: [{ stck_bsop_date: '20260622', acml_tr_pbmn: '1000' }] };
  });
  const rows = await provider.fetchDaily('005930', '2026-06-22');
  assert.equal(primaryCalls, 3, '429 is retried at most twice');
  assert.equal(fallbackCalls, 1);
  assert.equal(rows[0].provider, 'KIS_INVESTOR_TRADE_DAILY');
}

console.log('KR investor flow tests passed');
