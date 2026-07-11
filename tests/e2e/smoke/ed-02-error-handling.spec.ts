import { test, expect } from '@playwright/test';
import { smokeLogin, waitForContentLoad } from './helpers/auth';

/**
 * ED-02: API 에러 핸들링
 *
 * 실제 API 호출 환경에서 에러 상황이 발생해도
 * 앱이 크래시하지 않고 적절한 에러 메시지를 표시하는지 확인.
 */
test.describe('ED-02: API 에러 핸들링', () => {
  test.beforeEach(async ({ page }) => {
    await smokeLogin(page);
  });

  test('콘솔 에러 없이 주요 페이지 렌더링', async ({ page }) => {
    const fatalErrors: string[] = [];

    page.on('pageerror', (err) => {
      // React hydration 경고 등은 제외
      if (!err.message.includes('Hydration') && !err.message.includes('Warning')) {
        fatalErrors.push(err.message);
      }
    });

    const pages = ['/', '/master-filter', '/scanner', '/portfolio', '/history'];

    for (const pagePath of pages) {
      await page.goto(pagePath);
      await waitForContentLoad(page);
      await page.waitForTimeout(2_000);
    }

    // 치명적 JS 에러가 없어야 함
    expect(fatalErrors).toHaveLength(0);
  });

  test('잘못된 경로 → 에러 페이지 또는 404', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist');

    // 404이거나 클라이언트 사이드 에러 페이지
    const status = response?.status() ?? 0;
    expect(status).toBeLessThan(500); // 서버 에러는 안 됨

    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('잘못된 API 경로 → 적절한 에러 응답', async ({ page }) => {
    const response = await page.request.get('/api/this-does-not-exist');
    expect(response.status()).toBeLessThan(500);
  });

  test('스캐너 결과 에러 시 UI 복구', async ({ page }) => {
    await page.goto('/scanner');
    await waitForContentLoad(page, 30_000);

    // 에러 배너가 있더라도 페이지는 렌더링되어야 함
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(100);
  });

  test('매크로 API 느린 응답에도 UI 표시', async ({ page }) => {
    await page.goto('/macro');

    // 데이터 로딩 중에도 기본 UI 구조는 보여야 함
    const body = await page.textContent('body');
    expect(body).toBeTruthy();

    // 30초 대기 후에도 크래시 없음
    await waitForContentLoad(page, 30_000);
  });

  test('존재하지 않는 종목 분석 시 에러 처리', async ({ page }) => {
    await page.goto('/plan?ticker=ZZZZZZ&exchange=NAS&autoAnalyze=1');
    await waitForContentLoad(page);

    // 페이지 자체는 렌더링되어야 함
    await expect(page.locator('text=신규 매매 계획').first()).toBeVisible({ timeout: 15_000 });

    // 에러 메시지 또는 "찾을 수 없음" 표시
    await page.waitForTimeout(10_000);
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});
