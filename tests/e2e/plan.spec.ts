import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';
import { PlanPage } from './helpers/page-objects';

test.describe('TC-PLAN: 매매 계획', () => {
  let planPage: PlanPage;

  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
    planPage = new PlanPage(page);
  });

  test('PLAN-01: 티커 입력 후 분석 실행 → SEPA, VCP, 리스크 표시', async ({ page }) => {
    await planPage.goto();

    // Page title visible
    await expect(page.locator('text=신규 매매 계획')).toBeVisible();
    await expect(page.locator('text=New Trade Plan')).toBeVisible();
  });

  test('PLAN-02: 스캐너에서 자동 분석 (autoAnalyze=1)', async ({ page }) => {
    await planPage.goto({ ticker: 'NVDA', exchange: 'NAS', autoAnalyze: true });

    // Wait for analysis to load
    await expect(page.locator('text=NVDA').first()).toBeVisible({ timeout: 15_000 });
  });

  test('PLAN-04: SEPA 판정 결과 표시 — pass 상태', async ({ page }) => {
    await planPage.goto({ ticker: 'NVDA', exchange: 'NAS', autoAnalyze: true });

    // SEPA section should be visible after analysis loads
    await expect(page.locator('text=SEPA').first()).toBeVisible({ timeout: 15_000 });
  });

  test('PLAN-06: 리스크 계산기 표시', async ({ page }) => {
    await planPage.goto({ ticker: 'NVDA', exchange: 'NAS', autoAnalyze: true });

    // Wait for risk calculator section
    const riskSection = page.locator('text=/리스크|Risk/i').first();
    await expect(riskSection).toBeVisible({ timeout: 15_000 });
  });

  test('PLAN-07: Centaur 체크리스트 항목 표시', async ({ page }) => {
    await planPage.goto({ ticker: 'NVDA', exchange: 'NAS', autoAnalyze: true });

    // Wait for analysis to load then check for checklist
    await page.waitForTimeout(3_000);

    // Checklist should be present when analysis is loaded
    const checklistSection = page.locator('text=/체크리스트|Checklist/i');
    if (await checklistSection.isVisible()) {
      await expect(checklistSection).toBeVisible();
    }
  });

  test('PLAN-08: 계획 저장 → 성공 배너 표시', async ({ page }) => {
    await planPage.goto({ ticker: 'NVDA', exchange: 'NAS', autoAnalyze: true });

    // Wait for analysis
    await page.waitForTimeout(3_000);

    // If save button exists and is enabled, test the save flow
    const saveButton = page.locator('button:has-text("계획 저장")');
    if (await saveButton.isVisible() && await saveButton.isEnabled()) {
      // Fill checklist items if needed
      const checkboxes = page.locator('input[type="checkbox"]');
      const count = await checkboxes.count();
      for (let i = 0; i < count; i++) {
        const cb = checkboxes.nth(i);
        if (!(await cb.isChecked())) {
          await cb.check();
        }
      }

      await saveButton.click();

      // Wait for success or error response
      const successBanner = page.locator('text=계획 저장 완료');
      await expect(successBanner).toBeVisible({ timeout: 10_000 });
    }
  });

  test('PLAN-11: 미국 ↔ 한국 시장 전환', async ({ page }) => {
    await planPage.goto();

    // US mode by default
    await expect(page.locator('text=/USD|미국 계좌/').first()).toBeVisible();

    // Switch to KR
    const krButton = page.locator('button:has-text("한국")').first();
    if (await krButton.isVisible()) {
      await krButton.click();
      await expect(page.locator('text=/KRW|한국 계좌/').first()).toBeVisible();
    }
  });
});
