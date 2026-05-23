# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: history.spec.ts >> TC-HIST: 성과 복기 >> HIST-01: 복기 목록 뷰 로드 (기본 화면)
- Location: tests/e2e/history.spec.ts:15:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('text=MSFT').first()
Expected: visible
Received: hidden
Timeout:  10000ms

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=MSFT').first()
    24 × locator resolved to <span class="font-mono font-semibold text-white">MSFT</span>
       - unexpected value "hidden"

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
  - link "매매 복기":
    - /url: /history
  - link "성과 통계":
    - /url: /history?view=stats
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
- link "포트폴리오 노출도 점검":
  - /url: /portfolio
- link "07 성과 복기 결과 축적":
  - /url: /history
- main:
  - paragraph: Review
  - heading "성과 복기" [level=1]
  - paragraph: 매매가 끝난 뒤 결과와 실수 태그를 축적하고, 통계는 필요할 때만 열어 확인합니다.
  - button "미국"
  - button "한국"
  - button "복기 목록"
  - button "성과 통계"
  - heading "미국 전체 매매 복기" [level=3]
  - paragraph: 계획, 실제 체결, 복기를 한 거래 안에서 이어서 관리합니다.
  - table:
    - rowgroup:
      - row "날짜 종목 상태 R 순보유 평균 진입가 손익 규율 관리":
        - columnheader "날짜"
        - columnheader "종목"
        - columnheader "상태"
        - columnheader "R"
        - columnheader "순보유"
        - columnheader "평균 진입가"
        - columnheader "손익"
        - columnheader "규율"
        - columnheader "관리"
    - rowgroup:
      - row "2026. 5. 20. AAPL Apple Inc. 보유 중 - - $195.00 - - 3-Layer 상세 수정 삭제":
        - cell "2026. 5. 20."
        - cell "AAPL Apple Inc.":
          - paragraph: AAPL
          - paragraph: Apple Inc.
        - cell "보유 중"
        - cell "-"
        - cell "-"
        - cell "$195.00"
        - cell "-"
        - cell "-"
        - cell "3-Layer 상세 수정 삭제":
          - button "AAPL 차트 보기"
          - button "관심 종목에 추가"
          - link "3-Layer":
            - /url: /history/trade-test-1?market=US
          - button "상세"
          - button "수정"
          - button "삭제"
      - row "2026. 5. 15. MSFT Microsoft Corporation 완료 - - $420.00 +$800.00 92pt 3-Layer 상세 수정 삭제":
        - cell "2026. 5. 15."
        - cell "MSFT Microsoft Corporation":
          - paragraph: MSFT
          - paragraph: Microsoft Corporation
        - cell "완료"
        - cell "-"
        - cell "-"
        - cell "$420.00"
        - cell "+$800.00"
        - cell "92pt"
        - cell "3-Layer 상세 수정 삭제":
          - button "MSFT 차트 보기"
          - button "관심 종목에 추가"
          - link "3-Layer":
            - /url: /history/trade-test-2?market=US
          - button "상세"
          - button "수정"
          - button "삭제"
  - link "Cycle Complete 오늘의 의사결정으로":
    - /url: /
    - button "Cycle Complete 오늘의 의사결정으로":
      - paragraph: Cycle Complete
      - paragraph: 오늘의 의사결정으로
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { login } from './helpers/auth';
  3  | import { setupAllMocks } from './mocks/handlers';
  4  | import { HistoryPage } from './helpers/page-objects';
  5  | 
  6  | test.describe('TC-HIST: 성과 복기', () => {
  7  |   let historyPage: HistoryPage;
  8  | 
  9  |   test.beforeEach(async ({ page }) => {
  10 |     await setupAllMocks(page);
  11 |     await login(page);
  12 |     historyPage = new HistoryPage(page);
  13 |   });
  14 | 
  15 |   test('HIST-01: 복기 목록 뷰 로드 (기본 화면)', async ({ page }) => {
  16 |     await historyPage.goto();
  17 | 
  18 |     await expect(page.locator('h1:has-text("성과 복기")').first()).toBeVisible();
  19 |     
  20 |     // TradeTable should be visible
  21 |     await expect(historyPage.tradeTable).toBeVisible();
  22 |     
  23 |     // Fixture data should appear (e.g. MSFT or AAPL)
> 24 |     await expect(page.locator('text=MSFT').first()).toBeVisible();
     |                                                     ^ Error: expect(locator).toBeVisible() failed
  25 |   });
  26 | 
  27 |   test('HIST-02: 성과 통계 뷰 전환', async ({ page }) => {
  28 |     await historyPage.goto();
  29 | 
  30 |     await historyPage.statsTab.click();
  31 | 
  32 |     // Dashboard metrics should appear
  33 |     await expect(page.locator('div').filter({ hasText: /^승률$/ }).first()).toBeVisible();
  34 |     await expect(page.locator('div').filter({ hasText: /^총 PnL$/ }).first()).toBeVisible();
  35 |     await expect(page.locator('div').filter({ hasText: /^계획 준수율$/ }).first()).toBeVisible();
  36 |   });
  37 | 
  38 |   test('HIST-05: 미국 ↔ 한국 시장 전환', async ({ page }) => {
  39 |     await historyPage.goto();
  40 | 
  41 |     await historyPage.marketToggleKR.click();
  42 |     
  43 |     // The URL should update
  44 |     await expect(page).toHaveURL(/market=KR/);
  45 |     
  46 |     // Check if UI reflects KR context
  47 |     await expect(page.locator('button:has-text("한국")').first()).toBeVisible();
  48 |   });
  49 | 
  50 |   test('HIST-06: 뷰 파라미터가 UI와 동기화됨', async ({ page }) => {
  51 |     // Go directly to stats view
  52 |     await historyPage.goto({ view: 'stats' });
  53 |     
  54 |     // Metric cards should be immediately visible
  55 |     await expect(page.locator('div').filter({ hasText: /^승률$/ }).first()).toBeVisible();
  56 |   });
  57 | });
  58 | 
```