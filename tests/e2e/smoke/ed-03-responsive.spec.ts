import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * ED-03: 반응형 & 모바일 레이아웃
 *
 * Playwright 제약: test.use({ ...devices[...] }) 는 중첩 describe에서
 * defaultBrowserType을 변경할 수 없으므로, viewport만 직접 설정합니다.
 */
test.describe('ED-03: 반응형 레이아웃', () => {
  test.describe('모바일 뷰포트 (375x812)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('모바일 — 커맨드 센터 렌더링', async ({ page }) => {
      await smokeLogin(page);
      await page.goto('/');
      await waitForContentLoad(page);

      await expect(page.locator('text=Command Center')).toBeVisible();
    });

    test('모바일 — 하단 탭바 표시', async ({ page }) => {
      await smokeLogin(page);
      await page.goto('/');
      await waitForContentLoad(page);

      // 모바일 네비게이션 확인
      const mobileNav = page.locator('text=오늘').first();
      await expect(mobileNav).toBeVisible();
    });

    test('모바일 — 마스터 필터 렌더링', async ({ page }) => {
      await smokeLogin(page);
      await page.goto('/master-filter');
      await waitForContentLoad(page);

      const body = await page.textContent('body');
      expect(body).toBeTruthy();
      expect(body!.length).toBeGreaterThan(100);
    });

    test('모바일 — 스캐너 페이지 렌더링', async ({ page }) => {
      await smokeLogin(page);
      await page.goto('/scanner');
      await waitForContentLoad(page);

      const body = await page.textContent('body');
      expect(body).toBeTruthy();
      expect(body!.length).toBeGreaterThan(100);
    });

    test('모바일 — 매매 계획 렌더링', async ({ page }) => {
      await smokeLogin(page);
      await page.goto('/plan');
      await waitForContentLoad(page);

      await expect(page.locator('text=신규 매매 계획').first()).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('태블릿 뷰포트 (1024x768)', () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test('태블릿 — 커맨드 센터 렌더링', async ({ page }) => {
      await smokeLogin(page);
      await page.goto('/');
      await waitForContentLoad(page);

      await expect(page.locator('text=Command Center')).toBeVisible();
    });

    test('태블릿 — 스캐너 레이아웃', async ({ page }) => {
      await smokeLogin(page);
      await page.goto('/scanner');
      await waitForContentLoad(page);

      const body = await page.textContent('body');
      expect(body).toBeTruthy();
    });
  });

  test.describe('데스크톱 와이드 뷰포트', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test('와이드 — 모든 주요 페이지 렌더링', async ({ page }) => {
      await smokeLogin(page);

      const pages = ['/', '/master-filter', '/scanner', '/contest', '/watchlist', '/plan', '/portfolio', '/history'];

      for (const pagePath of pages) {
        const response = await page.goto(pagePath);
        expect(response?.status()).toBeLessThan(500);

        const body = await page.textContent('body');
        expect(body).toBeTruthy();
        expect(body!.length).toBeGreaterThan(50);
      }
    });
  });
});
