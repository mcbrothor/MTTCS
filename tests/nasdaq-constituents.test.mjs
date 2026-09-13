import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createJiti } from 'jiti';
import { NASDAQ_COMPONENTS_URL, parseWikipediaNasdaqConstituents } from '../lib/finance/market/nasdaq-constituents.ts';

const asOf = '2026-09-14T00:00:00.000Z';
const ticker = (i) => `T${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}`;
const rows = (n, reversed = false) => Array.from({ length: n }, (_, i) => {
  const cells = [ticker(i), `Company ${i}`];
  return `<tr>${(reversed ? cells.reverse() : cells).map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
}).join('');
const table = (n = 100) => `<table id="constituents"><tr><th>Ticker</th><th>Company</th></tr>${rows(n)}</table>`;

const normal = parseWikipediaNasdaqConstituents(table(), asOf);
assert.equal(normal.length, 100);
assert.equal(normal[0].ticker, 'TAA');
assert.equal(normal[99].rank, 100);
assert.equal(normal[0].priceAsOf, asOf);
assert.equal(normal[0].currentPrice, null);

const reordered = `<table class='wikitable'><tr><th>Company</th><th>Ticker</th></tr>${rows(100, true)}<tr><td>Example &amp; Co.</td><td>XYZ.A<sup>[1]</sup></td></tr></table>`;
const parsed = parseWikipediaNasdaqConstituents(reordered, asOf);
assert.equal(parsed.length, 101);
assert.equal(parsed[100].ticker, 'XYZ-A');
assert.equal(parsed[100].name, 'Example & Co.');
const auxiliary = table(1).replace('id="constituents"', 'id="historical-changes"');
assert.equal(parseWikipediaNasdaqConstituents(auxiliary + table(), asOf).length, 100);
assert.equal(parseWikipediaNasdaqConstituents(auxiliary + reordered, asOf).length, 101);
assert.throws(() => parseWikipediaNasdaqConstituents(reordered + table(29), asOf), /coverage invalid: 29/);
assert.throws(() => parseWikipediaNasdaqConstituents('<table><tr><th>Year</th><th>Return</th></tr></table>', asOf), /headers are required/);
assert.throws(() => parseWikipediaNasdaqConstituents(table(29), asOf), /coverage invalid: 29/);
assert.throws(() => parseWikipediaNasdaqConstituents(table(151), asOf), /coverage invalid: 151/);
assert.throws(() => parseWikipediaNasdaqConstituents(table(99).replace('</table>', `<tr><td>TAA</td><td>Duplicate</td></tr></table>`), asOf), /99 unique/);

// Exercise the actual provider fallback, with no network or report delivery.
const jiti = createJiti(import.meta.url, { alias: { '@': process.cwd() } });
const { getScannerUniverse } = await jiti.import('../lib/finance/market/scanner-universes.ts');
const originalFetch = globalThis.fetch;
const requests = [];
try {
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return String(url) === NASDAQ_COMPONENTS_URL
      ? new Response(table(), { status: 200 })
      : new Response('provider unavailable', { status: 503 });
  };
  const fallback = await getScannerUniverse('NASDAQ100');
  assert.equal(fallback.items.length, 100);
  assert.match(fallback.warnings[0], /503.*Wikipedia fallback/);
  assert.equal(requests[1], NASDAQ_COMPONENTS_URL);

  globalThis.fetch = async (url) => new Response(String(url) === NASDAQ_COMPONENTS_URL ? '<h1>No constituent table</h1>' : '', { status: String(url) === NASDAQ_COMPONENTS_URL ? 200 : 503 });
  await assert.rejects(() => getScannerUniverse('NASDAQ100'), /Primary:.*503.*Fallback:.*table not found/);

  const partialPrimary = `<table><tr><td>1</td><td><a href="/stocks/xyz/">XYZ</a></td><td>Example</td><td>1B</td><td>12</td></tr></table>`;
  globalThis.fetch = async (url) => new Response(String(url) === NASDAQ_COMPONENTS_URL ? table() : partialPrimary);
  const partial = await getScannerUniverse('NASDAQ100');
  assert.equal(partial.items.length, 100);
  assert.match(partial.warnings[0], /coverage invalid/);
} finally {
  globalThis.fetch = originalFetch;
}

// Optional read-only smoke: a current response downloaded from the public source.
if (process.env.MTN_NASDAQ_SMOKE_HTML) {
  const live = parseWikipediaNasdaqConstituents(readFileSync(process.env.MTN_NASDAQ_SMOKE_HTML, 'utf8'), asOf);
  assert.ok(live.length >= 100);
  assert.ok(live.some((item) => item.ticker === 'AAPL'));
  assert.ok(live.every((item) => item.name !== item.ticker));
  console.log(`Live Nasdaq HTML verified: ${live.length} unique constituents.`);
}
console.log('Nasdaq constituent parser and provider fallback tests passed.');
