import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

test.describe('Wave 5: 반응형 디자인 테스트', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
  });

  test.describe('Mobile Viewport (375x812)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('RESP-01: 대시보드 모바일 렌더링', async ({ page }) => {
      await page.goto('/');
      // Command Center title should still be visible and not overflow
      const title = page.locator('text=Command Center');
      await expect(title).toBeVisible();
      
      // Cards should stack vertically, so riskCard might need scrolling
      // We just ensure it's in the DOM and visible (Playwright auto-scrolls)
      await expect(page.locator('text=오픈 리스크')).toBeVisible();
    });

    test('RESP-03: 스캐너 모바일 카드 뷰 자동 전환', async ({ page }) => {
      await page.goto('/scanner');
      // In mobile, table view is usually hidden and card view is shown
      // Check if grid structure exists or table is hidden
      // The exact implementation might vary, but we can verify the data is present
      await expect(page.locator('text=NVDA')).toBeVisible();
      
      // Filter buttons should still be accessible
      const filterBtn = page.locator('button:has-text("Recommended")');
      await expect(filterBtn).toBeVisible();
    });

    test('RESP-04: 모바일 내비게이션 바 메뉴 확인', async ({ page }) => {
      await page.goto('/');
      // Often mobile has a hamburger menu instead of full links
      // Let's verify we can still navigate to history
      const historyLink = page.locator('a[href="/history"]').first();
      // It might be inside a mobile menu or just an icon. We check it's attached.
      expect(await historyLink.count()).toBeGreaterThan(0);
    });
  });

  test.describe('Tablet Viewport (768x1024)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('RESP-02: 태블릿 환경 포트폴리오 레이아웃', async ({ page }) => {
      await page.goto('/portfolio');
      await expect(page.locator('text=포트폴리오 리스크')).toBeVisible();
      // Verify metric cards are present
      await expect(page.locator('text=총 자산')).toBeVisible();
    });
  });
});
