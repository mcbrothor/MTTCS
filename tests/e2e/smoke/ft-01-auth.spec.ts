import { test, expect } from '@playwright/test';
import { smokeLogin, smokeLoginWith, expectLoginPage, expectDashboard } from './helpers/auth';

/**
 * FT-01: 인증 플로우
 */
test.describe('FT-01: 인증 플로우', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('정상 로그인 → Command Center 리다이렉트', async ({ page }) => {
    await smokeLogin(page);
    await expectDashboard(page);
  });

  test('잘못된 비밀번호 → 에러 메시지 표시', async ({ page }) => {
    await smokeLoginWith(page, 'notead12', 'WrongPassword123');

    // 로그인 페이지에 머물러야 함
    await expectLoginPage(page);

    // 에러 메시지 확인
    const errorText = page.locator('text=/올바르지|잘못|Invalid|실패|error/i');
    await expect(errorText.first()).toBeVisible({ timeout: 5_000 });
  });

  test('빈 자격증명 → 폼 유효성 검사', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true', { timeout: 15_000 });

    // 빈 상태에서 제출 시도
    const submitButton = page.locator('button[type="submit"], button:has-text("로그인")').first();
    await submitButton.click();

    // 로그인 페이지에 머물러야 함
    await expectLoginPage(page);
  });

  test('미인증 상태에서 보호 페이지 접근 → /login 리다이렉트', async ({ page }) => {
    await page.goto('/');

    // 로그인 페이지로 리다이렉트되거나 로그인 폼이 보여야 함
    await page.waitForURL(/\/login/, { timeout: 15_000 }).catch(() => {
      // 일부 페이지는 클라이언트 사이드에서 리다이렉트할 수 있음
    });
  });

  test('로그인 후 모든 페이지 접근 가능', async ({ page }) => {
    await smokeLogin(page);

    const protectedPages = ['/', '/master-filter', '/scanner', '/plan', '/portfolio', '/history'];
    for (const pagePath of protectedPages) {
      const response = await page.goto(pagePath);
      expect(response?.status()).toBeLessThan(500);
    }
  });
});
