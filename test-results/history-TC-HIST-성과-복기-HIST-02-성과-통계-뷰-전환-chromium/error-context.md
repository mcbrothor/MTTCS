# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: history.spec.ts >> TC-HIST: 성과 복기 >> HIST-02: 성과 통계 뷰 전환
- Location: tests/e2e/history.spec.ts:27:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=승률')
Expected: visible
Error: strict mode violation: locator('text=승률') resolved to 2 elements:
    1) <div class="mb-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">…</div> aka getByText('승률', { exact: true })
    2) <div class="text-[10px] text-slate-400">승률 0.0%</div> aka getByText('승률 0.0%')

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=승률')

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
              - button "성과 통계" [active] [ref=e137]
        - generic [ref=e138]:
          - generic [ref=e139]:
            - generic [ref=e140]:
              - generic [ref=e141]:
                - img [ref=e142]
                - heading "Performance Metrics" [level=3] [ref=e144]
              - generic [ref=e145]:
                - generic [ref=e147]:
                  - img [ref=e150]
                  - generic [ref=e152]:
                    - text: 승률
                    - button "승률 설명" [ref=e154]:
                      - img [ref=e155]
                  - generic [ref=e158]: 100.0%
                - generic [ref=e160]:
                  - img [ref=e163]
                  - generic [ref=e165]:
                    - text: 누적 손익
                    - button "누적 손익 설명" [ref=e167]:
                      - img [ref=e168]
                  - generic [ref=e171]: +$800.00
                - generic [ref=e173]:
                  - img [ref=e176]
                  - generic [ref=e180]:
                    - text: 평균 R-Multiple
                    - button "평균 R-Multiple 설명" [ref=e182]:
                      - img [ref=e183]
                  - generic [ref=e186]: 0.00R
                - generic [ref=e188]:
                  - img [ref=e191]
                  - generic [ref=e194]:
                    - text: 매매 기대값
                    - button "매매 기대값 설명" [ref=e196]:
                      - img [ref=e197]
                  - generic [ref=e200]: 0.00R
            - generic [ref=e201]:
              - generic [ref=e202]:
                - generic [ref=e203]:
                  - img [ref=e204]
                  - heading "Discipline & Adherence" [level=3] [ref=e207]
                - generic [ref=e208]:
                  - generic [ref=e210]:
                    - img [ref=e213]
                    - generic [ref=e216]:
                      - text: 평균 규칙 점수
                      - button "평균 규칙 점수 설명" [ref=e218]:
                        - img [ref=e219]
                    - generic [ref=e222]: 92.0pt
                  - generic [ref=e224]:
                    - img [ref=e227]
                    - generic [ref=e230]:
                      - text: 계획 준수율
                      - button "계획 준수율 설명" [ref=e232]:
                        - img [ref=e233]
                    - generic [ref=e236]: 100.0%
                  - generic [ref=e238]:
                    - img [ref=e241]
                    - generic [ref=e244]:
                      - text: SEPA 통과율
                      - button "SEPA 통과율 설명" [ref=e246]:
                        - img [ref=e247]
                    - generic [ref=e250]: 100.0%
              - generic [ref=e251]:
                - generic [ref=e252]:
                  - img [ref=e253]
                  - heading "Exposure & Pipeline" [level=3] [ref=e255]
                - generic [ref=e256]:
                  - generic [ref=e258]:
                    - img [ref=e261]
                    - generic [ref=e263]:
                      - text: 오픈 리스크
                      - button "오픈 리스크 설명" [ref=e265]:
                        - img [ref=e266]
                    - generic [ref=e269]: $0.00
                  - generic [ref=e271]:
                    - img [ref=e274]
                    - generic [ref=e276]:
                      - text: 진행 중 계획
                      - button "진행 중 계획 설명" [ref=e278]:
                        - img [ref=e279]
                    - generic [ref=e282]: "0"
          - generic [ref=e283]:
            - generic [ref=e284]:
              - heading "청산 사유별 성과" [level=3] [ref=e286]
              - generic [ref=e288]:
                - generic [ref=e289]:
                  - generic [ref=e290]: 목표가 도달
                  - generic [ref=e291]: 1건 (100.0%)
                - generic [ref=e292]:
                  - generic [ref=e293]: 0.00R
                  - generic [ref=e294]: 승률 0.0%
            - generic [ref=e295]:
              - generic [ref=e296]:
                - img [ref=e297]
                - generic [ref=e299]:
                  - heading "실수 태그 통계" [level=3] [ref=e300]
                  - paragraph [ref=e301]: 완료된 매매 기준으로 빈도와 평균 R을 함께 봅니다.
              - generic [ref=e302]: 완료된 매매에 기록된 실수 태그가 아직 없습니다.
          - generic [ref=e303]:
            - generic [ref=e305]:
              - heading "미국 최근 매매 복기" [level=3] [ref=e306]
              - paragraph [ref=e307]: 계획, 실제 체결, 복기를 한 거래 안에서 이어서 관리합니다.
            - table [ref=e309]:
              - rowgroup [ref=e310]:
                - row "날짜 종목 상태 R 순보유 평균 진입가 손익 규율 관리" [ref=e311]:
                  - columnheader "날짜" [ref=e312]
                  - columnheader "종목" [ref=e313]
                  - columnheader "상태" [ref=e314]
                  - columnheader "R" [ref=e315]
                  - columnheader "순보유" [ref=e316]
                  - columnheader "평균 진입가" [ref=e317]
                  - columnheader "손익" [ref=e318]
                  - columnheader "규율" [ref=e319]
                  - columnheader "관리" [ref=e320]
              - rowgroup [ref=e321]:
                - row "2026. 5. 20. AAPL Apple Inc. 보유 중 - - $195.00 - - 3-Layer 상세 수정 삭제" [ref=e322]:
                  - cell "2026. 5. 20." [ref=e323]
                  - cell "AAPL Apple Inc." [ref=e324]:
                    - paragraph [ref=e325]: AAPL
                    - paragraph [ref=e326]: Apple Inc.
                  - cell "보유 중" [ref=e327]:
                    - generic [ref=e328]: 보유 중
                  - cell "-" [ref=e329]:
                    - generic [ref=e331]: "-"
                  - cell "-" [ref=e332]
                  - cell "$195.00" [ref=e333]
                  - cell "-" [ref=e334]:
                    - generic [ref=e336]: "-"
                  - cell "-" [ref=e337]
                  - cell "3-Layer 상세 수정 삭제" [ref=e338]:
                    - generic [ref=e339]:
                      - button "AAPL 차트 보기" [ref=e340]:
                        - img [ref=e341]
                      - button "관심 종목에 추가" [ref=e344]:
                        - img [ref=e345]
                      - link "3-Layer" [ref=e347] [cursor=pointer]:
                        - /url: /history/trade-test-1?market=US
                      - button "상세" [ref=e348]
                      - button "수정" [ref=e349]
                      - button "삭제" [ref=e350]
                - row "2026. 5. 15. MSFT Microsoft Corporation 완료 - - $420.00 +$800.00 92pt 3-Layer 상세 수정 삭제" [ref=e351]:
                  - cell "2026. 5. 15." [ref=e352]
                  - cell "MSFT Microsoft Corporation" [ref=e353]:
                    - paragraph [ref=e354]: MSFT
                    - paragraph [ref=e355]: Microsoft Corporation
                  - cell "완료" [ref=e356]:
                    - generic [ref=e357]: 완료
                  - cell "-" [ref=e358]:
                    - generic [ref=e360]: "-"
                  - cell "-" [ref=e361]
                  - cell "$420.00" [ref=e362]
                  - cell "+$800.00" [ref=e363]:
                    - generic [ref=e365]: +$800.00
                  - cell "92pt" [ref=e366]:
                    - generic [ref=e367]: 92pt
                  - cell "3-Layer 상세 수정 삭제" [ref=e368]:
                    - generic [ref=e369]:
                      - button "MSFT 차트 보기" [ref=e370]:
                        - img [ref=e371]
                      - button "관심 종목에 추가" [ref=e374]:
                        - img [ref=e375]
                      - link "3-Layer" [ref=e377] [cursor=pointer]:
                        - /url: /history/trade-test-2?market=US
                      - button "상세" [ref=e378]
                      - button "수정" [ref=e379]
                      - button "삭제" [ref=e380]
        - link "Cycle Complete 오늘의 의사결정으로" [ref=e383] [cursor=pointer]:
          - /url: /
          - button "Cycle Complete 오늘의 의사결정으로" [ref=e384]:
            - generic [ref=e385]:
              - paragraph [ref=e386]: Cycle Complete
              - paragraph [ref=e387]: 오늘의 의사결정으로
            - img [ref=e389]
  - alert [ref=e392]
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
> 33 |     await expect(page.locator('text=승률')).toBeVisible();
     |                                           ^ Error: expect(locator).toBeVisible() failed
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
  47 |     await expect(page.locator('text=한국')).toBeVisible();
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