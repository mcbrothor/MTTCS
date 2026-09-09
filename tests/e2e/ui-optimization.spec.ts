import { test, expect } from '@playwright/test';
import { setupAllMocks } from './mocks/handlers';

test.beforeEach(async ({ page }) => { await setupAllMocks(page); });

test('cross-check reads the union of real scanner stores and preserves legacy URLs', async ({ page }) => {
  let scans = 0;
  page.on('request', request => { if (/\/api\/scanner\/(scan|metrics|universe)/.test(request.url())) scans++; });
  await page.goto('/cross-check?universe=NASDAQ100');
  await expect(page).toHaveURL(/scanner\?view=cross-check&universe=NASDAQ100/);
  await page.evaluate(async () => {
    const prefixes = ['mtn:scanner-snapshot:v3:', 'mtn:canslim-snapshot:v1:', 'mtn:modern-leader-snapshot:v1:', 'mtn:scanner:momentum:v1:', 'mtn:scanner:qullamaggie:v1:', 'mtn:scanner:reversal:v1:'];
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('keyval-store');
      open.onupgradeneeded = () => open.result.createObjectStore('keyval');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('keyval', 'readwrite');
        prefixes.forEach((prefix, index) => tx.objectStore('keyval').put({ universe: 'NASDAQ100', savedAt: '2026-09-08T06:00:00Z', results: [{ ticker: index < 3 ? 'FIRST' : 'SECOND', exchange: 'NAS', currentPrice: 100 }] }, prefix + 'NASDAQ100'));
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.getByRole('button', { name: '저장 결과 다시 읽기' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'FIRST' })).toContainText('3');
  await expect(page.getByRole('row').filter({ hasText: 'SECOND' })).toContainText('3');
  await page.getByText('데이터 출처·저장 시각·포함 기준', { exact: true }).click();
  await expect(page.getByText(/미너비니: 2026/)).toBeVisible();
  expect(scans).toBe(0);
});

test('hidden recommendation summary does not request data until opened', async ({ page }) => {
  let summaries = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/recommendations/summary') summaries++; });
  await page.goto('/recommendations?view=metrics');
  await expect(page.getByRole('button', { name: '빈출 추천 요약 보기' })).toBeVisible();
  expect(summaries).toBe(0);
  await page.getByRole('button', { name: '빈출 추천 요약 보기' }).click();
  await expect(page.getByRole('region', { name: '최근 2주 추천 빈도 Top 5' })).toBeVisible();
  expect(summaries).toBe(1);
});

test('watchlist memo editing neither starts nor repeats market analysis', async ({ page }) => {
  let reads = 0;
  const item = { id: 'wl-1', ticker: 'NVDA', exchange: 'NAS', priority: 1, tags: [], memo: '', group_name: '기본' };
  await page.route('**/api/watchlist*', route => route.fulfill({ json: { data: route.request().method() === 'PATCH' ? { ...item, ...route.request().postDataJSON() } : [item] } }));
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/market-data') reads++; });
  await page.goto('/watchlist');
  await page.getByRole('row').filter({ hasText: 'NVDA' }).click();
  await expect(page.getByRole('button', { name: '종목 분석 보기' })).toBeVisible();
  expect(reads).toBe(0);
  await page.getByRole('button', { name: '종목 분석 보기' }).click();
  await expect(page.getByText('SEPA', { exact: true })).toBeVisible();
  expect(reads).toBe(1);
  await page.getByRole('textbox', { name: '메모', exact: true }).fill('수정된 투자 메모');
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/watchlist' && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: '설정 저장' }).click();
  await saved;
  await expect(page.getByRole('textbox', { name: '메모', exact: true })).toHaveValue('수정된 투자 메모');
  expect(reads).toBe(1);
});

test('desktop macro panels share one read and mobile hidden strip performs none', async ({ page }) => {
  let reads = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/macro') reads++; });
  await page.goto('/macro');
  await expect(page.getByRole('heading', { name: '시장 밖 위험 점검', exact: true })).toBeVisible();
  // The desktop strip deliberately mounts its read after 2.5 seconds.
  await page.waitForTimeout(3100);
  expect(reads).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  reads = 0;
  await page.goto('/recommendations?view=metrics');
  await expect(page.getByRole('button', { name: '빈출 추천 요약 보기' })).toBeVisible();
  await page.waitForTimeout(3100);
  expect(reads).toBe(0);
});

test('scanner desktop and mobile keep a single selection bar without page overflow', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/scanner');
    await page.getByRole('button', { name: '스캔 시작', exact: true }).click();
    await expect(page.getByText('NVDA', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /후보 선택$/ }).first().click();
    await expect(page.getByRole('complementary', { name: '선택 후보 작업' })).toHaveCount(1);
    await expect(page.getByRole('link', { name: '콘테스트로 이동', exact: true })).toHaveCount(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (viewport.width > 768) {
      const bar = await page.getByRole('complementary', { name: '선택 후보 작업' }).boundingBox();
      const table = await page.getByRole('table').boundingBox();
      expect(bar!.y + bar!.height).toBeLessThanOrEqual(table!.y);
    }
    await page.screenshot({ path: testInfo.outputPath(`scanner-${viewport.width}.png`), fullPage: true });
    await page.getByRole('button', { name: '전체 해제', exact: true }).click();
  }
});
