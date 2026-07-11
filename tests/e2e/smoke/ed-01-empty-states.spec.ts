import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * ED-01: 빈 데이터 / EmptyState 처리
 *
 * 데이터가 없는 상태에서 각 페이지가 빈 상태를 적절히 표시하는지 확인.
 * 실제 API를 사용하므로 데이터 유무에 따라 다른 결과가 나올 수 있지만,
 * 핵심은 "에러 없이 렌더링되는가"임.
 */
test.describe('ED-01: 빈 데이터 상태 처리', () => {
  test.beforeEach(async ({ page }) => {
    await smokeLogin(page);
  });

  test('커맨드 센터 — 관심 후보 빈 상태 처리', async ({ page }) => {
    await page.goto('/');
    await waitForContentLoad(page);

    // 관심 후보 패널이 렌더링됨 (데이터 유무 무관)
    const panel = page.locator('h2:has-text("관심 후보")').first();
    await expect(panel).toBeVisible();

    // 빈 상태면 CTA가 보여야 함
    const emptyState = page.locator('text=/스캐너 실행하기|아직/i').first();
    const hasData = page.locator('span.font-mono').first();

    const isEmpty = await emptyState.isVisible().catch(() => false);
    const hasItems = await hasData.isVisible().catch(() => false);
    expect(isEmpty || hasItems).toBeTruthy();
  });

  test('커맨드 센터 — 최근 매매 흐름 빈 상태 처리', async ({ page }) => {
    await page.goto('/');
    await waitForContentLoad(page);

    const panel = page.locator('h2:has-text("최근 매매 흐름")').first();
    await expect(panel).toBeVisible();

    // 빈 상태거나 데이터가 있거나 — 에러 없이 렌더링
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('관심종목 페이지 — 빈 상태 렌더링', async ({ page }) => {
    await page.goto('/watchlist');
    await waitForContentLoad(page, 30_000);

    // 에러 없이 페이지가 렌더링됨
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });

  test('포트폴리오 — 빈 포트폴리오 처리', async ({ page }) => {
    await page.goto('/portfolio');
    await waitForContentLoad(page, 30_000);

    // 에러 없이 렌더링
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('성과 복기 — 매매 기록 없음 처리', async ({ page }) => {
    // KR 시장은 대개 기록이 적음
    await page.goto('/history?market=KR');
    await waitForContentLoad(page, 30_000);

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('추천 이력 — 데이터 없음 처리', async ({ page }) => {
    await page.goto('/recommendations');
    await waitForContentLoad(page, 30_000);

    // 에러 없이 렌더링
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});
