import { test, expect } from '@playwright/test';
import { login, loginWith, expectLoginPage, expectDashboard } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('TC-AUTH: 인증 플로우', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
  });

  test('AUTH-01: 올바른 자격증명으로 로그인 → Command Center 리다이렉트', async ({ page }) => {
    await login(page);
    await expectDashboard(page);
  });

  test('AUTH-02: 잘못된 비밀번호로 로그인 시도 → 에러 메시지', async ({ page }) => {
    await loginWith(page, 'testadmin', 'WrongPassword');

    // Should stay on login page
    await expectLoginPage(page);

    // Error message should be visible
    const errorText = page.locator('text=/올바르지|잘못|Invalid|실패|error/i');
    await expect(errorText).toBeVisible({ timeout: 5_000 });
  });

  test('AUTH-06: 동일 브라우저의 두 탭에서 보호 화면 세션 유지', async ({ page, context }) => {
    await login(page);
    const secondPage = await context.newPage();
    await setupAllMocks(secondPage);

    await Promise.all([
      page.goto('/master-filter'),
      secondPage.goto('/scanner'),
    ]);

    await expect(page).toHaveURL(/\/master-filter/);
    await expect(secondPage).toHaveURL(/\/scanner/);
    await secondPage.close();
  });

  test.describe('미인증 상태', () => {
    test.beforeEach(async ({ page }) => {
      // Override auth mock to simulate logged out state
      await page.route('**/api/auth/session', async (route) => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ authenticated: false }),
        });
      });
    });

    test('AUTH-03: 미인증 상태에서 보호 페이지 접근 → /login 리다이렉트', async ({ page }) => {
      await page.goto('/');
      await expectLoginPage(page);
    });

    test('AUTH-04: 미인증 상태에서 /scanner 접근 → /login 리다이렉트', async ({ page }) => {
      await page.goto('/scanner');
      await expectLoginPage(page);
    });

    test('AUTH-05: 미인증 상태에서 /plan 접근 → /login 리다이렉트', async ({ page }) => {
      await page.goto('/plan');
      await expectLoginPage(page);
    });
  });
});
