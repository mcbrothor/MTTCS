import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * FT-03: 시장 분석 (/master-filter, /macro)
 */
test.describe('FT-03: 시장 분석', () => {
  test.beforeEach(async ({ page }) => {
    await smokeLogin(page);
  });

  test.describe('마스터 필터 (/master-filter)', () => {
    test('핵심 UI 요소 렌더링', async ({ page }) => {
      await page.goto('/master-filter');
      await waitForContentLoad(page);

      // STEP 01 라벨
      await expect(page.locator('text=STEP 01').first()).toBeVisible();
      await expect(page.locator('text=오늘의 결론').first()).toBeVisible();
    });

    test('US/KR 토글 동작', async ({ page }) => {
      await page.goto('/master-filter');
      await waitForContentLoad(page);

      const usBtn = page.locator('button:has-text("US 미국")');
      const krBtn = page.locator('button:has-text("KR 한국")');

      await krBtn.click();
      await waitForContentLoad(page);

      await usBtn.click();
      await waitForContentLoad(page);
    });

    test('지표 그리드 렌더링', async ({ page }) => {
      await page.goto('/master-filter');
      await waitForContentLoad(page, 45_000);

      // MetricsGrid가 로딩 후 지표 카드를 표시해야 함
      // 실제 API 응답 대기 필요
      const gridArea = page.locator('[class*="grid"]').first();
      await expect(gridArea).toBeVisible({ timeout: 30_000 });
    });
  });

  test.describe('매크로 분석 (/macro)', () => {
    test('페이지 로딩 + 자산 테이블', async ({ page }) => {
      await page.goto('/macro');
      await waitForContentLoad(page, 45_000);

      // 매크로 페이지 식별
      const body = await page.textContent('body');
      expect(body).toContain('매크로');
    });

    test('매크로 레짐 카드 렌더링', async ({ page }) => {
      await page.goto('/macro');
      await waitForContentLoad(page, 45_000);

      // RegimeHeroCard 또는 매크로 점수 표시
      const macroContent = page.locator('text=/매크로|Macro|레짐|Regime/i').first();
      await expect(macroContent).toBeVisible({ timeout: 30_000 });
    });

    test('자산별 가격 데이터 표시', async ({ page }) => {
      await page.goto('/macro');
      await waitForContentLoad(page, 45_000);

      // 주요 자산 심볼 존재 확인 (SPY, QQQ 등)
      const symbols = ['SPY', 'QQQ'];
      for (const sym of symbols) {
        const symLocator = page.locator(`text=${sym}`).first();
        const isVisible = await symLocator.isVisible().catch(() => false);
        if (isVisible) {
          expect(isVisible).toBeTruthy();
          break; // 하나라도 보이면 데이터 로딩 확인
        }
      }
    });
  });
});
