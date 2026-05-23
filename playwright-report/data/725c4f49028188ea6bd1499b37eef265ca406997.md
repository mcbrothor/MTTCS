# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: responsive.spec.ts >> Wave 5: 반응형 디자인 테스트 >> Mobile Viewport (375x812) >> RESP-03: 스캐너 모바일 카드 뷰 자동 전환
- Location: tests/e2e/responsive.spec.ts:25:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=NVDA')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=NVDA')

```

```yaml
- banner:
  - link "MTN":
    - /url: /
  - button "메뉴 열기": 메뉴
- link "미너비니 스크리닝":
  - /url: /scanner
- link "윌리엄 오닐 스크리닝":
  - /url: /canslim
- navigation:
  - link "오늘":
    - /url: /
  - link "시장":
    - /url: /master-filter
  - link "발굴":
    - /url: /scanner
  - link "계획":
    - /url: /plan
  - link "복기":
    - /url: /history
- complementary:
  - text: 전체 메뉴
  - button "메뉴 닫기"
  - paragraph: 트레이딩 플로우
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
  - link "포트폴리오 노출도 점검":
    - /url: /portfolio
  - link "성과 복기 결과 축적":
    - /url: /history
  - paragraph: 유틸리티
  - link "가이드":
    - /url: /guide
  - link "링크 허브":
    - /url: /links
  - link "관리":
    - /url: /admin
  - button "로그아웃"
- main:
  - paragraph: 오류가 발생했습니다
  - paragraph: Cannot read properties of undefined (reading 'updatedAt')
  - button "다시 시도"
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { login } from './helpers/auth';
  3  | import { setupAllMocks } from './mocks/handlers';
  4  | 
  5  | test.describe('Wave 5: 반응형 디자인 테스트', () => {
  6  |   test.beforeEach(async ({ page }) => {
  7  |     await setupAllMocks(page);
  8  |     await login(page);
  9  |   });
  10 | 
  11 |   test.describe('Mobile Viewport (375x812)', () => {
  12 |     test.use({ viewport: { width: 375, height: 812 } });
  13 | 
  14 |     test('RESP-01: 대시보드 모바일 렌더링', async ({ page }) => {
  15 |       await page.goto('/');
  16 |       // Command Center title should still be visible and not overflow
  17 |       const title = page.locator('text=Command Center');
  18 |       await expect(title).toBeVisible();
  19 |       
  20 |       // Cards should stack vertically, so riskCard might need scrolling
  21 |       // We just ensure it's in the DOM and visible (Playwright auto-scrolls)
  22 |       await expect(page.locator('text=오픈 리스크')).toBeVisible();
  23 |     });
  24 | 
  25 |     test('RESP-03: 스캐너 모바일 카드 뷰 자동 전환', async ({ page }) => {
  26 |       await page.goto('/scanner');
  27 |       // In mobile, table view is usually hidden and card view is shown
  28 |       // Check if grid structure exists or table is hidden
  29 |       // The exact implementation might vary, but we can verify the data is present
> 30 |       await expect(page.locator('text=NVDA')).toBeVisible();
     |                                               ^ Error: expect(locator).toBeVisible() failed
  31 |       
  32 |       // Filter buttons should still be accessible
  33 |       const filterBtn = page.locator('button:has-text("Recommended")');
  34 |       await expect(filterBtn).toBeVisible();
  35 |     });
  36 | 
  37 |     test('RESP-04: 모바일 내비게이션 바 메뉴 확인', async ({ page }) => {
  38 |       await page.goto('/');
  39 |       // Often mobile has a hamburger menu instead of full links
  40 |       // Let's verify we can still navigate to history
  41 |       const historyLink = page.locator('a[href="/history"]').first();
  42 |       // It might be inside a mobile menu or just an icon. We check it's attached.
  43 |       expect(await historyLink.count()).toBeGreaterThan(0);
  44 |     });
  45 |   });
  46 | 
  47 |   test.describe('Tablet Viewport (768x1024)', () => {
  48 |     test.use({ viewport: { width: 768, height: 1024 } });
  49 | 
  50 |     test('RESP-02: 태블릿 환경 포트폴리오 레이아웃', async ({ page }) => {
  51 |       await page.goto('/portfolio');
  52 |       await expect(page.locator('text=포트폴리오 리스크')).toBeVisible();
  53 |       // Verify metric cards are present
  54 |       await expect(page.locator('text=총 자산')).toBeVisible();
  55 |     });
  56 |   });
  57 | });
  58 | 
```