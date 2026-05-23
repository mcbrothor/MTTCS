# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: plan.spec.ts >> TC-PLAN: 매매 계획 >> PLAN-02: 스캐너에서 자동 분석 (autoAnalyze=1)
- Location: tests/e2e/plan.spec.ts:23:7

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
- link "콘테스트 LLM 비교 분석":
  - /url: /contest
- link "관심종목 후보 추적":
  - /url: /watchlist
- link "05 매매 계획 리스크 계산":
  - /url: /plan
- link "06 포트폴리오 노출도 점검":
  - /url: /portfolio
- link "07 성과 복기 결과 축적":
  - /url: /history
- main:
  - paragraph: 오류가 발생했습니다
  - paragraph: Cannot read properties of undefined (reading 'bars')
  - button "다시 시도"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { login } from './helpers/auth';
  3  | import { setupAllMocks } from './mocks/handlers';
  4  | import { PlanPage } from './helpers/page-objects';
  5  | 
  6  | test.describe('TC-PLAN: 매매 계획', () => {
  7  |   let planPage: PlanPage;
  8  | 
  9  |   test.beforeEach(async ({ page }) => {
  10 |     await setupAllMocks(page);
  11 |     await login(page);
  12 |     planPage = new PlanPage(page);
  13 |   });
  14 | 
  15 |   test('PLAN-01: 티커 입력 후 분석 실행 → SEPA, VCP, 리스크 표시', async ({ page }) => {
  16 |     await planPage.goto();
  17 | 
  18 |     // Page title visible
  19 |     await expect(page.locator('text=신규 매매 계획')).toBeVisible();
  20 |     await expect(page.locator('text=New Trade Plan')).toBeVisible();
  21 |   });
  22 | 
  23 |   test('PLAN-02: 스캐너에서 자동 분석 (autoAnalyze=1)', async ({ page }) => {
  24 |     await planPage.goto({ ticker: 'NVDA', exchange: 'NAS', autoAnalyze: true });
  25 | 
  26 |     // Wait for analysis to load
> 27 |     await expect(page.locator('text=NVDA').first()).toBeVisible({ timeout: 15_000 });
     |                                                     ^ Error: expect(locator).toBeVisible() failed
  28 |   });
  29 | 
  30 |   test('PLAN-04: SEPA 판정 결과 표시 — pass 상태', async ({ page }) => {
  31 |     await planPage.goto({ ticker: 'NVDA', exchange: 'NAS', autoAnalyze: true });
  32 | 
  33 |     // SEPA section should be visible after analysis loads
  34 |     await expect(page.locator('text=SEPA').first()).toBeVisible({ timeout: 15_000 });
  35 |   });
  36 | 
  37 |   test('PLAN-06: 리스크 계산기 표시', async ({ page }) => {
  38 |     await planPage.goto({ ticker: 'NVDA', exchange: 'NAS', autoAnalyze: true });
  39 | 
  40 |     // Wait for risk calculator section
  41 |     const riskSection = page.locator('text=/리스크|Risk/i').first();
  42 |     await expect(riskSection).toBeVisible({ timeout: 15_000 });
  43 |   });
  44 | 
  45 |   test('PLAN-07: Centaur 체크리스트 항목 표시', async ({ page }) => {
  46 |     await planPage.goto({ ticker: 'NVDA', exchange: 'NAS', autoAnalyze: true });
  47 | 
  48 |     // Wait for analysis to load then check for checklist
  49 |     await page.waitForTimeout(3_000);
  50 | 
  51 |     // Checklist should be present when analysis is loaded
  52 |     const checklistSection = page.locator('text=/체크리스트|Checklist/i');
  53 |     if (await checklistSection.isVisible()) {
  54 |       await expect(checklistSection).toBeVisible();
  55 |     }
  56 |   });
  57 | 
  58 |   test('PLAN-08: 계획 저장 → 성공 배너 표시', async ({ page }) => {
  59 |     await planPage.goto({ ticker: 'NVDA', exchange: 'NAS', autoAnalyze: true });
  60 | 
  61 |     // Wait for analysis
  62 |     await page.waitForTimeout(3_000);
  63 | 
  64 |     // If save button exists and is enabled, test the save flow
  65 |     const saveButton = page.locator('button:has-text("계획 저장")');
  66 |     if (await saveButton.isVisible() && await saveButton.isEnabled()) {
  67 |       // Fill checklist items if needed
  68 |       const checkboxes = page.locator('input[type="checkbox"]');
  69 |       const count = await checkboxes.count();
  70 |       for (let i = 0; i < count; i++) {
  71 |         const cb = checkboxes.nth(i);
  72 |         if (!(await cb.isChecked())) {
  73 |           await cb.check();
  74 |         }
  75 |       }
  76 | 
  77 |       await saveButton.click();
  78 | 
  79 |       // Wait for success or error response
  80 |       const successBanner = page.locator('text=계획 저장 완료');
  81 |       await expect(successBanner).toBeVisible({ timeout: 10_000 });
  82 |     }
  83 |   });
  84 | 
  85 |   test('PLAN-11: 미국 ↔ 한국 시장 전환', async ({ page }) => {
  86 |     await planPage.goto();
  87 | 
  88 |     // US mode by default
  89 |     await expect(page.locator('text=/USD|미국 계좌/').first()).toBeVisible();
  90 | 
  91 |     // Switch to KR
  92 |     const krButton = page.locator('button:has-text("한국")').first();
  93 |     if (await krButton.isVisible()) {
  94 |       await krButton.click();
  95 |       await expect(page.locator('text=/KRW|한국 계좌/').first()).toBeVisible();
  96 |     }
  97 |   });
  98 | });
  99 | 
```