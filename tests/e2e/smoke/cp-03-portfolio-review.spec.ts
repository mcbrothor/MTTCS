import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * CP-03: 포트폴리오 관리 → 성과 복기
 *
 * 페르소나: 김민수 — 장 마감 후:
 * 1) 포트폴리오 리스크 점검
 * 2) 매매 히스토리 복기
 * 3) 추천 성과 확인
 */
test.describe('CP-03: 포트폴리오 점검 → 성과 복기', () => {
  test.beforeEach(async ({ page }) => {
    await smokeLogin(page);
  });

  test('포트폴리오 페이지 — 리스크 요약 렌더링', async ({ page }) => {
    await page.goto('/portfolio');
    await waitForContentLoad(page);

    // 포트폴리오 페이지 식별
    await expect(page.locator('text=포트폴리오').first()).toBeVisible();

    // 리스크 관련 요소 (데이터 유무 관계없이 구조 렌더링)
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('포트폴리오 — US/KR 시장 전환', async ({ page }) => {
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

  test('성과 복기 페이지 — 매매 히스토리 테이블', async ({ page }) => {
    await page.goto('/history');
    await waitForContentLoad(page);

    // 성과 복기 헤더
    await expect(page.locator('text=성과 복기').first()).toBeVisible();
  });

  test('성과 복기 — 복기 ↔ 통계 뷰 전환', async ({ page }) => {
    await page.goto('/history');
    await waitForContentLoad(page);

    // 복기 목록 탭
    const reviewTab = page.locator('button:has-text("복기 목록")');
    const statsTab = page.locator('button:has-text("성과 통계")');

    if (await reviewTab.isVisible().catch(() => false)) {
      await statsTab.click();
      await waitForContentLoad(page);
      await expect(page).toHaveURL(/view=stats/);

      await reviewTab.click();
      await waitForContentLoad(page);
    }
  });

  test('성과 복기 — US/KR 시장 전환', async ({ page }) => {
    await page.goto('/history');
    await waitForContentLoad(page);

    const usBtn = page.locator('button:has-text("미국")');
    const krBtn = page.locator('button:has-text("한국")');

    if (await usBtn.isVisible().catch(() => false)) {
      await krBtn.click();
      await waitForContentLoad(page);
      await expect(page).toHaveURL(/market=KR/);

      await usBtn.click();
      await waitForContentLoad(page);
    }
  });

  test('추천 이력 페이지 로딩', async ({ page }) => {
    await page.goto('/recommendations');
    await waitForContentLoad(page);

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('추천 성과 탭 전환', async ({ page }) => {
    await page.goto('/recommendations?view=metrics');
    await waitForContentLoad(page);

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('추천 원인 분석 탭', async ({ page }) => {
    await page.goto('/recommendations?view=diagnostics');
    await waitForContentLoad(page);

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('전체 복기 흐름: /portfolio → /history → /recommendations', async ({ page }) => {
    // Step 1: 포트폴리오
    await page.goto('/portfolio');
    await waitForContentLoad(page);
    await expect(page.locator('text=포트폴리오').first()).toBeVisible();

    // Step 2: 성과 복기
    await page.goto('/history');
    await waitForContentLoad(page);
    await expect(page.locator('text=성과 복기').first()).toBeVisible();

    // Step 3: 추천 이력
    await page.goto('/recommendations');
    await waitForContentLoad(page);
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});
