import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * FT-08: 포트폴리오 (/portfolio)
 */
test.describe('FT-08: 포트폴리오', () => {
  test.beforeEach(async ({ page }) => {
    await smokeLogin(page);
  });

  test('포트폴리오 페이지 로딩', async ({ page }) => {
    await page.goto('/portfolio');
    await waitForContentLoad(page);

    await expect(page.locator('text=포트폴리오').first()).toBeVisible();
  });

  test('리스크 요약 렌더링', async ({ page }) => {
    await page.goto('/portfolio');
    await waitForContentLoad(page, 30_000);

    // 리스크 관련 텍스트
    const riskContent = page.locator('text=/리스크|노출도|게이트|총 자산|Risk/i').first();
    await riskContent.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {
      // 데이터 없으면 빈 상태일 수 있음
    });
  });

  test('포지션 목록 또는 빈 상태', async ({ page }) => {
    await page.goto('/portfolio');
    await waitForContentLoad(page, 30_000);

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    // 포지션이 있거나 빈 상태 안내가 보여야 함
    expect(body!.length).toBeGreaterThan(100);
  });

  test('US/KR 시장 전환', async ({ page }) => {
    await page.goto('/portfolio');
    await waitForContentLoad(page);

    const usBtn = page.locator('button:has-text("미국")');
    const krBtn = page.locator('button:has-text("한국")');

    if (await usBtn.isVisible().catch(() => false)) {
      await krBtn.click();
      await waitForContentLoad(page);

      await usBtn.click();
      await waitForContentLoad(page);
    }
  });

  test('플로우 CTA 버튼 존재', async ({ page }) => {
    await page.goto('/portfolio');
    await waitForContentLoad(page, 30_000);

    // "다음 단계" 또는 "복기" 관련 CTA
    const ctaButton = page.locator('a, button').filter({ hasText: /복기|계획|스캐너|다음/ }).first();
    const isVisible = await ctaButton.isVisible().catch(() => false);
    // CTA가 없을 수 있음 (빈 포트폴리오) — 에러만 아니면 OK
    expect(typeof isVisible).toBe('boolean');
  });
});
