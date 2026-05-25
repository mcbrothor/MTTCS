# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full-workflow.spec.ts >> TC-E2E: 전체 워크플로우 통합 시나리오 >> 시나리오 B: 방어적 흐름 (RISK_OFF / HALT) >> E2E-B02: RED/HALT 배너 메시지 표시
- Location: tests/e2e/full-workflow.spec.ts:130:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=/HALT|시장 상태/').first()
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=/HALT|시장 상태/').first()

```

```yaml
- navigation:
  - link "MTN Live Mantori's Trading Navigator":
    - /url: /
    - text: MTN Live
    - paragraph: Mantori's Trading Navigator
  - text: "S&P500 -- -- KIS NASDAQ -- -- KIS KOSPI -- -- KIS KOSDAQ -- -- KIS USD/KRW -- -- Yahoo Last Updated: 2026.05.24. 01:25:48"
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
  - link "Scanner Mode 미너비니 스캐너 Active SEPA · pivot · contraction quality":
    - /url: /scanner
    - text: Scanner Mode
    - paragraph: 미너비니 스캐너
    - text: Active
    - paragraph: SEPA · pivot · contraction quality
  - link "Scanner Mode 오닐 스캐너 7 pillars · earnings leadership":
    - /url: /canslim
    - text: Scanner Mode
    - paragraph: 오닐 스캐너
    - paragraph: 7 pillars · earnings leadership
  - heading "미너비니 스크리너" [level=1]
  - paragraph: 미너비니 SEPA 원칙과 VCP 패턴을 기반으로 최적의 진입 후보를 발굴합니다. 스캔 전 시장 분석 메뉴에서 현재 마스터 필터와 매크로 환경을 먼저 확인하는 것이 원칙입니다.
  - text: Universe NASDAQ 100 Results 0 Selected 0/15
  - paragraph: Scan Control
  - paragraph: 미너비니 SEPA 원칙과 VCP 패턴을 기반으로 최적의 진입 후보를 발굴합니다. 스캔 전 시장 분석 메뉴에서 현재 마스터 필터와 매크로 환경을 먼저 확인하는 것이 원칙입니다.
  - text: Universe Selection
  - button "NASDAQ 100 TECH GROWTH":
    - paragraph: NASDAQ 100
    - paragraph: TECH GROWTH
  - button "S&P 500 US MARKET":
    - paragraph: S&P 500
    - paragraph: US MARKET
  - button "KOSPI 시총 상위 200 KR MARKET":
    - paragraph: KOSPI 시총 상위 200
    - paragraph: KR MARKET
  - button "KOSDAQ 시총 상위 150 KR MARKET":
    - paragraph: KOSDAQ 시총 상위 150
    - paragraph: KR MARKET
  - text: View Mode
  - button "TABLE"
  - button "CARDS"
  - button "스캔 시작"
  - button "텔레그램 전송 (0)" [disabled]
  - paragraph: Recommended
  - paragraph: "0"
  - paragraph: 즉시 진입 우선순위
  - paragraph: Action
  - paragraph: "0"
  - paragraph: 관찰 진입 후보 (피벗 확인)
  - paragraph: IB Review
  - paragraph: "0"
  - paragraph: 위원회 검토 후보
  - paragraph: Errors
  - paragraph: "0"
  - paragraph: 구조적 또는 예외 확인
  - paragraph: Data Source
  - paragraph: NASDAQ 100
  - paragraph: "유니버스: 공식/공개 구성종목 API · 가격/분석: KIS → Yahoo fallback"
  - button "전체"
  - button "SEPA 통과"
  - button "Recommended"
  - button "Action"
  - button "IB Review"
  - button "IB 검토 풀"
  - button "피벗 5% 이내"
  - button "거래량 신호"
  - button "RS 90+"
  - button "오류"
  - button "상세 필터"
  - text: Sort
  - combobox "Sort":
    - option "시가총액순" [selected]
    - option "추천 우선"
    - option "VCP 점수순"
    - option "피벗 근접순"
    - option "SEPA 우선"
    - option "RS 우선"
  - text: Last scan No snapshot
  - heading "후보 발굴을 시작하세요" [level=3]
  - paragraph: 아직 스캔 결과가 없습니다. 스캔 시작 버튼을 눌러 동일한 미너비니 로직으로 후보를 발굴하세요.
  - paragraph: "Strategy Tip #1"
  - paragraph: RS 85 이상은 IB Review 후보의 출발점이며, RS 90 이상은 실행 후보에서 우대합니다.
  - paragraph: "Strategy Tip #2"
  - paragraph: 유효 VCP/HTF 피벗이 없는 최근 고점 fallback은 매수 타점으로 취급하지 않습니다.
  - button "지금 스캔 실행하기"
  - 'link "Step 3: Beauty Contest 최고의 차트 선정하기"':
    - /url: /contest
    - 'button "Step 3: Beauty Contest 최고의 차트 선정하기"':
      - paragraph: "Step 3: Beauty Contest"
      - paragraph: 최고의 차트 선정하기
