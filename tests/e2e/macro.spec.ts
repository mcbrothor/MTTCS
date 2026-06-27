import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks, setupErrorMocks } from './mocks/handlers';

test.describe('TC-MACRO: 시장 밖 위험 점검', () => {
  test.describe('정상 플로우', () => {
    test.beforeEach(async ({ page }) => {
      await setupAllMocks(page); // default is RISK_ON score 78
      await login(page);
    });

    test('MACRO-01: 시장 밖 위험 카드가 쉬운 용어로 표시', async ({ page }) => {
      await page.goto('/macro');

      await expect(page.getByRole('heading', { name: '시장 밖 위험 점검' })).toBeVisible();
      await expect(page.getByText('투자하기 좋은 흐름').first()).toBeVisible();
      await expect(page.locator('text=78').first()).toBeVisible();
    });

    test('MACRO-04: 자산 그리드 8개 카드 표시', async ({ page }) => {
      await page.goto('/macro');

      // Check for assets from the fixture
      await expect(page.getByText('S&P 500', { exact: true })).toBeVisible();
      await expect(page.getByText('Nasdaq 100', { exact: true })).toBeVisible();
      await expect(page.getByText('HY Bond', { exact: true })).toBeVisible();
      await expect(page.getByText('7-10Y UST', { exact: true })).toBeVisible();
      await expect(page.getByText('20Y+ UST', { exact: true })).toBeVisible();
      await expect(page.getByText('Gold', { exact: true })).toBeVisible();
      await expect(page.getByText('VIX', { exact: true }).first()).toBeVisible();
      await expect(page.getByText('Bitcoin', { exact: true })).toBeVisible();
    });

    test('MACRO-07: 오늘의 결론 CTA 클릭', async ({ page }) => {
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

    test('MACRO-06: 큰 흐름 데이터 로딩 실패 시 에러 표시', async ({ page }) => {
      await page.goto('/macro');

      // Should show an error banner or text
      const errorMsg = page.locator('text=/실패|오류|error|확인 필요/i');
      await expect(errorMsg.first()).toBeVisible({ timeout: 10_000 });
    });
  });
});
