import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';
import { PortfolioPage } from './helpers/page-objects';

test.describe('Wave 6: Edge Cases (심화 테스트)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
  });

  test('EDGE-01: 포트폴리오 에지 케이스 — 집중도 초과 경고 (Warning Banners)', async ({ page }) => {
    // We override the portfolio mock to simulate an edge case (e.g. 50% sector exposure)
    await page.route('**/api/portfolio/risk*', async (route) => {
      const origResponse = route.request();
      if (origResponse.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              totalEquity: 50000,
              investedCapital: 25000,
              cash: 25000,
              cashPct: 50.0,
              totalOpenRisk: 2500,
              openRiskPct: 5.0, // HIGH RISK
              activePositions: 2,
              maxPositions: 10,
              sectorExposure: [
                { sector: "Technology", count: 2, exposure: 25000, exposurePct: 50.0 }
              ],
              positions: [],
              warnings: [
                '단일 섹터(Technology) 노출이 30%를 초과했습니다 (50.0%)',
                '총 오픈 리스크가 1%를 초과했습니다 (5.0%)'
              ]
            },
            meta: { source: 'e2e-mock-edge' }
          }),
        });
      } else {
        await route.fallback();
      }
    });

    const portfolioPage = new PortfolioPage(page);
    await portfolioPage.goto();

    // Check for warning banners
    const warnings = page.locator('[class*="amber"], [class*="red"]').filter({ hasText: /초과/ });
    await expect(warnings.first()).toBeVisible({ timeout: 10_000 });
  });

  test('EDGE-02: 매매 계획 에지 케이스 — SEPA Fail 시 저장 차단', async ({ page }) => {
    await page.goto('/plan?ticker=FAIL&exchange=NAS&autoAnalyze=1');

    // SEPA fail state should be visible
    await expect(page.getByText('저장 차단', { exact: true })).toBeVisible({ timeout: 15_000 });
    
    // Save button should be disabled
    const saveButton = page.locator('button:has-text("계획 저장")');
    if (await saveButton.isVisible()) {
      await expect(saveButton).toBeDisabled();
    }
  });
});
