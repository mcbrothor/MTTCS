import { test, expect } from '@playwright/test';
import { createSessionToken, AUTH_COOKIE_NAME } from '../../lib/auth/session';

const path = '/strategies/kr-closing-bet';
const days = ['2026-09-04', '2026-09-03'];
function payload(date: string, mode = 'REPLAY') {
  return { data: { dates: days, evaluations: [], snapshots: ['KOSPI200', 'KOSDAQ150'].map((market) => ({
    id: `${date}-${market}`, modelVersion: 'navigation-test', tradeDate: date,
    asOf: `${date}T06:18:00Z`, createdAt: `${date}T06:19:00Z`, market, mode, phase: 'FINAL',
    venue: 'KRX', status: 'DEGRADED', regime: 'UNKNOWN', benchmarkLateReturnPct: null,
    universe: { name: market, count: 0, expectedCount: 200, historicalMembership: false },
    coverage: { collected: 0, total: 200, failed: 200 }, picks: [], reviewCandidates: [], candidates: [], warnings: [],
  })) } };
}

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: AUTH_COOKIE_NAME, value: await createSessionToken('closing-navigation-test'), url: baseURL! }]);
});

test('date switches immediately without waiting for a server page navigation', async ({ page }) => {
  let navigations = 0;
  await page.route(`**${path}?*`, async (route) => {
    if (new URL(route.request().url()).searchParams.has('_rsc')) {
      navigations++;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    await route.continue();
  });
  await page.route('**/api/closing-bet?*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: payload(params.get('date') || days[0], params.get('mode') || 'REPLAY') });
  });
  await page.goto(`${path}?date=${days[0]}&mode=REPLAY`);
  await expect(page.getByLabel('코스피 Top5', { exact: true })).toBeVisible();
  for (const date of [days[1], days[0]]) {
    await page.getByLabel('기준일', { exact: true }).selectOption(date);
    await expect(page.getByLabel('기준일', { exact: true })).toHaveValue(date, { timeout: 1500 });
    await expect(page).toHaveURL(new RegExp(`date=${date}`));
    for (const name of ['코스피 Top5', '코스닥 Top5']) {
      await expect(page.getByLabel(name, { exact: true })).toContainText(date.endsWith('03') ? '09. 03.' : '09. 04.');
    }
  }
  expect(navigations).toBe(0);
});

test('keeps date options and ignores an obsolete response during rapid selection', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/closing-bet?*', async (route) => {
    const date = new URL(route.request().url()).searchParams.get('date') || days[0];
    if (date === days[1]) await gate;
    await route.fulfill({ json: payload(date) });
  });
  await page.goto(`${path}?date=${days[0]}&mode=REPLAY`);
  await expect(page.getByLabel('코스피 Top5', { exact: true })).toBeVisible();
  const pending = page.waitForRequest((request) => request.url().includes('/api/closing-bet?') && request.url().includes(days[1]));
  await page.getByLabel('기준일', { exact: true }).selectOption(days[1]);
  await pending;
  await expect(page.getByLabel('기준일', { exact: true }).locator('option')).toHaveCount(3);
  await page.getByLabel('기준일', { exact: true }).selectOption(days[0]);
  await expect(page.getByLabel('코스피 Top5', { exact: true })).toContainText('09. 04.');
  release();
  await expect(page.getByLabel('기준일', { exact: true })).toHaveValue(days[0]);
  await expect(page.getByLabel('코스닥 Top5', { exact: true })).toContainText('09. 04.');
});

test('failed date lookup keeps selection and retry recovers the same date', async ({ page }) => {
  let fail = true;
  await page.route('**/api/closing-bet?*', (route) => {
    const date = new URL(route.request().url()).searchParams.get('date') || days[0];
    return date === days[1] && fail
      ? route.fulfill({ status: 503, json: { message: '검증용 일시 오류' } })
      : route.fulfill({ json: payload(date) });
  });
  await page.goto(`${path}?date=${days[0]}&mode=REPLAY`);
  await expect(page.getByLabel('코스피 Top5', { exact: true })).toBeVisible();
  await page.getByLabel('기준일', { exact: true }).selectOption(days[1]);
  await expect(page.getByText('검증용 일시 오류', { exact: true })).toBeVisible();
  await expect(page.getByLabel('기준일', { exact: true }).locator('option')).toHaveCount(3);
  fail = false;
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.getByLabel('코스피 Top5', { exact: true })).toContainText('09. 03.');
  await expect(page.getByLabel('기준일', { exact: true })).toHaveValue(days[1]);
});

test('a stalled lookup times out and offers a working retry', async ({ page }) => {
  await page.clock.install();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let stall = false;
  await page.route('**/api/closing-bet?*', async (route) => {
    if (stall) await gate;
    const date = new URL(route.request().url()).searchParams.get('date') || days[0];
    await route.fulfill({ json: payload(date) });
  });
  await page.goto(`${path}?date=${days[0]}&mode=REPLAY`);
  await expect(page.getByLabel('코스피 Top5', { exact: true })).toBeVisible();
  stall = true;
  const pending = page.waitForRequest((request) => request.url().includes('/api/closing-bet?') && request.url().includes(days[1]));
  await page.getByLabel('기준일', { exact: true }).selectOption(days[1]);
  await pending;
  await page.clock.fastForward(15_001);
  await expect(page.getByText('조회 시간이 초과되었습니다. 다시 불러와 주세요.', { exact: true })).toBeVisible();
  stall = false;
  release();
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.getByLabel('코스피 Top5', { exact: true })).toContainText('09. 03.');
});
