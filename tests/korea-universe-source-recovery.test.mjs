import assert from 'node:assert/strict';
import { getScannerUniverse } from '../lib/finance/market/scanner-universes.ts';

const originalFetch = globalThis.fetch;
const requests = [];
let brokenMarket = false;
let invalidRows = false;
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requests.push(url);
  if (url.hostname === 'finance.naver.com') return new Response('<html><title>Npay</title><div id="root"></div></html>');
  assert.equal(url.hostname, 'm.stock.naver.com');
  const market = url.pathname.split('/').at(-1);
  const page = Number(url.searchParams.get('page'));
  return Response.json({ stockListCategoryType: brokenMarket ? 'KOSPI' : market, page, stocks: Array.from({ length: 100 }, (_, offset) => {
    const rank = (page - 1) * 100 + offset + 1;
    return { itemCode: invalidRows && offset < 10 ? 'invalid' : String(100000 + rank), stockName: rank <= 40 ? `ETF ${rank}` : `Company ${rank}`, marketValue: String(10000 - rank), closePrice: '1,000', localTradedAt: '2026-09-18T15:30:00+09:00' };
  }) });
};
try {
  const kosdaq = await getScannerUniverse('KOSDAQ150');
  assert.equal(kosdaq.items.length, 150, 'SPA redirect must recover the full eligible KOSDAQ pool');
  assert.equal(kosdaq.items[0].ticker, '100041');
  assert.equal(kosdaq.items[0].marketCap, 9959 * 100_000_000);
  assert.equal(kosdaq.items[0].currentPrice, 1000);
  assert.equal(kosdaq.items[0].priceAsOf, '2026-09-18T15:30:00+09:00');
  assert.match(kosdaq.items[0].priceSource, /Naver.*JSON/);
  assert.match(kosdaq.label, /시가총액/);
  assert.equal(requests.filter((url) => url.hostname === 'finance.naver.com').length, 1, 'Do not refetch the same redirected SPA for all legacy pages');
  const kospi = await getScannerUniverse('KOSPI200');
  assert.equal(kospi.items.length, 200);
  invalidRows = true;
  assert.equal((await getScannerUniverse('KOSDAQ150')).items.length, 150, 'Continue pagination when invalid source rows consume the raw page budget');
  invalidRows = false;
  brokenMarket = true;
  await assert.rejects(getScannerUniverse('KOSDAQ150'), /KOSDAQ.*market|market.*KOSDAQ/i, 'Never accept KOSPI results for KOSDAQ');
} finally { globalThis.fetch = originalFetch; }
console.log('Korea universe source recovery tests passed');
