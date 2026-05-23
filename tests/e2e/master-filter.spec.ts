import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks, setupHaltMocks } from './mocks/handlers';

test.describe('TC-MF: 마스터 필터', () => {
  test.describe('정상 (GREEN) 상태', () => {
    test.beforeEach(async ({ page }) => {
      await setupAllMocks(page); // GREEN by default
      await login(page);
    });

    test('MF-01: GREEN 판정 시 녹색 UI 표시', async ({ page }) => {
      await page.goto('/master-filter');

      await expect(page.locator('text=마스터 필터')).toBeVisible();
      await expect(page.locator('text=GREEN')).toBeVisible();
      
      // Should indicate full action level
      await expect(page.locator('text=진입 가능').or(page.locator('text=FULL'))).toBeVisible();
    });
  });

  test.describe('방어 (RED) 상태', () => {
    test.beforeEach(async ({ page }) => {
      await setupHaltMocks(page); // Sets to RED / HALT
      await login(page);
    });

    test('MF-03: RED 판정 시 레드 표시 및 차단 메시지', async ({ page }) => {
      await page.goto('/master-filter');

      await expect(page.locator('text=RED')).toBeVisible();
      
      // Should indicate halt action level
      await expect(page.locator('text=진입 금지').or(page.locator('text=HALT'))).toBeVisible();
    });

    test('MF-04: DecisionBox 가이드라인 표시', async ({ page }) => {
      await page.goto('/master-filter');
      
      const decisionBox = page.locator('text=현금 비중').or(page.locator('text=신규 매수 금지')).first();
      await expect(decisionBox).toBeVisible();
    });
  });
});
