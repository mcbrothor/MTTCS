import assert from 'node:assert/strict';
import { getScannerUniverse } from '../lib/finance/market/scanner-universes.ts';

const originalFetch = globalThis.fetch;
const symbol = (index) => `S${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + index % 26)}`;
const table = (count = 503, duplicate = false) => `<table id="constituents"><tr><th>Symbol</th><th>Security</th><th>GICS Sector</th></tr>${Array.from({ length: count }, (_, index) => `<tr><td><a href="https://www.nyse.com/quote/XNYS:${symbol(index)}">${duplicate ? 'AAA' : index === 0 ? 'BRK.B' : symbol(index)}</a></td><td>Company ${index} &amp; Partners</td><td>Industrials</td></tr>`).join('')}</table>`;
let wikipediaHtml = table();
let primaryHtml = null;
const requests = [];
globalThis.fetch = async (input) => {
  const url = String(input);
  requests.push(url);
  if (url.includes('stockanalysis.com')) return primaryHtml === null ? new Response('Forbidden', { status: 403 }) : new Response(primaryHtml);
  assert.match(url, /en\.wikipedia\.org\/wiki\/List_of_S%26P_500_companies/);
  return new Response(wikipediaHtml);
};
try {
  const result = await getScannerUniverse('SP500');
  assert.equal(result.items.length, 503, 'Preserve multiple share classes; do not silently truncate at 500');
  assert.equal(new Set(result.items.map((row) => row.ticker)).size, 503);
  assert.equal(result.items[0].ticker, 'BRK-B');
  assert.equal(result.items[0].name, 'Company 0 & Partners');
  assert.equal(result.items[0].exchange, 'NYS');
  assert.equal(result.items[0].currentPrice, null);
  assert.equal(result.items[0].marketCap, null);
  assert.match(result.source, /Wikipedia/);
  assert.match(result.warnings.join(' '), /403.*fallback/i);
  assert.match(result.warnings.join(' '), /other exchanges.*excluded/i);
  assert.equal(requests.length, 2);
  wikipediaHtml = table(499);
  await assert.rejects(getScannerUniverse('SP500'), /coverage.*499/i);
  wikipediaHtml = table(503, true);
  await assert.rejects(getScannerUniverse('SP500'), /coverage.*1 unique/i);
  wikipediaHtml = table().replaceAll('constituents', 'changes');
  await assert.rejects(getScannerUniverse('SP500'), /constituent table/);
  wikipediaHtml = table(551);
  await assert.rejects(getScannerUniverse('SP500'), /coverage.*551/i);
  wikipediaHtml = table().replaceAll('www.nyse.com', 'example.com');
  await assert.rejects(getScannerUniverse('SP500'), /coverage.*0 unique/i, 'Unknown exchange evidence must not silently become NASDAQ');
  primaryHtml = '<table><tr><td>1</td><td><a href="/stocks/aaa/">AAA</a></td><td>Single stock</td><td>1T</td><td>100</td></tr></table>';
  wikipediaHtml = table();
  assert.equal((await getScannerUniverse('SP500')).items.length, 503, 'Incomplete primary response must use validated fallback');
} finally { globalThis.fetch = originalFetch; }
console.log('S&P 500 source recovery tests passed');
