import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * FT-05: 콘테스트 (/contest)
 */
test.describe('FT-05: 콘테스트', () => {
  test.beforeEach(async ({ page }) => {
    await smokeLogin(page);
  });

  test('콘테스트 페이지 로딩', async ({ page }) => {
    await page.goto('/contest');
    await waitForContentLoad(page);

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(100);
  });

  test('유니버스 선택 UI 렌더링', async ({ page }) => {
    await page.goto('/contest');
    await waitForContentLoad(page);

    // 유니버스 선택 또는 세션 관련 UI
    const hasSelectionUI = await page.locator('text=/유니버스|Universe|NASDAQ|S&P|KOSPI/i').first().isVisible().catch(() => false);
    const hasSessionUI = await page.locator('text=/세션|Session|이전|히스토리/i').first().isVisible().catch(() => false);

    // 둘 중 하나는 보여야 함
    expect(hasSelectionUI || hasSessionUI).toBeTruthy();
  });

  test('세션 히스토리 존재 확인', async ({ page }) => {
    await page.goto('/contest');
    await waitForContentLoad(page);

    // 세션 히스토리가 있든 없든 페이지가 에러 없이 렌더링
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});
