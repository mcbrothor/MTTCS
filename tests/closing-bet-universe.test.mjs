import assert from 'node:assert/strict';
import { getScannerUniverse } from '../lib/finance/market/scanner-universes.ts';

const originalFetch = globalThis.fetch;
const requested = [];
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  assert.equal(url.hostname, 'finance.naver.com');
  const page = Number(url.searchParams.get('page'));
  requested.push(page);
  const rows = Array.from({ length: 50 }, (_, offset) => {
    const rank = (page - 1) * 50 + offset + 1;
    const ticker = String(100000 + rank);
    const name = rank <= 50 ? `ETF ${rank}` : `Company ${rank}`;
    return `<tr><td><a href="/item/main.naver?code=${ticker}">${name}</a></td>${[1000, 0, 0, 0, 10000 - rank].map((value) => `<td class="number">${value}</td>`).join('')}</tr>`;
  }).join('');
  return new Response(`<table>${rows}</table>`);
};
try {
  const kospi = await getScannerUniverse('KOSPI200');
  assert.equal(kospi.items.length, 200, 'ETF 제외 후에도 기존 시총 상위 200개 풀을 채운다');
  assert.deepEqual(requested, [1, 2, 3, 4, 5, 6], '300개 원본 요청을 4페이지에서 중단하지 않는다');
  assert.equal(kospi.items[0].ticker, '100051');
  assert.equal(kospi.items.at(-1).ticker, '100250');
  requested.length = 0;
  const kosdaq = await getScannerUniverse('KOSDAQ150');
  assert.equal(kosdaq.items.length, 150);
  assert.deepEqual(requested, [1, 2, 3, 4]);
} finally { globalThis.fetch = originalFetch; }
console.log('closing bet existing universe pagination tests passed');
