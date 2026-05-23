import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks, setupErrorMocks } from './mocks/handlers';

test.describe('TC-MACRO: 매크로 분석', () => {
  test.describe('정상 플로우 (RISK_ON)', () => {
    test.beforeEach(async ({ page }) => {
      await setupAllMocks(page); // default is RISK_ON score 78
      await login(page);
    });

    test('MACRO-01: RISK_ON 레짐 카드 표시', async ({ page }) => {
      await page.goto('/macro');

      // Check header
      await expect(page.locator('text=Macro Analysis')).toBeVisible();
      
      // Hero card should show RISK_ON and score 78
      await expect(page.locator('text=RISK_ON')).toBeVisible();
      await expect(page.locator('text=78').first()).toBeVisible();
    });

    test('MACRO-04: 자산 그리드 8개 카드 표시', async ({ page }) => {
      await page.goto('/macro');

      // Check for assets from the fixture
      await expect(page.locator('text=SPY')).toBeVisible();
      await expect(page.locator('text=QQQ')).toBeVisible();
      await expect(page.locator('text=HYG')).toBeVisible();
      await expect(page.locator('text=IEF')).toBeVisible();
      await expect(page.locator('text=TLT')).toBeVisible();
      await expect(page.locator('text=GLD')).toBeVisible();
      await expect(page.locator('text=VIX')).toBeVisible();
      await expect(page.locator('text=BTC')).toBeVisible();
    });

    test('MACRO-07: 마스터 필터 CTA 클릭', async ({ page }) => {
      await page.goto('/macro');

      const mfButton = page.locator('a[href="/master-filter"]').first();
      await mfButton.click();
      await expect(page).toHaveURL(/\/master-filter/);
    });
  });

  test.describe('에러 핸들링', () => {
    test.beforeEach(async ({ page }) => {
      await setupAllMocks(page);
      await setupErrorMocks(page); // Overrides macro to return 500
      await login(page);
    });

    test('MACRO-06: 매크로 데이터 로딩 실패 시 에러 표시', async ({ page }) => {
      await page.goto('/macro');

      // Should show an error banner or text
      const errorMsg = page.locator('text=/실패|오류|error|미채점/i');
      await expect(errorMsg.first()).toBeVisible({ timeout: 10_000 });
    });
  });
});
