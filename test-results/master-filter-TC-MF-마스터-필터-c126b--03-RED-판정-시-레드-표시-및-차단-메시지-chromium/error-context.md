# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: master-filter.spec.ts >> TC-MF: 마스터 필터 >> 방어 (RED) 상태 >> MF-03: RED 판정 시 레드 표시 및 차단 메시지
- Location: tests/e2e/master-filter.spec.ts:29:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=RED')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=RED')

```

```yaml
- navigation:
  - link "MTN Live Mantori's Trading Navigator":
    - /url: /
    - text: MTN Live
    - paragraph: Mantori's Trading Navigator
  - text: "S&P500 -- -- KIS NASDAQ -- -- KIS KOSPI -- -- KIS KOSDAQ -- -- KIS USD/KRW -- -- Yahoo Last Updated: 2026.05.24. 01:26:00"
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
  3  | import { setupAllMocks, setupHaltMocks } from './mocks/handlers';
  4  | 
  5  | test.describe('TC-MF: 마스터 필터', () => {
  6  |   test.describe('정상 (GREEN) 상태', () => {
  7  |     test.beforeEach(async ({ page }) => {
  8  |       await setupAllMocks(page); // GREEN by default
  9  |       await login(page);
  10 |     });
  11 | 
  12 |     test('MF-01: GREEN 판정 시 녹색 UI 표시', async ({ page }) => {
  13 |       await page.goto('/master-filter');
  14 | 
  15 |       await expect(page.locator('text=마스터 필터')).toBeVisible();
  16 |       await expect(page.locator('text=GREEN')).toBeVisible();
  17 |       
  18 |       // Should indicate full action level
  19 |       await expect(page.locator('text=진입 가능').or(page.locator('text=FULL'))).toBeVisible();
  20 |     });
  21 |   });
  22 | 
  23 |   test.describe('방어 (RED) 상태', () => {
  24 |     test.beforeEach(async ({ page }) => {
  25 |       await setupHaltMocks(page); // Sets to RED / HALT
  26 |       await login(page);
  27 |     });
  28 | 
  29 |     test('MF-03: RED 판정 시 레드 표시 및 차단 메시지', async ({ page }) => {
  30 |       await page.goto('/master-filter');
  31 | 
> 32 |       await expect(page.locator('text=RED')).toBeVisible();
     |                                              ^ Error: expect(locator).toBeVisible() failed
  33 |       
  34 |       // Should indicate halt action level
  35 |       await expect(page.locator('text=진입 금지').or(page.locator('text=HALT'))).toBeVisible();
  36 |     });
  37 | 
  38 |     test('MF-04: DecisionBox 가이드라인 표시', async ({ page }) => {
  39 |       await page.goto('/master-filter');
  40 |       
  41 |       const decisionBox = page.locator('text=현금 비중').or(page.locator('text=신규 매수 금지')).first();
  42 |       await expect(decisionBox).toBeVisible();
  43 |     });
  44 |   });
  45 | });
  46 | 
```