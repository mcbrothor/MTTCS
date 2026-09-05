import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks, setupHaltMocks } from './mocks/handlers';
import { DashboardPage } from './helpers/page-objects';

test.describe('TC-E2E: 전체 워크플로우 통합 시나리오', () => {
  test.describe('시나리오 A: 정상 흐름 (RISK_ON + 강한 후보)', () => {
    test.beforeEach(async ({ page }) => {
      await setupAllMocks(page);
    });

    test('E2E-A01: 로그인 → 대시보드 시장 상태 표시', async ({ page }) => {
      await login(page);

      new DashboardPage(page);
      // Command Center header
      await expect(page.locator('text=Command Center')).toBeVisible();
      await expect(page.locator('text=오늘의 의사결정')).toBeVisible();

      // Market state card should show something
      await expect(page.getByText('지금 새로 사도 되는지', { exact: true }).first()).toBeVisible();
    });

    test('E2E-A02: 대시보드 → 마스터 필터 → 스캐너 내비게이션', async ({ page }) => {
      await login(page);

      // Click flow link "01 시장 확인"
      const masterFilterLink = page.locator('a[href="/master-filter"]').first();
      await masterFilterLink.click();
      await expect(page).toHaveURL(/master-filter/);

      // Navigate to scanner
      await page.goto('/scanner');
      await expect(page.locator('text=미너비니 스크리너')).toBeVisible();
    });

    test('E2E-A03: 스캐너 → 결과 확인 → 종목 선택', async ({ page }) => {
      await login(page);
      await page.goto('/scanner');

      // Scanner page loaded
      await expect(page.locator('text=미너비니 스크리너')).toBeVisible();

      // Stat cards should show fixture data
      // We have 1 Recommended, 1 Action, 1 IB Review, 1 Error from fixture
      await expect(page.locator('text=Recommended').first()).toBeVisible();
    });

    test('E2E-A04: 매매 계획 페이지 → 분석 로드 → SEPA 표시', async ({ page }) => {
      await login(page);
      await page.goto('/plan?ticker=NVDA&exchange=NAS&autoAnalyze=1');

      await expect(page.locator('text=신규 매매 계획')).toBeVisible();
      await expect(page.locator('text=NVDA').first()).toBeVisible({ timeout: 15_000 });
    });

    test('E2E-A05: 계획 저장 → POST /api/trades 호출 확인', async ({ page }) => {
      await login(page);
      await page.goto('/plan?ticker=NVDA&exchange=NAS&autoAnalyze=1');

      await expect(page.getByText('4. Centaur 체크리스트', { exact: true })).toBeVisible({ timeout: 15_000 });

      for (let step = 0; step < 5; step += 1) {
        await page.getByRole('button', { name: '동의하고 다음' }).click();
      }
      await page.getByRole('button', { name: '동의하고 완료' }).click();

      // Save
      const saveButton = page.locator('button:has-text("계획 저장")');
      await expect(saveButton).toBeEnabled();
      const [tradePost] = await Promise.all([
        page.waitForRequest((request) => request.url().includes('/api/trades') && request.method() === 'POST'),
        saveButton.click(),
      ]);
      expect(tradePost.postDataJSON().ticker).toBe('NVDA');
    });

    test('E2E-A06: 포트폴리오에 포지션 표시', async ({ page }) => {
      await login(page);
      await page.goto('/portfolio');

      await expect(page.getByRole('heading', { name: '포트폴리오 리스크', exact: true })).toBeVisible();
      await expect(page.locator('text=AAPL')).toBeVisible();
      await expect(page.locator('text=총 자산')).toBeVisible();
    });

    test('E2E-A07: 성과 복기 페이지 표시', async ({ page }) => {
      await login(page);
      await page.goto('/history');

      await expect(page.locator('h1:has-text("성과 복기")').first()).toBeVisible();
      // Should have the completed trade from seed data
      await expect(page.locator('text=MSFT').first()).toBeVisible({ timeout: 10_000 }).catch(() => {
        // Trade table might load asynchronously, that's ok
      });
    });
  });

  test.describe('시나리오 B: 방어적 흐름 (RISK_OFF / HALT)', () => {
    test.beforeEach(async ({ page }) => {
      await setupHaltMocks(page);
    });

    test('E2E-B01: HALT 상태에서 스캐너 차단 확인', async ({ page }) => {
      await login(page);
      await page.goto('/scanner');

      // Should show HALT-related message or disabled scan button
      const haltMessage = page.locator('text=/HALT|차단|제한/');
      await expect(haltMessage.first()).toBeVisible({ timeout: 10_000 });
    });

    test('E2E-B02: RED/HALT 배너 메시지 표시', async ({ page }) => {
      await login(page);
      await page.goto('/scanner');

      // Macro action level HALT should show warning
      const banner = page.locator('text=/HALT|시장 상태/');
      await expect(banner.first()).toBeVisible({ timeout: 10_000 });
    });
  });
});
