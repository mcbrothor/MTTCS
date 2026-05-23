# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scanner.spec.ts >> TC-SCAN: 미너비니 스크리너 >> SCAN-01: Universe 선택 후 스캔 시작 → 결과 렌더링
- Location: tests/e2e/scanner.spec.ts:15:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=미너비니 스크리너')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=미너비니 스크리너')

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
  - link "미너비니 스크리닝":
    - /url: /scanner
  - link "윌리엄 오닐 스크리닝":
    - /url: /canslim
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
- link "02 종목 발굴 SEPA/VCP · CAN SLIM":
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
  - paragraph: 오류가 발생했습니다
  - paragraph: Cannot read properties of undefined (reading 'updatedAt')
  - button "다시 시도"
- alert
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { login } from './helpers/auth';
  3   | import { setupAllMocks } from './mocks/handlers';
  4   | import { ScannerPage } from './helpers/page-objects';
  5   | 
  6   | test.describe('TC-SCAN: 미너비니 스크리너', () => {
  7   |   let scannerPage: ScannerPage;
  8   | 
  9   |   test.beforeEach(async ({ page }) => {
  10  |     await setupAllMocks(page);
  11  |     await login(page);
  12  |     scannerPage = new ScannerPage(page);
  13  |   });
  14  | 
  15  |   test('SCAN-01: Universe 선택 후 스캔 시작 → 결과 렌더링', async ({ page }) => {
  16  |     await scannerPage.goto();
  17  | 
  18  |     // Check header
> 19  |     await expect(page.locator('text=미너비니 스크리너')).toBeVisible();
      |                                                  ^ Error: expect(locator).toBeVisible() failed
  20  | 
  21  |     // Click scan button
  22  |     await scannerPage.scanButton.click();
  23  | 
  24  |     // Progress bar should appear
  25  |     await expect(page.locator('text=/Scan Progress|스캔 진행율/')).toBeVisible();
  26  | 
  27  |     // Results should load (fixture returns 4 results)
  28  |     await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });
  29  |     await expect(page.locator('text=META')).toBeVisible();
  30  |     await expect(page.locator('text=SNOW')).toBeVisible();
  31  |     await expect(page.locator('text=ERRX')).toBeVisible();
  32  |   });
  33  | 
  34  |   test('SCAN-02: 스캔 결과 Tier별 카운트 확인', async ({ page }) => {
  35  |     await scannerPage.goto();
  36  | 
  37  |     // Our fixture has 1 Recommended, 1 Action, 1 IB Review, 1 Errors
  38  |     // Cards should display these numbers
  39  |     const recommendedCount = await scannerPage.getStatCardValue('Recommended');
  40  |     const actionCount = await scannerPage.getStatCardValue('Action');
  41  |     const ibReviewCount = await scannerPage.getStatCardValue('IB Review');
  42  |     const errorsCount = await scannerPage.getStatCardValue('Errors');
  43  | 
  44  |     expect(recommendedCount.trim()).toBe('1');
  45  |     expect(actionCount.trim()).toBe('1');
  46  |     expect(ibReviewCount.trim()).toBe('1');
  47  |     expect(errorsCount.trim()).toBe('1');
  48  |   });
  49  | 
  50  |   test('SCAN-04: 필터 탭 전환', async ({ page }) => {
  51  |     await scannerPage.goto();
  52  | 
  53  |     // Filter by Recommended
  54  |     const recFilter = page.locator('button:has-text("Recommended")');
  55  |     await recFilter.click();
  56  | 
  57  |     // Only NVDA should be visible
  58  |     await expect(page.locator('text=NVDA')).toBeVisible();
  59  |     await expect(page.locator('text=META')).not.toBeVisible();
  60  |   });
  61  | 
  62  |   test('SCAN-07: 종목 선택 및 카운터 증가', async ({ page }) => {
  63  |     await scannerPage.goto();
  64  | 
  65  |     // Checkboxes should exist for valid candidates
  66  |     const checkboxes = page.locator('input[type="checkbox"]');
  67  |     
  68  |     // Select first one
  69  |     await checkboxes.first().check();
  70  |     
  71  |     // Check selected count
  72  |     await expect(scannerPage.selectedCount).toHaveText(/1/);
  73  | 
  74  |     // Select second one
  75  |     await checkboxes.nth(1).check();
  76  |     await expect(scannerPage.selectedCount).toHaveText(/2/);
  77  |   });
  78  | 
  79  |   test('SCAN-08: 종목 클릭 → VCP Drilldown 모달', async ({ page }) => {
  80  |     await scannerPage.goto();
  81  | 
  82  |     // Click on NVDA row/card
  83  |     const nvdaRow = page.locator('text=NVDA').first();
  84  |     await nvdaRow.click();
  85  | 
  86  |     // Modal should appear
  87  |     const modal = page.locator('div[role="dialog"]');
  88  |     await expect(modal).toBeVisible();
  89  |     await expect(modal.locator('text=VCP Analysis')).toBeVisible();
  90  |   });
  91  | 
  92  |   test('SCAN-10: 콘테스트로 이동 플로팅 버튼', async ({ page }) => {
  93  |     await scannerPage.goto();
  94  | 
  95  |     // Select one candidate
  96  |     await page.locator('input[type="checkbox"]').first().check();
  97  | 
  98  |     // Contest button should become active and clickable
  99  |     await expect(scannerPage.contestButton).toBeEnabled();
  100 |     await scannerPage.contestButton.click();
  101 | 
  102 |     // Should navigate to contest page
  103 |     await expect(page).toHaveURL(/\/contest/);
  104 |   });
  105 | });
  106 | 
```