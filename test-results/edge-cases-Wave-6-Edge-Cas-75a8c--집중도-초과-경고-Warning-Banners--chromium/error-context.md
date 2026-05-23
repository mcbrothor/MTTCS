# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: edge-cases.spec.ts >> Wave 6: Edge Cases (심화 테스트) >> EDGE-01: 포트폴리오 에지 케이스 — 집중도 초과 경고 (Warning Banners)
- Location: tests/e2e/edge-cases.spec.ts:12:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[class*="amber"], [class*="red"]').filter({ hasText: /초과/ }).first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('[class*="amber"], [class*="red"]').filter({ hasText: /초과/ }).first()

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
- link "콘테스트 LLM 비교 분석":
  - /url: /contest
- link "관심종목 후보 추적":
  - /url: /watchlist
- link "매매 계획 리스크 계산":
  - /url: /plan
- link "06 포트폴리오 노출도 점검":
  - /url: /portfolio
- link "07 성과 복기 결과 축적":
  - /url: /history
- main:
  - paragraph: 오류가 발생했습니다
  - paragraph: "Minified React error #31; visit https://react.dev/errors/31?args[]=object%20with%20keys%20%7Btype%2C%20message%7D for the full message or use the non-minified dev environment for full errors and additional helpful warnings."
  - button "다시 시도"
- alert
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { login } from './helpers/auth';
  3   | import { setupAllMocks } from './mocks/handlers';
  4   | import { PortfolioPage } from './helpers/page-objects';
  5   | 
  6   | test.describe('Wave 6: Edge Cases (심화 테스트)', () => {
  7   |   test.beforeEach(async ({ page }) => {
  8   |     await setupAllMocks(page);
  9   |     await login(page);
  10  |   });
  11  | 
  12  |   test('EDGE-01: 포트폴리오 에지 케이스 — 집중도 초과 경고 (Warning Banners)', async ({ page }) => {
  13  |     // We override the portfolio mock to simulate an edge case (e.g. 50% sector exposure)
  14  |     await page.route('**/api/portfolio/risk*', async (route) => {
  15  |       const origResponse = route.request();
  16  |       if (origResponse.method() === 'GET') {
  17  |         await route.fulfill({
  18  |           status: 200,
  19  |           contentType: 'application/json',
  20  |           body: JSON.stringify({
  21  |             data: {
  22  |               totalEquity: 50000,
  23  |               investedCapital: 25000,
  24  |               cash: 25000,
  25  |               cashPct: 50.0,
  26  |               totalOpenRisk: 2500,
  27  |               openRiskPct: 5.0, // HIGH RISK
  28  |               activePositions: 2,
  29  |               maxPositions: 10,
  30  |               sectorExposure: [
  31  |                 { sector: "Technology", count: 2, exposure: 25000, exposurePct: 50.0 }
  32  |               ],
  33  |               positions: [],
  34  |               warnings: [
  35  |                 { type: 'exposure', message: '단일 섹터(Technology) 노출이 30%를 초과했습니다 (50.0%)' },
  36  |                 { type: 'risk', message: '총 오픈 리스크가 1%를 초과했습니다 (5.0%)' }
  37  |               ]
  38  |             },
  39  |             meta: { source: 'e2e-mock-edge' }
  40  |           }),
  41  |         });
  42  |       } else {
  43  |         await route.fallback();
  44  |       }
  45  |     });
  46  | 
  47  |     const portfolioPage = new PortfolioPage(page);
  48  |     await portfolioPage.goto();
  49  | 
  50  |     // Check for warning banners
  51  |     const warnings = page.locator('[class*="amber"], [class*="red"]').filter({ hasText: /초과/ });
> 52  |     await expect(warnings.first()).toBeVisible({ timeout: 10_000 });
      |                                    ^ Error: expect(locator).toBeVisible() failed
  53  |   });
  54  | 
  55  |   test('EDGE-02: 매매 계획 에지 케이스 — SEPA Fail 시 저장 차단', async ({ page }) => {
  56  |     // Override market data to simulate SEPA FAIL
  57  |     await page.route('**/api/market-data*', async (route) => {
  58  |       await route.fulfill({
  59  |         status: 200,
  60  |         contentType: 'application/json',
  61  |         body: JSON.stringify({
  62  |           data: {
  63  |             ticker: 'FAIL',
  64  |             exchange: 'NAS',
  65  |             sepaEvidence: {
  66  |               status: 'fail', // FAIL
  67  |               summary: { passed: 4, failed: 5, info: 0, corePassed: 3, coreFailed: 4, coreTotal: 7 },
  68  |               metrics: { rsRating: 60, rsSource: 'DB', macroActionLevel: 'FULL' },
  69  |               criteria: []
  70  |             },
  71  |             vcpAnalysis: {
  72  |               grade: 'weak',
  73  |               score: 30,
  74  |               baseType: 'SAUCER',
  75  |               pivotPrice: 100,
  76  |               recommendedEntry: 101,
  77  |               invalidationPrice: 90,
  78  |               breakoutVolumeStatus: 'none',
  79  |               contractions: [],
  80  |               volumeDryUpScore: 20,
  81  |               pocketPivotScore: 10,
  82  |             },
  83  |             riskPlan: {
  84  |               totalEquity: 50000, riskPercent: 0.01, maxRisk: 500, atr: 4.2,
  85  |               entryPrice: 101, stopLossPrice: 90, totalShares: 45,
  86  |               entryTargets: null, trailingStops: null
  87  |             },
  88  |           },
  89  |         }),
  90  |       });
  91  |     });
  92  | 
  93  |     await page.goto('/plan?ticker=FAIL&exchange=NAS&autoAnalyze=1');
  94  | 
  95  |     // SEPA fail state should be visible
  96  |     await expect(page.locator('text=Fail').first()).toBeVisible({ timeout: 15_000 });
  97  |     
  98  |     // Save button should be disabled
  99  |     const saveButton = page.locator('button:has-text("계획 저장")');
  100 |     if (await saveButton.isVisible()) {
  101 |       await expect(saveButton).toBeDisabled();
  102 |     }
  103 |   });
  104 | });
  105 | 
```