# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cp-02-discovery-to-plan.spec.ts >> CP-02: 종목 발굴 → 콘테스트 → 매매 계획 >> 매매 계획 페이지 — 티커 파라미터 연동
- Location: tests/e2e/smoke/cp-02-discovery-to-plan.spec.ts:80:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=AAPL').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('text=AAPL').first()

```

```yaml
- navigation:
  - link "MTN Live Mantori's Trading Navigator":
    - /url: /
    - text: MTN Live
    - paragraph: Mantori's Trading Navigator
  - textbox "종목 검색 ⌘K":
    - /placeholder: 종목 검색  ⌘K
  - text: "S&P500 7,548.80 +0.07% Yahoo NASDAQ 26,174.07 -0.13% Yahoo KOSPI 7,475.94 +2.52% KIS KOSDAQ 837.43 +5.47% KIS USD/KRW 1,501.94 -0.09% Yahoo Last Updated: 2026.07.10. 22:45:06"
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
  - link "사용 가이드":
    - /url: /guide
  - link "링크 허브":
    - /url: /links
  - link "관리":
    - /url: /admin
  - link "분석 큐":
    - /url: /admin/local-analysis
  - button "로그아웃"
- main:
  - paragraph: New Trade Plan
  - heading "신규 매매 계획" [level=1]
  - paragraph: SEPA 후보 검증 → VCP 피벗 분석 → 패턴 무효화 기반 수량 산출 → Centaur 체크리스트를 한 흐름으로 실행합니다.
  - button "🇺🇸 미국"
  - button "🇰🇷 한국"
  - text: "🇺🇸 미국 계좌 — 통화: USD ($)"
  - button "자동 분석 SEPA/VCP 기반으로 피벗, 손절, 수량을 자동 계산합니다."
  - button "수동 전략 산출 내가 정한 entry, stop, target으로 R/R과 수량만 계산합니다."
  - paragraph: 1. 종목 입력
  - heading "분석할 종목과 리스크 한도를 입력하세요" [level=2]
  - paragraph: 기본 허용 손실은 선택한 자본 기준의 1%입니다. 현재 계좌, 보수적 기준, 현금 기준, 직접 입력, 가상 시나리오 중 하나로 수량을 계산합니다.
  - text: 티커
  - 'textbox "티커 종목명: Apple Inc."':
    - /placeholder: "예: AAPL"
    - text: AAPL
  - text: "종목명: Apple Inc. 거래소"
  - combobox "거래소":
    - option "NASDAQ" [selected]
    - option "NYSE"
    - option "AMEX"
    - option "KOSPI"
    - option "KOSDAQ"
  - text: 허용 손실 %
  - spinbutton "허용 손실 %": "1"
  - text: 리스크 전략
  - combobox "리스크 전략":
    - option "자동 선택" [selected]
    - option "VCP 표준"
    - option "HTF 공격형"
    - option "ATR 변동성"
    - option "보수적 절반 리스크"
    - option "ONL 피라미딩"
  - button "분석 실행"
  - paragraph: 이번 계산에 사용할 자본 기준
  - paragraph: 계획 저장 시 선택한 기준과 계좌 상태가 함께 고정됩니다.
  - paragraph: 기준 금액
  - paragraph: $50,000.00
  - text: 자본 기준
  - combobox "자본 기준 현금과 보유 포지션 평가금액을 합친 현재 순자산을 사용합니다.":
    - option "현재 계좌 기준" [selected]
    - option "보수적 기준"
    - option "투자 가능 현금 기준"
    - option "직접 입력"
    - option "가상 시나리오"
  - paragraph: 현금과 보유 포지션 평가금액을 합친 현재 순자산을 사용합니다.
  - paragraph: 기준 시각
  - paragraph: 2026. 7. 10. 오후 10:45:02
  - paragraph: 총 평가자산
  - paragraph: $50,000.00
  - paragraph: 사용 가능 현금
  - paragraph: $50,000.00
  - paragraph: 기존 손절 리스크
  - paragraph: $0.00
  - paragraph: 남은 리스크 예산
  - paragraph: $3,000.00
  - paragraph: 이번 거래 최대 손실
  - paragraph: $500.00
