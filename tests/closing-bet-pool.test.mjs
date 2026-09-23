import assert from 'node:assert/strict';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const { closingPool, koreanDate } = jiti('../lib/closing-bet/data.ts');
const originalFetch = globalThis.fetch;
let partial = true;
let calls = 0;
const stored = new Map();
const repo = {
  cache: async (key) => stored.has(key) ? { payload: stored.get(key) } : null,
  putCache: async (key, payload) => { stored.set(key, payload); },
};

globalThis.fetch = async (input) => {
  calls++;
  const url = new URL(String(input));
  if (url.hostname === 'm.stock.naver.com') return new Response('', { status: 503 });
  assert.equal(url.hostname, 'finance.naver.com');
  const page = Number(url.searchParams.get('page'));
  if (partial && page > 1) return new Response('', { status: 503 });
  const rows = Array.from({ length: partial ? 29 : 50 }, (_, offset) => {
    const rank = (page - 1) * 50 + offset + 1;
    return `<tr><td><a href="/item/main.naver?code=${100000 + rank}">Company ${rank}</a></td>${[1000, 0, 0, 0, 10000 - rank].map((value) => `<td class="number">${value}</td>`).join('')}</tr>`;
  }).join('');
  return new Response(`<table>${rows}</table>`);
};

try {
  await assert.rejects(closingPool(repo, 'KOSDAQ150', koreanDate(), false), /legacy HTML incomplete: 29\/200.*HTTP 503/, '불완전 HTML 및 JSON 원천 오류를 함께 표시한다');
  assert.equal(stored.size, 0, '불완전 원천 목록은 정상 풀 캐시로 저장하지 않는다');

  partial = false;
  const recovered = await closingPool(repo, 'KOSDAQ150', koreanDate(), false);
  assert.equal(recovered.items.length, 150);
  assert.equal(stored.size, 1, '복구된 전체 목록만 저장한다');
  const before = calls;
  assert.equal((await closingPool(repo, 'KOSDAQ150', koreanDate(), false)).items.length, 150);
  assert.equal(calls, before, '검증된 당일 풀은 추가 원천 요청 없이 재사용한다');

  stored.clear();
  await closingPool(repo, 'KOSDAQ150', koreanDate(), true);
  assert.equal(stored.size, 0, 'dry-run은 복구된 풀도 저장하지 않는다');
} finally {
  globalThis.fetch = originalFetch;
}
console.log('closing bet pool recovery tests passed');
