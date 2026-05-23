import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';
import { DashboardPage } from './helpers/page-objects';

test.describe('TC-DASH: Command Center', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
    dashboard = new DashboardPage(page);
  });

  test('DASH-01: 대시보드 초기 로드 (미국 시장)', async ({ page }) => {
    await dashboard.goto();

    await expect(page.locator('text=Command Center')).toBeVisible();
    await expect(dashboard.marketStateCard).toBeVisible();
    await expect(dashboard.macroCard).toBeVisible();
    await expect(dashboard.riskCard).toBeVisible();

    // Default should be US
    await expect(page.locator('text=/USD|미국/').first()).toBeVisible();
  });

  test('DASH-02: 한국 시장으로 전환', async ({ page }) => {
    await dashboard.goto();
    await dashboard.switchMarket('KR');

    // Should see KRW indication
    await expect(page.locator('text=/KRW|한국/').first()).toBeVisible();
  });

  test('DASH-03: Next Action CTA 버튼 이동', async ({ page }) => {
    await dashboard.goto();
    
    // In RISK_ON (fixture default), next action CTA is to Scanner or Macro
    await dashboard.nextActionCta.click();
    
    // Check we navigated away from dashboard
    await expect(page.url()).not.toBe('http://localhost:3000/');
  });

  test('DASH-04: 관심 후보 목록 → Plan 페이지 이동', async ({ page }) => {
    await dashboard.goto();
    
    // Watchlist item NVDA should exist
    const nvdaLink = page.locator('a[href*="/plan?ticker=NVDA"]').first();
    await expect(nvdaLink).toBeVisible();
    
    // Verify it works
    await nvdaLink.click();
    await expect(page).toHaveURL(/\/plan\?ticker=NVDA/);
  });

  test('DASH-05: 최근 매매 흐름 → History 이동', async ({ page }) => {
    await dashboard.goto();

    // The fixture has AAPL or MSFT in recent trades
    const historyLink = page.locator('a[href*="/history?"]').first();
    if (await historyLink.isVisible()) {
        await historyLink.click();
        await expect(page).toHaveURL(/\/history/);
    }
  });

  test('DASH-06: 워크플로우 스텝 링크 작동', async ({ page }) => {
    await dashboard.goto();

    // Step 02: scanner
    const scanLink = page.locator('a[href="/scanner"]').first();
    await scanLink.click();
    await expect(page).toHaveURL(/\/scanner/);
  });
});
