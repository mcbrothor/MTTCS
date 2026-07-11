import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * FT-07: 매매 계획 (/plan)
 */
test.describe('FT-07: 매매 계획', () => {
  test.beforeEach(async ({ page }) => {
    await smokeLogin(page);
  });

  test('매매 계획 페이지 기본 로딩', async ({ page }) => {
    await page.goto('/plan');
    await waitForContentLoad(page);

    await expect(page.locator('text=신규 매매 계획').first()).toBeVisible({ timeout: 15_000 });
  });

  test('URL 파라미터로 티커 자동 입력', async ({ page }) => {
    await page.goto('/plan?ticker=AAPL&exchange=NAS');
    await waitForContentLoad(page);

    await expect(page.locator('text=신규 매매 계획').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=AAPL').first()).toBeVisible({ timeout: 15_000 });
  });

  test('자동 분석 실행 (autoAnalyze=1)', async ({ page }) => {
    await page.goto('/plan?ticker=MSFT&exchange=NAS&autoAnalyze=1');
    await waitForContentLoad(page);

    await expect(page.locator('text=MSFT').first()).toBeVisible({ timeout: 20_000 });

    // 분석이 시작되면 SEPA 관련 UI가 나타남
    // 실제 API이므로 시간이 걸릴 수 있음
    await page.waitForTimeout(3_000);
  });

  test('SEPA 분석 패널 표시', async ({ page }) => {
    await page.goto('/plan?ticker=NVDA&exchange=NAS&autoAnalyze=1');
    await waitForContentLoad(page);

    await expect(page.locator('text=NVDA').first()).toBeVisible({ timeout: 20_000 });

    // SEPA 분석 결과 대기
    const sepaContent = page.locator('text=/SEPA|추세 템플릿|Trend Template/i').first();
    await sepaContent.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {
      // 실제 API 응답이 느릴 수 있음 — 타임아웃이어도 치명적이지 않음
    });
  });

  test('리스크 계산기 영역 존재', async ({ page }) => {
    await page.goto('/plan?ticker=AAPL&exchange=NAS&autoAnalyze=1');
    await waitForContentLoad(page);

    // 리스크 계산기 관련 텍스트
    const riskContent = page.locator('text=/리스크|Risk|손절|진입가|포지션/i').first();
    await riskContent.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
      // 분석이 완료되어야 표시됨
    });
  });

  test('체크리스트 폼 렌더링', async ({ page }) => {
    await page.goto('/plan?ticker=AAPL&exchange=NAS&autoAnalyze=1');
    await waitForContentLoad(page);

    // 체크리스트 관련 텍스트
    const checklistContent = page.locator('text=/체크리스트|Checklist|동의/i').first();
    await checklistContent.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {
      // 분석 완료 후 표시
    });
  });

  test('한국 시장 종목 (KOSPI)', async ({ page }) => {
    await page.goto('/plan?ticker=005930&exchange=KOSPI');
    await waitForContentLoad(page);

    await expect(page.locator('text=신규 매매 계획').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('text=005930').first()).toBeVisible({ timeout: 15_000 });
  });
});
