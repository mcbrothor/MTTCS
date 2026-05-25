# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: contest.spec.ts >> TC-CONTEST: 뷰티 컨테스트 >> CON-02: LLM 응답 결과 렌더링 (순위, 추천상태)
- Location: tests/e2e/contest.spec.ts:54:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=NVDA').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('text=NVDA').first()

```

```yaml
- navigation:
  - link "MTN Live Mantori's Trading Navigator":
    - /url: /
    - text: MTN Live
    - paragraph: Mantori's Trading Navigator
  - text: "S&P500 -- -- KIS NASDAQ -- -- KIS KOSPI -- -- KIS KOSDAQ -- -- KIS USD/KRW -- -- Yahoo Last Updated: 2026.05.23. 23:00:00"
  - link "오늘":
    - /url: /
  - link "시장 분석":
    - /url: /master-filter
  - link "종목 발굴":
    - /url: /scanner
  - link "콘테스트":
    - /url: /contest
  - link "관심종목":
    - /url: /watchlist
  - link "매매 계획":
    - /url: /plan
  - link "포트폴리오":
    - /url: /portfolio
  - link "성과 복기":
    - /url: /history
  - link "가이드":
    - /url: /guide
  - link "링크 허브":
    - /url: /links
  - link "관리":
    - /url: /admin
  - button "로그아웃"
- link "오늘 의사결정":
  - /url: /
- link "시장 분석 진입 조건 확인":
  - /url: /master-filter
- link "종목 발굴 SEPA/VCP · CAN SLIM":
  - /url: /scanner
- link "03 콘테스트 LLM 비교 분석":
  - /url: /contest
- link "04 관심종목 후보 추적":
  - /url: /watchlist
- link "05 매매 계획 리스크 계산":
  - /url: /plan
- link "06 포트폴리오 노출도 점검":
  - /url: /portfolio
- link "07 성과 복기 결과 축적":
  - /url: /history
- main:
  - paragraph: MTN Beauty Contest
  - heading "분석 대상 종목 선정" [level=1]
  - paragraph: 상세 투자 검토에 올릴 10개를 선택합니다.
  - text: Internal|UNKNOWN|2026. 05. 24. 오전 01:25
  - heading "1 분석 후보 선택" [level=2]
  - paragraph: Minervini SEPA/VCP 스캔 결과에서 15개를 선택합니다. 선택 후 AI가 분석합니다.
  - combobox:
    - option "NASDAQ100" [selected]
    - option "SP500"
    - option "KOSPI200"
    - option "KOSDAQ150"
  - button "리로드"
  - paragraph: 저장된 스캔 결과가 없습니다.
  - link "스캐너로 이동 →":
    - /url: /scanner
  - heading "최근 콘테스트 세션" [level=3]
  - button "growth 2026. 05. 24. NV ME SN":
    - paragraph: growth
    - text: 2026. 05. 24. NV ME SN
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { login } from './helpers/auth';
  3  | import { setupAllMocks } from './mocks/handlers';
  4  | import scannerResults from './fixtures/scanner-results.json';
  5  | 
  6  | test.describe('TC-CONTEST: 뷰티 컨테스트', () => {
  7  |   test.beforeEach(async ({ page }) => {
  8  |     await setupAllMocks(page);
  9  |     await login(page);
  10 | 
  11 |     // Seed localStorage so that /contest correctly picks up candidate tickers
  12 |     await page.goto('/');
  13 |     await page.evaluate((results) => {
  14 |       const universeMeta = {
  15 |         universe: 'NASDAQ100',
  16 |         label: 'NASDAQ100',
  17 |         asOf: new Date().toISOString(),
  18 |         source: 'minervini',
  19 |         delayNote: null,
  20 |         items: results,
  21 |         warnings: [],
  22 |       };
  23 |       const snapshot = {
  24 |         savedAt: new Date().toISOString(),
  25 |         universeMeta,
  26 |         results,
  27 |       };
  28 | 
  29 |       const selection = {
  30 |         source: 'minervini',
  31 |         universe: 'NASDAQ100',
  32 |         tickers: ['NVDA', 'META', 'SNOW'],
  33 |         savedAt: new Date().toISOString(),
  34 |       };
  35 |       window.localStorage.setItem('mtn:scanner:snapshot:NASDAQ100', JSON.stringify(snapshot));
  36 |       window.localStorage.setItem('mtn:contest:transfers-by-source:v1', JSON.stringify({
  37 |         'minervini:NASDAQ100': selection
  38 |       }));
  39 |       window.localStorage.setItem('mtn:scanner:last-universe:v1', 'NASDAQ100');
  40 |     }, scannerResults);
  41 |   });
  42 | 
  43 |   test('CON-01: 세션 초기화 및 LLM 심사 로드', async ({ page }) => {
  44 |     // Navigate with query params simulating scanner redirect
  45 |     await page.goto('/contest?tickers=NVDA,META,SNOW&exchange=NAS');
  46 | 
  47 |     await expect(page.locator('text=분석 대상 종목 선정')).toBeVisible();
  48 |     await expect(page.locator('text=Beauty Contest')).toBeVisible();
  49 | 
  50 |     // Should show loading state initially, then results from mock
  51 |     await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });
  52 |   });
  53 | 
  54 |   test('CON-02: LLM 응답 결과 렌더링 (순위, 추천상태)', async ({ page }) => {
  55 |     await page.goto('/contest?tickers=NVDA,META,SNOW&exchange=NAS');
  56 | 
  57 |     // Mocks return PROCEED for NVDA, WATCH for META, SKIP for SNOW
> 58 |     await expect(page.locator('text=NVDA').first()).toBeVisible({ timeout: 15_000 });
     |                                                     ^ Error: expect(locator).toBeVisible() failed
  59 |     
  60 |     // Check for recommendation badges
  61 |     await expect(page.locator('text=PROCEED')).toBeVisible();
  62 |     await expect(page.locator('text=WATCH')).toBeVisible();
  63 |     await expect(page.locator('text=SKIP')).toBeVisible();
  64 |   });
  65 | 
  66 |   test('CON-04: 최종 선별 후 Plan Queue 전달', async ({ page }) => {
  67 |     await page.goto('/contest?tickers=NVDA,META,SNOW&exchange=NAS');
  68 | 
  69 |     // Wait for mock data to load
  70 |     await expect(page.locator('text=PROCEED')).toBeVisible({ timeout: 15_000 });
  71 | 
  72 |     // Click "매매 계획 큐 생성" button or similar CTA
  73 |     const queueButton = page.locator('button:has-text("계획 수립"), button:has-text("Plan Queue"), a:has-text("계획 수립")').first();
  74 |     
  75 |     if (await queueButton.isVisible()) {
  76 |       await queueButton.click();
  77 |       
  78 |       // Should redirect to /plan
  79 |       await expect(page).toHaveURL(/\/plan/);
  80 |       
  81 |       // Plan Queue banner should be visible
  82 |       await expect(page.locator('text=Contest Plan Queue')).toBeVisible();
  83 |     }
  84 |   });
  85 | });
  86 | 
```