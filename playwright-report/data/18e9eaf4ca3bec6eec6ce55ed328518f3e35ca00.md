# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> TC-DASH: Command Center >> DASH-03: Next Action CTA 버튼 이동
- Location: tests/e2e/dashboard.spec.ts:35:7

# Error details

```
Error: expect(received).not.toBe(expected) // Object.is equality

Expected: not "http://localhost:3000/"
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - navigation [ref=e4]:
        - generic [ref=e5]:
          - generic [ref=e6]:
            - link "MTN Live Mantori's Trading Navigator" [ref=e8] [cursor=pointer]:
              - /url: /
              - img [ref=e10]
              - generic [ref=e12]:
                - generic [ref=e13]:
                  - generic [ref=e14]: MTN
                  - generic [ref=e15]: Live
                - paragraph [ref=e17]: Mantori's Trading Navigator
            - generic [ref=e19]:
              - generic [ref=e20]:
                - generic [ref=e21]: S&P500
                - generic [ref=e22]: "--"
                - generic [ref=e23]:
                  - generic [ref=e24]: "--"
                  - generic [ref=e25]: KIS
              - generic [ref=e26]:
                - generic [ref=e27]: NASDAQ
                - generic [ref=e28]: "--"
                - generic [ref=e29]:
                  - generic [ref=e30]: "--"
                  - generic [ref=e31]: KIS
              - generic [ref=e32]:
                - generic [ref=e33]: KOSPI
                - generic [ref=e34]: "--"
                - generic [ref=e35]:
                  - generic [ref=e36]: "--"
                  - generic [ref=e37]: KIS
              - generic [ref=e38]:
                - generic [ref=e39]: KOSDAQ
                - generic [ref=e40]: "--"
                - generic [ref=e41]:
                  - generic [ref=e42]: "--"
                  - generic [ref=e43]: KIS
              - generic [ref=e44]:
                - generic [ref=e45]: USD/KRW
                - generic [ref=e46]: "--"
                - generic [ref=e47]:
                  - generic [ref=e48]: "--"
                  - generic [ref=e49]: Yahoo
          - generic [ref=e50]:
            - generic [ref=e51]:
              - link "오늘" [ref=e52] [cursor=pointer]:
                - /url: /
              - link "시장 분석" [ref=e53] [cursor=pointer]:
                - /url: /master-filter
              - link "종목 발굴" [ref=e54] [cursor=pointer]:
                - /url: /scanner
              - link "콘테스트" [ref=e55] [cursor=pointer]:
                - /url: /contest
              - link "관심종목" [ref=e56] [cursor=pointer]:
                - /url: /watchlist
              - link "매매 계획" [ref=e57] [cursor=pointer]:
                - /url: /plan
              - link "포트폴리오" [ref=e58] [cursor=pointer]:
                - /url: /portfolio
              - link "성과 복기" [ref=e59] [cursor=pointer]:
                - /url: /history
            - generic [ref=e60]:
              - link "가이드" [ref=e61] [cursor=pointer]:
                - /url: /guide
              - link "링크 허브" [ref=e62] [cursor=pointer]:
                - /url: /links
              - link "관리" [ref=e63] [cursor=pointer]:
                - /url: /admin
              - button "로그아웃" [ref=e65]
      - generic [ref=e67]:
        - link "오늘 의사결정" [ref=e68] [cursor=pointer]:
          - /url: /
          - img [ref=e70]
          - generic [ref=e72]:
            - generic [ref=e73]: 오늘
            - generic [ref=e74]: 의사결정
        - link "시장 분석 진입 조건 확인" [ref=e75] [cursor=pointer]:
          - /url: /master-filter
          - img [ref=e77]
          - generic [ref=e79]:
            - generic [ref=e80]: 시장 분석
            - generic [ref=e81]: 진입 조건 확인
        - link "종목 발굴 SEPA/VCP · CAN SLIM" [ref=e82] [cursor=pointer]:
          - /url: /scanner
          - img [ref=e84]
          - generic [ref=e86]:
            - generic [ref=e87]: 종목 발굴
            - generic [ref=e88]: SEPA/VCP · CAN SLIM
        - link "콘테스트 LLM 비교 분석" [ref=e89] [cursor=pointer]:
          - /url: /contest
          - img [ref=e91]
          - generic [ref=e93]:
            - generic [ref=e94]: 콘테스트
            - generic [ref=e95]: LLM 비교 분석
        - link "04 관심종목 후보 추적" [ref=e96] [cursor=pointer]:
          - /url: /watchlist
          - generic [ref=e97]: "04"
          - generic [ref=e98]:
            - generic [ref=e99]: 관심종목
            - generic [ref=e100]: 후보 추적
        - link "05 매매 계획 리스크 계산" [ref=e101] [cursor=pointer]:
          - /url: /plan
          - generic [ref=e102]: "05"
          - generic [ref=e103]:
            - generic [ref=e104]: 매매 계획
            - generic [ref=e105]: 리스크 계산
        - link "06 포트폴리오 노출도 점검" [ref=e106] [cursor=pointer]:
          - /url: /portfolio
          - generic [ref=e107]: "06"
          - generic [ref=e108]:
            - generic [ref=e109]: 포트폴리오
            - generic [ref=e110]: 노출도 점검
        - link "07 성과 복기 결과 축적" [ref=e111] [cursor=pointer]:
          - /url: /history
          - generic [ref=e112]: "07"
          - generic [ref=e113]:
            - generic [ref=e114]: 성과 복기
            - generic [ref=e115]: 결과 축적
    - main [ref=e116]:
      - generic [ref=e117]:
        - generic [ref=e118]:
          - paragraph [ref=e119]: 오류가 발생했습니다
          - paragraph [ref=e120]: Cannot read properties of undefined (reading 'length')
        - button "다시 시도" [ref=e121]
  - alert [ref=e122]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { login } from './helpers/auth';
  3  | import { setupAllMocks } from './mocks/handlers';
  4  | import { DashboardPage } from './helpers/page-objects';
  5  | 
  6  | test.describe('TC-DASH: Command Center', () => {
  7  |   let dashboard: DashboardPage;
  8  | 
  9  |   test.beforeEach(async ({ page }) => {
  10 |     await setupAllMocks(page);
  11 |     await login(page);
  12 |     dashboard = new DashboardPage(page);
  13 |   });
  14 | 
  15 |   test('DASH-01: 대시보드 초기 로드 (미국 시장)', async ({ page }) => {
  16 |     await dashboard.goto();
  17 | 
  18 |     await expect(page.locator('text=Command Center')).toBeVisible();
  19 |     await expect(dashboard.marketStateCard).toBeVisible();
  20 |     await expect(dashboard.macroCard).toBeVisible();
  21 |     await expect(dashboard.riskCard).toBeVisible();
  22 | 
  23 |     // Default should be US
  24 |     await expect(page.locator('text=/USD|미국/').first()).toBeVisible();
  25 |   });
  26 | 
  27 |   test('DASH-02: 한국 시장으로 전환', async ({ page }) => {
  28 |     await dashboard.goto();
  29 |     await dashboard.switchMarket('KR');
  30 | 
  31 |     // Should see KRW indication
  32 |     await expect(page.locator('text=/KRW|한국/').first()).toBeVisible();
  33 |   });
  34 | 
  35 |   test('DASH-03: Next Action CTA 버튼 이동', async ({ page }) => {
  36 |     await dashboard.goto();
  37 |     
  38 |     // In RISK_ON (fixture default), next action CTA is to Scanner or Macro
  39 |     await dashboard.nextActionCta.click();
  40 |     
  41 |     // Check we navigated away from dashboard
> 42 |     await expect(page.url()).not.toBe('http://localhost:3000/');
     |                                  ^ Error: expect(received).not.toBe(expected) // Object.is equality
  43 |   });
  44 | 
  45 |   test('DASH-04: 관심 후보 목록 → Plan 페이지 이동', async ({ page }) => {
  46 |     await dashboard.goto();
  47 |     
  48 |     // Watchlist item NVDA should exist
  49 |     const nvdaLink = page.locator('a[href*="/plan?ticker=NVDA"]').first();
  50 |     await expect(nvdaLink).toBeVisible();
  51 |     
  52 |     // Verify it works
  53 |     await nvdaLink.click();
  54 |     await expect(page).toHaveURL(/\/plan\?ticker=NVDA/);
  55 |   });
  56 | 
  57 |   test('DASH-05: 최근 매매 흐름 → History 이동', async ({ page }) => {
  58 |     await dashboard.goto();
  59 | 
  60 |     // The fixture has AAPL or MSFT in recent trades
  61 |     const historyLink = page.locator('a[href*="/history?"]').first();
  62 |     if (await historyLink.isVisible()) {
  63 |         await historyLink.click();
  64 |         await expect(page).toHaveURL(/\/history/);
  65 |     }
  66 |   });
  67 | 
  68 |   test('DASH-06: 워크플로우 스텝 링크 작동', async ({ page }) => {
  69 |     await dashboard.goto();
  70 | 
  71 |     // Step 02: scanner
  72 |     const scanLink = page.locator('a[href="/scanner"]').first();
  73 |     await scanLink.click();
  74 |     await expect(page).toHaveURL(/\/scanner/);
  75 |   });
  76 | });
  77 | 
```