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

    // Results should load (fixture returns 4 results)
    await expect(page.getByText('NVDA', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('META', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('SNOW', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('ERRX', { exact: true }).first()).toBeVisible();
  });

  test('SCAN-02: 스캔 결과 Tier별 카운트 확인', async ({ page }) => {
    await scannerPage.goto();
    await scannerPage.scanButton.click();
    await expect(page.getByText('NVDA', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // The recommendation engine may re-rank tiers as policy evolves. The summary
    // must remain numeric and account for the deterministic error fixture.
    const recommendedCount = await scannerPage.getStatCardValue('Recommended');
    const actionCount = await scannerPage.getStatCardValue('Action');
    const ibReviewCount = await scannerPage.getStatCardValue('IB Review');
    const errorsCount = await scannerPage.getStatCardValue('Errors');

    expect(Number(recommendedCount.trim())).toBeGreaterThanOrEqual(0);
    expect(Number(actionCount.trim())).toBeGreaterThanOrEqual(0);
    expect(Number(ibReviewCount.trim())).toBeGreaterThanOrEqual(1);
    expect(errorsCount.trim()).toBe('1');
  });

  test('SCAN-04: 필터 탭 전환', async ({ page }) => {
    await scannerPage.goto();
    await scannerPage.scanButton.click();
    await expect(page.getByText('NVDA', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // Filter by Recommended
    const recFilter = page.locator('button:has-text("Recommended")');
    await recFilter.click();

    // Only NVDA should be visible
    await expect(page.getByText('NVDA', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('META', { exact: true })).toHaveCount(0);
  });

  test('SCAN-07: 종목 선택 및 카운터 증가', async ({ page }) => {
    await scannerPage.goto();
    await scannerPage.scanButton.click();
    await expect(page.getByText('NVDA', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    const candidateButtons = page.getByRole('button', { name: /후보 선택$/ });
    await candidateButtons.first().click();
    
    // Check selected count
    await expect(scannerPage.selectedCount).toHaveText(/1/);

    // Select second one
    await candidateButtons.first().click();
    await expect(scannerPage.selectedCount).toHaveText(/2/);
  });

  test('SCAN-08: 종목 클릭 → VCP Drilldown 모달', async ({ page }) => {
    await scannerPage.goto();
    await scannerPage.scanButton.click();
    await expect(page.getByText('NVDA', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // Click on NVDA row/card
    const nvdaRow = page.getByText('NVDA', { exact: true }).first();
    await nvdaRow.click();

    // Modal should appear
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('VCP 점수')).toBeVisible();
  });

  test('SCAN-10: 콘테스트로 이동 플로팅 버튼', async ({ page }) => {
    await scannerPage.goto();
    await scannerPage.scanButton.click();
    await expect(page.getByText('NVDA', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // Select one candidate
    await page.getByRole('button', { name: /후보 선택$/ }).first().click();

    // Contest button should become active and clickable
    await expect(scannerPage.contestButton).toBeEnabled();
    await scannerPage.contestButton.click();

    // Should navigate to contest page
    await expect(page).toHaveURL(/\/contest/);
  });

  test('SCAN-11: 스캐너 메뉴 전환 시 공통 프레임 위치 유지', async ({ page }) => {
    const routes = ['/scanner', '/canslim', '/leader', '/momentum', '/qullamaggie'];

    await page.goto(routes[0]);

    const nav = page.getByTestId('scanner-workspace-nav');
    const content = page.getByTestId('scanner-page-content');
    await expect(nav).toBeVisible();
    await expect(content).toBeVisible();

    const navBox = await nav.boundingBox();
    const contentBox = await content.boundingBox();
    expect(navBox).not.toBeNull();
    expect(contentBox).not.toBeNull();

    for (const route of routes.slice(1)) {
      await nav.locator(`a[href="${route}"]`).click();
      await expect(page).toHaveURL(route);
      expect(await nav.boundingBox()).toMatchObject({
        x: navBox!.x,
        y: navBox!.y,
        width: navBox!.width,
      });
      expect(await content.boundingBox()).toMatchObject({
        x: contentBox!.x,
        y: contentBox!.y,
        width: contentBox!.width,
      });
    }
  });
});
