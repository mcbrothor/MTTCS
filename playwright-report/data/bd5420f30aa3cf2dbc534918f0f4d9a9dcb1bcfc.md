# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: macro.spec.ts >> TC-MACRO: 매크로 분석 >> 정상 플로우 (RISK_ON) >> MACRO-04: 자산 그리드 8개 카드 표시
- Location: tests/e2e/macro.spec.ts:23:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=SPY')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=SPY')

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
  - link "마스터 필터":
    - /url: /master-filter
  - link "매크로":
    - /url: /macro
  - link "가이드":
    - /url: /guide
  - link "링크 허브":
    - /url: /links
  - link "관리":
    - /url: /admin
  - button "로그아웃"
- link "오늘 의사결정":
  - /url: /
- link "01 시장 분석 진입 조건 확인":
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
  - paragraph: Cannot read properties of undefined (reading 'trend')
  - button "다시 시도"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { login } from './helpers/auth';
  3  | import { setupAllMocks, setupErrorMocks } from './mocks/handlers';
  4  | 
  5  | test.describe('TC-MACRO: 매크로 분석', () => {
  6  |   test.describe('정상 플로우 (RISK_ON)', () => {
  7  |     test.beforeEach(async ({ page }) => {
  8  |       await setupAllMocks(page); // default is RISK_ON score 78
  9  |       await login(page);
  10 |     });
  11 | 
  12 |     test('MACRO-01: RISK_ON 레짐 카드 표시', async ({ page }) => {
  13 |       await page.goto('/macro');
  14 | 
  15 |       // Check header
  16 |       await expect(page.locator('text=Macro Analysis')).toBeVisible();
  17 |       
  18 |       // Hero card should show RISK_ON and score 78
  19 |       await expect(page.locator('text=RISK_ON')).toBeVisible();
  20 |       await expect(page.locator('text=78').first()).toBeVisible();
  21 |     });
  22 | 
  23 |     test('MACRO-04: 자산 그리드 8개 카드 표시', async ({ page }) => {
  24 |       await page.goto('/macro');
  25 | 
  26 |       // Check for assets from the fixture
> 27 |       await expect(page.locator('text=SPY')).toBeVisible();
     |                                              ^ Error: expect(locator).toBeVisible() failed
  28 |       await expect(page.locator('text=QQQ')).toBeVisible();
  29 |       await expect(page.locator('text=HYG')).toBeVisible();
  30 |       await expect(page.locator('text=IEF')).toBeVisible();
  31 |       await expect(page.locator('text=TLT')).toBeVisible();
  32 |       await expect(page.locator('text=GLD')).toBeVisible();
  33 |       await expect(page.locator('text=VIX')).toBeVisible();
  34 |       await expect(page.locator('text=BTC')).toBeVisible();
  35 |     });
  36 | 
  37 |     test('MACRO-07: 마스터 필터 CTA 클릭', async ({ page }) => {
  38 |       await page.goto('/macro');
  39 | 
  40 |       const mfButton = page.locator('a[href="/master-filter"]').first();
  41 |       await mfButton.click();
  42 |       await expect(page).toHaveURL(/\/master-filter/);
  43 |     });
  44 |   });
  45 | 
  46 |   test.describe('에러 핸들링', () => {
  47 |     test.beforeEach(async ({ page }) => {
  48 |       await setupAllMocks(page);
  49 |       await setupErrorMocks(page); // Overrides macro to return 500
  50 |       await login(page);
  51 |     });
  52 | 
  53 |     test('MACRO-06: 매크로 데이터 로딩 실패 시 에러 표시', async ({ page }) => {
  54 |       await page.goto('/macro');
  55 | 
  56 |       // Should show an error banner or text
  57 |       const errorMsg = page.locator('text=/실패|오류|error|미채점/i');
  58 |       await expect(errorMsg.first()).toBeVisible({ timeout: 10_000 });
  59 |     });
  60 |   });
  61 | });
  62 | 
```