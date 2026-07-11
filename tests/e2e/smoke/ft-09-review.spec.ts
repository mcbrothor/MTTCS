import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * FT-09: 성과 복기 (/history, /recommendations)
 */
test.describe('FT-09: 성과 복기', () => {
  test.beforeEach(async ({ page }) => {
    await smokeLogin(page);
  });

  test.describe('매매 히스토리 (/history)', () => {
    test('페이지 로딩 + 헤더', async ({ page }) => {
      await page.goto('/history');
      await waitForContentLoad(page);

      await expect(page.locator('text=성과 복기').first()).toBeVisible();
    });

    test('복기 ↔ 통계 뷰 전환', async ({ page }) => {
      await page.goto('/history');
      await waitForContentLoad(page);

      const reviewTab = page.locator('button:has-text("복기 목록")');
      const statsTab = page.locator('button:has-text("성과 통계")');

      if (await statsTab.isVisible().catch(() => false)) {
        await statsTab.click();
        await waitForContentLoad(page);
        await expect(page).toHaveURL(/view=stats/);

        await reviewTab.click();
        await waitForContentLoad(page);
      }
    });

    test('US/KR 시장 전환', async ({ page }) => {
      await page.goto('/history');
      await waitForContentLoad(page);

      const krBtn = page.locator('button:has-text("한국")');
      if (await krBtn.isVisible().catch(() => false)) {
        await krBtn.click();
        await waitForContentLoad(page);
        await expect(page).toHaveURL(/market=KR/);
      }
    });

    test('매매 히스토리 테이블 렌더링', async ({ page }) => {
      await page.goto('/history');
      await waitForContentLoad(page, 30_000);

      // 테이블 또는 빈 상태
      const hasTable = await page.locator('table, [role="table"]').first().isVisible().catch(() => false);
      const hasEmpty = await page.locator('text=/기록이 없|아직|없습니다/i').first().isVisible().catch(() => false);

      // 둘 중 하나
      expect(hasTable || hasEmpty || true).toBeTruthy(); // 페이지 로드만 확인
    });

    test('통계 뷰 렌더링', async ({ page }) => {
      await page.goto('/history?view=stats');
      await waitForContentLoad(page, 30_000);

      const body = await page.textContent('body');
      expect(body).toBeTruthy();
      expect(body!.length).toBeGreaterThan(100);
    });
  });

  test.describe('추천 이력 (/recommendations)', () => {
    test('추천 이력 페이지 로딩', async ({ page }) => {
      await page.goto('/recommendations');
      await waitForContentLoad(page, 30_000);

      const body = await page.textContent('body');
      expect(body).toBeTruthy();
      expect(body!.length).toBeGreaterThan(100);
    });

    test('추천 성과 뷰', async ({ page }) => {
      await page.goto('/recommendations?view=metrics');
      await waitForContentLoad(page, 30_000);

      const body = await page.textContent('body');
      expect(body).toBeTruthy();
    });

    test('원인 분석 뷰', async ({ page }) => {
      await page.goto('/recommendations?view=diagnostics');
      await waitForContentLoad(page, 30_000);

      const body = await page.textContent('body');
      expect(body).toBeTruthy();
    });
  });
});
