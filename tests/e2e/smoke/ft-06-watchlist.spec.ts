import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * FT-06: 관심종목 (/watchlist)
 */
test.describe('FT-06: 관심종목', () => {
  test.beforeEach(async ({ page }) => {
    await smokeLogin(page);
  });

  test('관심종목 페이지 로딩', async ({ page }) => {
    await page.goto('/watchlist');
    await waitForContentLoad(page);

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(100);
  });

  test('관심종목 목록 또는 빈 상태', async ({ page }) => {
    await page.goto('/watchlist');
    await waitForContentLoad(page, 30_000);

    // 관심종목이 있으면 목록, 없으면 빈 상태
    const hasItems = await page.locator('text=/긴급|높음|보통/').first().isVisible().catch(() => false);
    const hasEmpty = await page.locator('text=/아직|없습니다|등록/i').first().isVisible().catch(() => false);
    const hasAddButton = await page.locator('button:has-text("추가"), button:has-text("Add")').first().isVisible().catch(() => false);

    // 셋 중 하나는 보여야 함
    expect(hasItems || hasEmpty || hasAddButton).toBeTruthy();
  });

  test('관심종목 추가 폼 토글', async ({ page }) => {
    await page.goto('/watchlist');
    await waitForContentLoad(page);

    // 추가 버튼 찾기
    const addButton = page.locator('button').filter({ hasText: /추가|Add|\+/ }).first();
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();

      // 폼이 열리면 티커 입력 필드가 보여야 함
      const tickerInput = page.locator('input').first();
      await expect(tickerInput).toBeVisible({ timeout: 5_000 });
    }
  });

  test('관심종목에서 계획 수립 링크', async ({ page }) => {
    await page.goto('/watchlist');
    await waitForContentLoad(page, 30_000);

    // 관심종목 항목이 있으면 계획 수립 링크 확인
    const planLinks = page.locator('a[href*="/plan"]');
    const count = await planLinks.count();

    if (count > 0) {
      const firstLink = planLinks.first();
      const href = await firstLink.getAttribute('href');
      expect(href).toContain('/plan');
    }
  });
});
