# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: history.spec.ts >> TC-HIST: 성과 복기 >> HIST-05: 미국 ↔ 한국 시장 전환
- Location: tests/e2e/history.spec.ts:38:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=한국')
Expected: visible
Error: strict mode violation: locator('text=한국') resolved to 2 elements:
    1) <button type="button" class="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors bg-slate-700 text-white shadow-sm">한국</button> aka getByRole('button', { name: '한국' })
    2) <h3 class="text-lg font-bold text-white">한국 전체 매매 복기</h3> aka getByRole('heading', { name: '한국 전체 매매 복기' })

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=한국')

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
              - link "매매 복기" [ref=e61] [cursor=pointer]:
                - /url: /history
              - link "성과 통계" [ref=e62] [cursor=pointer]:
                - /url: /history?view=stats
              - link "가이드" [ref=e63] [cursor=pointer]:
                - /url: /guide
              - link "링크 허브" [ref=e64] [cursor=pointer]:
                - /url: /links
              - link "관리" [ref=e65] [cursor=pointer]:
                - /url: /admin
              - button "로그아웃" [ref=e67]
      - generic [ref=e69]:
        - link "오늘 의사결정" [ref=e70] [cursor=pointer]:
          - /url: /
          - img [ref=e72]
          - generic [ref=e74]:
            - generic [ref=e75]: 오늘
            - generic [ref=e76]: 의사결정
        - link "시장 분석 진입 조건 확인" [ref=e77] [cursor=pointer]:
          - /url: /master-filter
          - img [ref=e79]
          - generic [ref=e81]:
            - generic [ref=e82]: 시장 분석
            - generic [ref=e83]: 진입 조건 확인
        - link "종목 발굴 SEPA/VCP · CAN SLIM" [ref=e84] [cursor=pointer]:
          - /url: /scanner
          - img [ref=e86]
          - generic [ref=e88]:
            - generic [ref=e89]: 종목 발굴
            - generic [ref=e90]: SEPA/VCP · CAN SLIM
        - link "콘테스트 LLM 비교 분석" [ref=e91] [cursor=pointer]:
          - /url: /contest
          - img [ref=e93]
          - generic [ref=e95]:
            - generic [ref=e96]: 콘테스트
            - generic [ref=e97]: LLM 비교 분석
        - link "관심종목 후보 추적" [ref=e98] [cursor=pointer]:
          - /url: /watchlist
          - img [ref=e100]
          - generic [ref=e102]:
            - generic [ref=e103]: 관심종목
            - generic [ref=e104]: 후보 추적
        - link "매매 계획 리스크 계산" [ref=e105] [cursor=pointer]:
          - /url: /plan
          - img [ref=e107]
          - generic [ref=e109]:
            - generic [ref=e110]: 매매 계획
            - generic [ref=e111]: 리스크 계산
        - link "포트폴리오 노출도 점검" [ref=e112] [cursor=pointer]:
          - /url: /portfolio
          - img [ref=e114]
          - generic [ref=e116]:
            - generic [ref=e117]: 포트폴리오
            - generic [ref=e118]: 노출도 점검
        - link "07 성과 복기 결과 축적" [ref=e119] [cursor=pointer]:
          - /url: /history
          - generic [ref=e120]: "07"
          - generic [ref=e121]:
            - generic [ref=e122]: 성과 복기
            - generic [ref=e123]: 결과 축적
    - main [ref=e124]:
      - generic [ref=e125]:
        - generic [ref=e126]:
          - generic [ref=e127]:
            - paragraph [ref=e128]: Review
            - heading "성과 복기" [level=1] [ref=e129]
            - paragraph [ref=e130]: 매매가 끝난 뒤 결과와 실수 태그를 축적하고, 통계는 필요할 때만 열어 확인합니다.
          - generic [ref=e131]:
            - generic [ref=e132]:
              - button "미국" [ref=e133]
              - button "한국" [ref=e134]
            - generic [ref=e135]:
              - button "복기 목록" [ref=e136]
              - button "성과 통계" [ref=e137]
        - generic [ref=e138]:
          - generic [ref=e140]:
            - heading "한국 전체 매매 복기" [level=3] [ref=e141]
            - paragraph [ref=e142]: 계획, 실제 체결, 복기를 한 거래 안에서 이어서 관리합니다.
          - table [ref=e144]:
            - rowgroup [ref=e145]:
              - row "날짜 종목 상태 R 순보유 평균 진입가 손익 규율 관리" [ref=e146]:
                - columnheader "날짜" [ref=e147]
                - columnheader "종목" [ref=e148]
                - columnheader "상태" [ref=e149]
                - columnheader "R" [ref=e150]
                - columnheader "순보유" [ref=e151]
                - columnheader "평균 진입가" [ref=e152]
                - columnheader "손익" [ref=e153]
                - columnheader "규율" [ref=e154]
                - columnheader "관리" [ref=e155]
            - rowgroup [ref=e156]:
              - row "첫 진입 체결을 기록하면 평균 진입가와 현재 R이 자동 계산됩니다." [ref=e157]:
                - cell "첫 진입 체결을 기록하면 평균 진입가와 현재 R이 자동 계산됩니다." [ref=e158]
        - link "Cycle Complete 오늘의 의사결정으로" [ref=e161] [cursor=pointer]:
          - /url: /
          - button "Cycle Complete 오늘의 의사결정으로" [ref=e162]:
            - generic [ref=e163]:
              - paragraph [ref=e164]: Cycle Complete
              - paragraph [ref=e165]: 오늘의 의사결정으로
            - img [ref=e167]
  - alert [ref=e170]
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
  24 |     await expect(page.locator('text=MSFT').first()).toBeVisible();
  25 |   });
  26 | 
  27 |   test('HIST-02: 성과 통계 뷰 전환', async ({ page }) => {
  28 |     await historyPage.goto();
  29 | 
  30 |     await historyPage.statsTab.click();
  31 | 
  32 |     // Dashboard metrics should appear
  33 |     await expect(page.locator('text=승률')).toBeVisible();
  34 |     await expect(page.locator('text=총 PnL')).toBeVisible();
  35 |     await expect(page.locator('text=계획 준수율')).toBeVisible();
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
> 47 |     await expect(page.locator('text=한국')).toBeVisible();
     |                                           ^ Error: expect(locator).toBeVisible() failed
  48 |   });
  49 | 
  50 |   test('HIST-06: 뷰 파라미터가 UI와 동기화됨', async ({ page }) => {
  51 |     // Go directly to stats view
  52 |     await historyPage.goto({ view: 'stats' });
  53 |     
  54 |     // Metric cards should be immediately visible
  55 |     await expect(page.locator('text=승률')).toBeVisible();
  56 |   });
  57 | });
  58 | 
```