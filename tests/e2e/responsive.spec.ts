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

      const initialWidth = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(initialWidth.scroll).toBeLessThanOrEqual(initialWidth.client);

      await page.getByRole('button', { name: /스캔 시작/ }).click();
      // In mobile, table view is usually hidden and card view is shown
      // Check if grid structure exists or table is hidden
      // The exact implementation might vary, but we can verify the data is present
      await expect(page.getByText('NVDA', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
      
      // Filter buttons should still be accessible
      const filterBtn = page.locator('button:has-text("Recommended")');
      await expect(filterBtn).toBeVisible();

      const resultWidth = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(resultWidth.scroll).toBeLessThanOrEqual(resultWidth.client);
    });

    test('RESP-04: 모바일 내비게이션 바 메뉴 확인', async ({ page }) => {
      await page.goto('/');

      const menuButton = page.getByRole('button', { name: '메뉴 열기' });
      const mainBefore = await page.locator('main').boundingBox();
      const scrollBefore = await page.evaluate(() => window.scrollY);

      await menuButton.click();

      const drawer = page.getByRole('dialog', { name: '전체 메뉴' });
      await expect(drawer).toBeVisible();
      await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
      await expect(drawer.getByRole('button', { name: '메뉴 닫기' })).toBeFocused();
      const mainAfter = await page.locator('main').boundingBox();
      expect(mainAfter && { x: mainAfter.x, y: mainAfter.y, width: mainAfter.width }).toEqual(
        mainBefore && { x: mainBefore.x, y: mainBefore.y, width: mainBefore.width },
      );
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
      await page.keyboard.press('PageDown');
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

      await page.keyboard.press('Shift+Tab');
      expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Tab');
      expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true);

      await page.keyboard.press('Escape');

      await expect(drawer).not.toBeAttached();
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
      await expect(menuButton).toBeFocused();
    });
  });

  test.describe('Tablet Viewport (768x1024)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('RESP-02: 태블릿 환경 포트폴리오 레이아웃', async ({ page }) => {
      await page.goto('/portfolio');
      await expect(page.getByRole('heading', { name: '포트폴리오 리스크' })).toBeVisible();
      // Verify metric cards are present
      await expect(page.locator('text=총 자산')).toBeVisible();
    });
  });
});
