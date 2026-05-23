import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';
import { ScannerPage } from './helpers/page-objects';

test.describe('TC-SCAN: 미너비니 스크리너', () => {
  let scannerPage: ScannerPage;

  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
    scannerPage = new ScannerPage(page);
  });

  test('SCAN-01: Universe 선택 후 스캔 시작 → 결과 렌더링', async ({ page }) => {
    await scannerPage.goto();

    // Check header
    await expect(page.locator('text=미너비니 스크리너')).toBeVisible();

    // Click scan button
    await scannerPage.scanButton.click();

    // Progress bar should appear
    await expect(page.locator('text=/Scan Progress|스캔 진행율/')).toBeVisible();

    // Results should load (fixture returns 4 results)
    await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=META')).toBeVisible();
    await expect(page.locator('text=SNOW')).toBeVisible();
    await expect(page.locator('text=ERRX')).toBeVisible();
  });

  test('SCAN-02: 스캔 결과 Tier별 카운트 확인', async ({ page }) => {
    await scannerPage.goto();
    await scannerPage.scanButton.click();
    await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });

    // Our fixture has 1 Recommended, 1 Action, 1 IB Review, 1 Errors
    // Cards should display these numbers
    const recommendedCount = await scannerPage.getStatCardValue('Recommended');
    const actionCount = await scannerPage.getStatCardValue('Action');
    const ibReviewCount = await scannerPage.getStatCardValue('IB Review');
    const errorsCount = await scannerPage.getStatCardValue('Errors');

    expect(recommendedCount.trim()).toBe('1');
    expect(actionCount.trim()).toBe('1');
    expect(ibReviewCount.trim()).toBe('1');
    expect(errorsCount.trim()).toBe('1');
  });

  test('SCAN-04: 필터 탭 전환', async ({ page }) => {
    await scannerPage.goto();
    await scannerPage.scanButton.click();
    await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });

    // Filter by Recommended
    const recFilter = page.locator('button:has-text("Recommended")');
    await recFilter.click();

    // Only NVDA should be visible
    await expect(page.locator('text=NVDA')).toBeVisible();
    await expect(page.locator('text=META')).not.toBeVisible();
  });

  test('SCAN-07: 종목 선택 및 카운터 증가', async ({ page }) => {
    await scannerPage.goto();
    await scannerPage.scanButton.click();
    await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });

    // Checkboxes should exist for valid candidates
    const checkboxes = page.locator('input[type="checkbox"]');
    
    // Select first one
    await checkboxes.first().check();
    
    // Check selected count
    await expect(scannerPage.selectedCount).toHaveText(/1/);

    // Select second one
    await checkboxes.nth(1).check();
    await expect(scannerPage.selectedCount).toHaveText(/2/);
  });

  test('SCAN-08: 종목 클릭 → VCP Drilldown 모달', async ({ page }) => {
    await scannerPage.goto();
    await scannerPage.scanButton.click();
    await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });

    // Click on NVDA row/card
    const nvdaRow = page.locator('text=NVDA').first();
    await nvdaRow.click();

    // Modal should appear
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('text=VCP Analysis')).toBeVisible();
  });

  test('SCAN-10: 콘테스트로 이동 플로팅 버튼', async ({ page }) => {
    await scannerPage.goto();
    await scannerPage.scanButton.click();
    await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });

    // Select one candidate
    await page.locator('input[type="checkbox"]').first().check();

    // Contest button should become active and clickable
    await expect(scannerPage.contestButton).toBeEnabled();
    await scannerPage.contestButton.click();

    // Should navigate to contest page
    await expect(page).toHaveURL(/\/contest/);
  });
});