- alert
```

# Test source

```ts
  36  | 
  37  |     test('E2E-A03: 스캐너 → 결과 확인 → 종목 선택', async ({ page }) => {
  38  |       await login(page);
  39  |       await page.goto('/scanner');
  40  | 
  41  |       // Scanner page loaded
  42  |       await expect(page.locator('text=미너비니 스크리너')).toBeVisible();
  43  | 
  44  |       // Stat cards should show fixture data
  45  |       // We have 1 Recommended, 1 Action, 1 IB Review, 1 Error from fixture
  46  |       await expect(page.locator('text=Recommended').first()).toBeVisible();
  47  |     });
  48  | 
  49  |     test('E2E-A04: 매매 계획 페이지 → 분석 로드 → SEPA 표시', async ({ page }) => {
  50  |       await login(page);
  51  |       await page.goto('/plan?ticker=NVDA&exchange=NAS&autoAnalyze=1');
  52  | 
  53  |       await expect(page.locator('text=신규 매매 계획')).toBeVisible();
  54  |       await expect(page.locator('text=NVDA').first()).toBeVisible({ timeout: 15_000 });
  55  |     });
  56  | 
  57  |     test('E2E-A05: 계획 저장 → POST /api/trades 호출 확인', async ({ page }) => {
  58  |       await login(page);
  59  |       await page.goto('/plan?ticker=NVDA&exchange=NAS&autoAnalyze=1');
  60  | 
  61  |       // Wait for analysis results
  62  |       await page.waitForTimeout(3_000);
  63  | 
  64  |       // Listen for the POST request
  65  |       const tradePostPromise = page.waitForRequest(
  66  |         (request) => request.url().includes('/api/trades') && request.method() === 'POST',
  67  |         { timeout: 15_000 }
  68  |       );
  69  | 
  70  |       // Complete checklist
  71  |       const checkboxes = page.locator('input[type="checkbox"]');
  72  |       const count = await checkboxes.count();
  73  |       for (let i = 0; i < count; i++) {
  74  |         const cb = checkboxes.nth(i);
  75  |         if (!(await cb.isChecked())) {
  76  |           await cb.check();
  77  |         }
  78  |       }
  79  | 
  80  |       // Save
  81  |       const saveButton = page.locator('button:has-text("계획 저장")');
  82  |       if (await saveButton.isVisible() && await saveButton.isEnabled()) {
  83  |         await saveButton.click();
  84  | 
  85  |         // Verify POST was sent
  86  |         const tradePost = await tradePostPromise.catch(() => null);
  87  |         if (tradePost) {
  88  |           expect(tradePost.method()).toBe('POST');
  89  |           const body = tradePost.postDataJSON();
  90  |           expect(body.ticker).toBe('NVDA');
  91  |         }
  92  |       }
  93  |     });
  94  | 
  95  |     test('E2E-A06: 포트폴리오에 포지션 표시', async ({ page }) => {
  96  |       await login(page);
  97  |       await page.goto('/portfolio');
  98  | 
  99  |       await expect(page.locator('text=포트폴리오 리스크')).toBeVisible();
  100 |       await expect(page.locator('text=AAPL')).toBeVisible();
  101 |       await expect(page.locator('text=총 자산')).toBeVisible();
  102 |     });
  103 | 
  104 |     test('E2E-A07: 성과 복기 페이지 표시', async ({ page }) => {
  105 |       await login(page);
  106 |       await page.goto('/history');
  107 | 
  108 |       await expect(page.locator('h1:has-text("성과 복기")').first()).toBeVisible();
  109 |       // Should have the completed trade from seed data
  110 |       await expect(page.locator('text=MSFT').first()).toBeVisible({ timeout: 10_000 }).catch(() => {
  111 |         // Trade table might load asynchronously, that's ok
  112 |       });
  113 |     });
  114 |   });
  115 | 
  116 |   test.describe('시나리오 B: 방어적 흐름 (RISK_OFF / HALT)', () => {
  117 |     test.beforeEach(async ({ page }) => {
  118 |       await setupHaltMocks(page);
  119 |     });
  120 | 
  121 |     test('E2E-B01: HALT 상태에서 스캐너 차단 확인', async ({ page }) => {
  122 |       await login(page);
  123 |       await page.goto('/scanner');
  124 | 
  125 |       // Should show HALT-related message or disabled scan button
  126 |       const haltMessage = page.locator('text=/HALT|차단|제한/');
  127 |       await expect(haltMessage.first()).toBeVisible({ timeout: 10_000 });
  128 |     });
  129 | 
  130 |     test('E2E-B02: RED/HALT 배너 메시지 표시', async ({ page }) => {
  131 |       await login(page);
  132 |       await page.goto('/scanner');
  133 | 
  134 |       // Macro action level HALT should show warning
  135 |       const banner = page.locator('text=/HALT|시장 상태/');
> 136 |       await expect(banner.first()).toBeVisible({ timeout: 10_000 });
      |                                    ^ Error: expect(locator).toBeVisible() failed
  137 |     });
  138 |   });
  139 | });
  140 | 
```