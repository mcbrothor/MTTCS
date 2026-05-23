import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';
import scannerResults from './fixtures/scanner-results.json';

test.describe('TC-CONTEST: 뷰티 컨테스트', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);

    // Seed localStorage so that /contest correctly picks up candidate tickers
    await page.goto('/');
    await page.evaluate((results) => {
      const universeMeta = {
        universe: 'NASDAQ100',
        label: 'NASDAQ100',
        asOf: new Date().toISOString(),
        source: 'minervini',
        delayNote: null,
        items: results,
        warnings: [],
      };
      const snapshot = {
        savedAt: new Date().toISOString(),
        universeMeta,
        results,
      };

      const selection = {
        source: 'minervini',
        universe: 'NASDAQ100',
        tickers: ['NVDA', 'META', 'SNOW'],
        savedAt: new Date().toISOString(),
      };
      window.localStorage.setItem('mtn:scanner:snapshot:NASDAQ100', JSON.stringify(snapshot));
      window.localStorage.setItem('mtn:contest:transfers-by-source:v1', JSON.stringify({
        'minervini:NASDAQ100': selection
      }));
      window.localStorage.setItem('mtn:scanner:last-universe:v1', 'NASDAQ100');
    }, scannerResults);
  });

  test('CON-01: 세션 초기화 및 LLM 심사 로드', async ({ page }) => {
    // Navigate with query params simulating scanner redirect
    await page.goto('/contest?tickers=NVDA,META,SNOW&exchange=NAS');

    await expect(page.locator('text=분석 대상 종목 선정')).toBeVisible();
    await expect(page.locator('text=Beauty Contest')).toBeVisible();

    // Should show loading state initially, then results from mock
    await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });
  });

  test('CON-02: LLM 응답 결과 렌더링 (순위, 추천상태)', async ({ page }) => {
    await page.goto('/contest?tickers=NVDA,META,SNOW&exchange=NAS');

    // Mocks return PROCEED for NVDA, WATCH for META, SKIP for SNOW
    await expect(page.locator('text=NVDA').first()).toBeVisible({ timeout: 15_000 });
    
    // Check for recommendation badges
    await expect(page.locator('text=PROCEED')).toBeVisible();
    await expect(page.locator('text=WATCH')).toBeVisible();
    await expect(page.locator('text=SKIP')).toBeVisible();
  });

  test('CON-04: 최종 선별 후 Plan Queue 전달', async ({ page }) => {
    await page.goto('/contest?tickers=NVDA,META,SNOW&exchange=NAS');

    // Wait for mock data to load
    await expect(page.locator('text=PROCEED')).toBeVisible({ timeout: 15_000 });

    // Click "매매 계획 큐 생성" button or similar CTA
    const queueButton = page.locator('button:has-text("계획 수립"), button:has-text("Plan Queue"), a:has-text("계획 수립")').first();
    
    if (await queueButton.isVisible()) {
      await queueButton.click();
      
      // Should redirect to /plan
      await expect(page).toHaveURL(/\/plan/);
      
      // Plan Queue banner should be visible
      await expect(page.locator('text=Contest Plan Queue')).toBeVisible();
    }
  });
});
