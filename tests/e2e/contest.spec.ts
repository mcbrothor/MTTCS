import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';
import scannerResults from './fixtures/scanner-results.json';

test.describe('TC-CONTEST: 뷰티 컨테스트', () => {
  async function startAnalysis(page: import('@playwright/test').Page) {
    const startButton = page.getByRole('button', { name: 'AI 분석 시작 (Gemini 1.5 Pro)' });
    await expect(startButton).toBeVisible();
    await startButton.click();
    await expect(page.getByRole('heading', { name: '1차 평가 및 상세 투자 검토' })).toBeVisible({ timeout: 15_000 });
  }

  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);

    // Seed localStorage so that /contest correctly picks up candidate tickers
    await page.goto('/');
    await page.evaluate(async (results) => {
      const universeMeta = {
        universe: 'NASDAQ100',
        label: 'NASDAQ100',
        asOf: new Date().toISOString(),
        source: 'minervini',
        delayNote: null,
        items: results,
        warnings: [],
      };
      const snapshot = {
        savedAt: new Date().toISOString(),
        universeMeta,
        results,
      };

      const selection = {
        source: 'minervini',
        universe: 'NASDAQ100',
        tickers: ['NVDA', 'META', 'SNOW'],
        savedAt: new Date().toISOString(),
      };
      await new Promise<void>((resolve, reject) => {
        const open = window.indexedDB.open('keyval-store');
        open.onupgradeneeded = () => open.result.createObjectStore('keyval');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const transaction = open.result.transaction('keyval', 'readwrite');
          transaction.objectStore('keyval').put(snapshot, 'mtn:scanner-snapshot:v3:NASDAQ100');
          transaction.oncomplete = () => {
            open.result.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
      window.localStorage.setItem('mtn:scanner:latest-scan-universe:v1', 'NASDAQ100');
      window.localStorage.setItem('mtn:contest:selections-by-source:v1', JSON.stringify({
        'minervini:NASDAQ100': selection
      }));
      window.localStorage.setItem('mtn:scanner:last-universe:v1', 'NASDAQ100');
    }, scannerResults);
  });

  test('CON-01: 세션 초기화 및 LLM 심사 로드', async ({ page }) => {
    // Navigate with query params simulating scanner redirect
    await page.goto('/contest?tickers=NVDA,META,SNOW&exchange=NAS');

    await expect(page.locator('text=분석 대상 종목 선정')).toBeVisible();
    await expect(page.locator('text=Beauty Contest')).toBeVisible();
    await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });
    await startAnalysis(page);
  });

  test('CON-02: LLM 응답 결과 렌더링 (순위, 추천상태)', async ({ page }) => {
    await page.goto('/contest?tickers=NVDA,META,SNOW&exchange=NAS');
    await startAnalysis(page);

    // Mocks return PROCEED for NVDA, WATCH for META, SKIP for SNOW
    await expect(page.locator('text=NVDA').first()).toBeVisible({ timeout: 15_000 });
    
    // Check for recommendation badges
    const resultTable = page.getByRole('table');
    await expect(resultTable.getByText('PROCEED', { exact: true })).toBeVisible();
    await expect(resultTable.getByText('WATCH', { exact: true })).toBeVisible();
    await expect(resultTable.getByText('SKIP', { exact: true })).toBeVisible();
  });

  test('CON-04: 최종 선별 후 Plan Queue 전달', async ({ page }) => {
    await page.goto('/contest?tickers=NVDA,META,SNOW&exchange=NAS');
    await startAnalysis(page);

    // Wait for mock data to load
    await expect(page.getByRole('heading', { name: '분석 완료' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: '매매 계획 수립' }).click();
    await expect(page).toHaveURL(/\/plan/);
    await expect(page.locator('text=Contest Plan Queue')).toBeVisible();
  });
});