- alert: MTN - Mantori's Trading Navigator
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { smokeLogin, waitForContentLoad } from './helpers/auth';
  3   | 
  4   | /**
  5   |  * CP-02: 종목 발굴 → 콘테스트 → 매매 계획 수립
  6   |  *
  7   |  * 페르소나: 김민수 — 스캐너에서 후보를 발견하고:
  8   |  * 1) 여러 스캐너 탭 순회
  9   |  * 2) 콘테스트에서 비교 분석
  10  |  * 3) 선택된 종목으로 매매 계획 수립
  11  |  */
  12  | test.describe('CP-02: 종목 발굴 → 콘테스트 → 매매 계획', () => {
  13  |   test.beforeEach(async ({ page }) => {
  14  |     await smokeLogin(page);
  15  |   });
  16  | 
  17  |   test('미너비니 스캐너 결과 로딩', async ({ page }) => {
  18  |     await page.goto('/scanner');
  19  |     await waitForContentLoad(page);
  20  | 
  21  |     await expect(page.locator('text=미너비니').first()).toBeVisible();
  22  | 
  23  |     // 스캐너 결과 존재 여부 (캐시 또는 라이브)
  24  |     // 빈 상태든 데이터든 에러 없이 렌더링되면 pass
  25  |     const body = await page.textContent('body');
  26  |     expect(body).toBeTruthy();
  27  |   });
  28  | 
  29  |   test('CAN SLIM 스캐너 페이지 로딩', async ({ page }) => {
  30  |     await page.goto('/canslim');
  31  |     await waitForContentLoad(page);
  32  | 
  33  |     // 페이지가 에러 없이 렌더링됨
  34  |     const hasTitle = await page.locator('text=/CAN\\s*SLIM|오닐/i').first().isVisible().catch(() => false);
  35  |     expect(hasTitle || true).toBeTruthy(); // 페이지 자체가 로드되면 pass
  36  |   });
  37  | 
  38  |   test('주도주 스캐너 페이지 로딩', async ({ page }) => {
  39  |     await page.goto('/leader');
  40  |     await waitForContentLoad(page);
  41  | 
  42  |     const body = await page.textContent('body');
  43  |     expect(body).toBeTruthy();
  44  |   });
  45  | 
  46  |   test('모멘텀 스캐너 페이지 로딩', async ({ page }) => {
  47  |     await page.goto('/momentum');
  48  |     await waitForContentLoad(page);
  49  | 
  50  |     const body = await page.textContent('body');
  51  |     expect(body).toBeTruthy();
  52  |   });
  53  | 
  54  |   test('쿨라매기 스캐너 페이지 로딩', async ({ page }) => {
  55  |     await page.goto('/qullamaggie');
  56  |     await waitForContentLoad(page);
  57  | 
  58  |     const body = await page.textContent('body');
  59  |     expect(body).toBeTruthy();
  60  |   });
  61  | 
  62  |   test('전환 초입 스캐너 페이지 로딩', async ({ page }) => {
  63  |     await page.goto('/reversal');
  64  |     await waitForContentLoad(page);
  65  | 
  66  |     const body = await page.textContent('body');
  67  |     expect(body).toBeTruthy();
  68  |   });
  69  | 
  70  |   test('콘테스트 페이지 로딩', async ({ page }) => {
  71  |     await page.goto('/contest');
  72  |     await waitForContentLoad(page);
  73  | 
  74  |     // 콘테스트 페이지 핵심 요소
  75  |     const body = await page.textContent('body');
  76  |     expect(body).toBeTruthy();
  77  |     // 유니버스 선택 UI 또는 세션 히스토리가 보여야 함
  78  |   });
  79  | 
  80  |   test('매매 계획 페이지 — 티커 파라미터 연동', async ({ page }) => {
  81  |     await page.goto('/plan?ticker=AAPL&exchange=NAS');
  82  |     await waitForContentLoad(page);
  83  | 
  84  |     // 매매 계획 페이지 식별
  85  |     await expect(page.locator('text=신규 매매 계획').first()).toBeVisible({ timeout: 15_000 });
  86  | 
  87  |     // AAPL 티커가 표시됨
> 88  |     await expect(page.locator('text=AAPL').first()).toBeVisible({ timeout: 15_000 });
      |                                                     ^ Error: expect(locator).toBeVisible() failed
  89  |   });
  90  | 
  91  |   test('매매 계획 페이지 — 자동 분석 실행', async ({ page }) => {
  92  |     await page.goto('/plan?ticker=NVDA&exchange=NAS&autoAnalyze=1');
  93  |     await waitForContentLoad(page);
  94  | 
  95  |     await expect(page.locator('text=신규 매매 계획').first()).toBeVisible({ timeout: 15_000 });
  96  |     await expect(page.locator('text=NVDA').first()).toBeVisible({ timeout: 20_000 });
  97  | 
  98  |     // SEPA 분석 결과 또는 로딩 중 표시
  99  |     const sepaVisible = await page.locator('text=/SEPA|추세|Trend/i').first().isVisible().catch(() => false);
  100 |     // SEPA 분석이 실제 API를 호출하므로 로딩 시간이 필요할 수 있음
  101 |     if (!sepaVisible) {
  102 |       await page.waitForTimeout(5_000);
  103 |     }
  104 |   });
  105 | 
  106 |   test('스캐너 → 콘테스트 → 계획 전체 흐름', async ({ page }) => {
  107 |     // Step 1: 스캐너
  108 |     await page.goto('/scanner');
  109 |     await waitForContentLoad(page);
  110 |     await expect(page.locator('text=미너비니').first()).toBeVisible();
  111 | 
  112 |     // Step 2: 콘테스트
  113 |     await page.goto('/contest');
  114 |     await waitForContentLoad(page);
  115 |     const contestContent = await page.textContent('body');
  116 |     expect(contestContent).toBeTruthy();
  117 | 
  118 |     // Step 3: 매매 계획
  119 |     await page.goto('/plan');
  120 |     await waitForContentLoad(page);
  121 |     await expect(page.locator('text=신규 매매 계획').first()).toBeVisible({ timeout: 15_000 });
  122 |   });
  123 | });
  124 | 
```