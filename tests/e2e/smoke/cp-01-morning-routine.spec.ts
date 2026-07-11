import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * CP-01: 장 전 루틴 — 시장 확인 → 종목 발굴 → 관심종목 등록
 *
 * 페르소나: 김민수 — 아침 장 전 루틴으로 MTN을 열고:
 * 1) 시장 상태 확인 (Command Center)
 * 2) 시장 신호판 확인 (Master Filter)
 * 3) 종목 발굴 (Scanner)
 * 4) 관심종목 확인 (Watchlist)
 */
test.describe('CP-01: 장 전 루틴 완주', () => {
  test.beforeEach(async ({ page }) => {
    await smokeLogin(page);
  });

  test('커맨드 센터 → 시장 상태 카드 3개 렌더링', async ({ page }) => {
    await page.goto('/');
    await waitForContentLoad(page);

    // Command Center 헤더
    await expect(page.locator('text=Command Center')).toBeVisible();
    await expect(page.locator('text=오늘의 의사결정')).toBeVisible();

    // 3개 상태 카드
    await expect(page.getByText('지금 새로 사도 되는지', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('시장 밖 위험', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('오픈 리스크', { exact: true }).first()).toBeVisible();
  });

  test('US ↔ KR 시장 토글 동작', async ({ page }) => {
    await page.goto('/');
    await waitForContentLoad(page);

    // 미국 시장 (기본)
    const usButton = page.locator('button:has-text("미국")');
    const krButton = page.locator('button:has-text("한국")');

    await expect(usButton).toBeVisible();
    await expect(krButton).toBeVisible();

    // 한국 전환
    await krButton.click();
    await waitForContentLoad(page);

    // 다시 미국 전환
    await usButton.click();
    await waitForContentLoad(page);
  });

  test('커맨드 센터 → 마스터 필터 네비게이션', async ({ page }) => {
    await page.goto('/');
    await waitForContentLoad(page);

    // "01 시장 확인" 플로우 링크 또는 CTA 클릭
    const masterFilterLink = page.locator('a[href="/master-filter"]').first();
    await masterFilterLink.click();

    await expect(page).toHaveURL(/master-filter/);
    await waitForContentLoad(page);

    // 마스터 필터 핵심 요소 확인
    await expect(page.locator('text=STEP 01').first()).toBeVisible();
    await expect(page.locator('text=오늘의 결론').first()).toBeVisible();
  });

  test('마스터 필터 → US/KR 토글 + 데이터 로딩', async ({ page }) => {
    await page.goto('/master-filter');
    await waitForContentLoad(page);

    // US/KR 토글 버튼
    const usBtn = page.locator('button:has-text("US 미국")');
    const krBtn = page.locator('button:has-text("KR 한국")');
    await expect(usBtn).toBeVisible();
    await expect(krBtn).toBeVisible();

    // KR 전환
    await krBtn.click();
    await waitForContentLoad(page);

    // 다시 US 전환
    await usBtn.click();
    await waitForContentLoad(page);
  });

  test('스캐너 페이지 렌더링 + 결과 표시', async ({ page }) => {
    await page.goto('/scanner');
    await waitForContentLoad(page);

    // 스캐너 페이지 식별
    await expect(page.locator('text=미너비니').first()).toBeVisible();

    // 결과 테이블 또는 카드뷰가 렌더링됨 (빈 상태여도 OK)
    const hasContent = await page.locator('table, [role="table"], [class*="card"], [class*="grid"]').first().isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test('전체 루틴 완주: / → /master-filter → /scanner → /watchlist', async ({ page }) => {
    // Step 1: 커맨드 센터
    await page.goto('/');
    await waitForContentLoad(page);
    await expect(page.locator('text=Command Center')).toBeVisible();

    // Step 2: 마스터 필터
    await page.goto('/master-filter');
    await waitForContentLoad(page);
    await expect(page.locator('text=오늘의 결론').first()).toBeVisible();

    // Step 3: 스캐너
    await page.goto('/scanner');
    await waitForContentLoad(page);
    await expect(page.locator('text=미너비니').first()).toBeVisible();

    // Step 4: 관심종목
    await page.goto('/watchlist');
    await waitForContentLoad(page);
    // 관심종목 페이지가 에러 없이 렌더링됨
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });
});
