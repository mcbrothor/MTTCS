# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full-workflow.spec.ts >> TC-E2E: 전체 워크플로우 통합 시나리오 >> 시나리오 A: 정상 흐름 (RISK_ON + 강한 후보) >> E2E-A03: 스캐너 → 결과 확인 → 종목 선택
- Location: tests/e2e/full-workflow.spec.ts:37:9

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
  3   | import { setupAllMocks, setupHaltMocks } from './mocks/handlers';
  4   | import { DashboardPage } from './helpers/page-objects';
  5   | 
  6   | test.describe('TC-E2E: 전체 워크플로우 통합 시나리오', () => {
  7   |   test.describe('시나리오 A: 정상 흐름 (RISK_ON + 강한 후보)', () => {
  8   |     test.beforeEach(async ({ page }) => {
  9   |       await setupAllMocks(page);
  10  |     });
  11  | 
  12  |     test('E2E-A01: 로그인 → 대시보드 시장 상태 표시', async ({ page }) => {
  13  |       await login(page);
  14  | 
  15  |       const dashboard = new DashboardPage(page);
  16  |       // Command Center header
  17  |       await expect(page.locator('text=Command Center')).toBeVisible();
  18  |       await expect(page.locator('text=오늘의 의사결정')).toBeVisible();
  19  | 
  20  |       // Market state card should show something
  21  |       await expect(page.locator('div').filter({ hasText: /^시장 상태$/ }).first()).toBeVisible();
  22  |     });
  23  | 
  24  |     test('E2E-A02: 대시보드 → 마스터 필터 → 스캐너 내비게이션', async ({ page }) => {
  25  |       await login(page);
  26  | 
  27  |       // Click flow link "01 시장 확인"
  28  |       const masterFilterLink = page.locator('a[href="/master-filter"]').first();
  29  |       await masterFilterLink.click();
  30  |       await expect(page).toHaveURL(/master-filter/);
  31  | 
  32  |       // Navigate to scanner
  33  |       await page.goto('/scanner');
  34  |       await expect(page.locator('text=미너비니 스크리너')).toBeVisible();
  35  |     });
  36  | 
  37  |     test('E2E-A03: 스캐너 → 결과 확인 → 종목 선택', async ({ page }) => {
  38  |       await login(page);
  39  |       await page.goto('/scanner');
  40  | 
  41  |       // Scanner page loaded
> 42  |       await expect(page.locator('text=미너비니 스크리너')).toBeVisible();
      |                                                    ^ Error: expect(locator).toBeVisible() failed
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
  136 |       await expect(banner.first()).toBeVisible({ timeout: 10_000 });
  137 |     });
  138 |   });
  139 | });
  140 | 
```