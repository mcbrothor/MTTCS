import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';
import { HistoryPage } from './helpers/page-objects';

test.describe('TC-HIST: 성과 복기', () => {
  let historyPage: HistoryPage;

  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
    historyPage = new HistoryPage(page);
  });

  test('HIST-01: 복기 목록 뷰 로드 (기본 화면)', async ({ page }) => {
    await historyPage.goto();

    await expect(page.locator('h1:has-text("성과 복기")').first()).toBeVisible();
    
    // TradeTable should be visible
    await expect(historyPage.tradeTable).toBeVisible();
    
    // Fixture data should appear (e.g. MSFT or AAPL)
    await expect(page.locator('text=MSFT').first()).toBeVisible();
  });

  test('HIST-02: 성과 통계 뷰 전환', async ({ page }) => {
    await historyPage.goto();

    await historyPage.statsTab.click();

    // Dashboard metrics should appear
    await expect(page.locator('div').filter({ hasText: /^승률$/ }).first()).toBeVisible();
    await expect(page.locator('div').filter({ hasText: /^총 PnL$/ }).first()).toBeVisible();
    await expect(page.locator('div').filter({ hasText: /^계획 준수율$/ }).first()).toBeVisible();
  });

  test('HIST-05: 미국 ↔ 한국 시장 전환', async ({ page }) => {
    await historyPage.goto();

    await historyPage.marketToggleKR.click();
    
    // The URL should update
    await expect(page).toHaveURL(/market=KR/);
    
    // Check if UI reflects KR context
    await expect(page.locator('button:has-text("한국")').first()).toBeVisible();
  });

  test('HIST-06: 뷰 파라미터가 UI와 동기화됨', async ({ page }) => {
    // Go directly to stats view
    await historyPage.goto({ view: 'stats' });
    
    // Metric cards should be immediately visible
    await expect(page.locator('div').filter({ hasText: /^승률$/ }).first()).toBeVisible();
  });
});
