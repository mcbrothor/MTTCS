# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: macro.spec.ts >> TC-MACRO: 매크로 분석 >> 정상 플로우 (RISK_ON) >> MACRO-01: RISK_ON 레짐 카드 표시
- Location: tests/e2e/macro.spec.ts:12:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Macro Analysis')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=Macro Analysis')

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
  - paragraph: STEP 01 · 시장 분석 / 매크로
  - heading "매크로 분석" [level=1]
  - paragraph: 글로벌 자금 흐름과 리스크 선호도를 6개 컴포넌트로 점수화합니다. 마스터 필터와 함께 확인해 진입 공격성을 조절하세요.
  - text: DECISION COCKPIT 동기화 중
  - paragraph: 시장 데이터 확인 중
  - paragraph: 마스터 필터와 매크로 레짐을 동시에 확인하고 있습니다. 응답이 지연되면 데이터 미채점 상태로 전환합니다.
  - paragraph: P3 Score
  - paragraph: PENDING
  - paragraph: Exposure
  - paragraph: Hold
  - text: IB MARKET DESK BRIEFING RISK-ON
  - paragraph:
    - strong: "미국 시장:"
    - text: 마스터 필터가 GREEN이면 종목 발굴을 진행할 수 있습니다. 다만 매크로 레짐이 RISK-OFF 또는 NEUTRAL이면 포지션 사이즈와 피라미딩 속도를 낮춰야 합니다.
  - paragraph:
    - strong: "한국 시장:"
    - text: 한국 시장은 지수 추세, 원/달러, 외국인 수급, 반도체·2차전지 등 리더십의 폭을 함께 확인해 공격성을 조절합니다.
  - paragraph:
    - strong: 이 화면은 포지션 사이즈 조절용입니다.
    - text: 신규 진입 가능 여부는 반드시
    - link "마스터 필터":
      - /url: /master-filter
    - text: 에서 먼저 확인하세요. 마스터 필터가 RED/YELLOW이면 매크로 점수와 관계없이 신규 진입은 금지입니다.
  - paragraph: MACRO REGIME
  - text: 78 /100 · RISK-ON 공격성 조절 · 매일 장마감 갱신
  - progressbar "매크로 레짐 점수 78/100, 상태 RISK-ON"
  - text: Risk-OFF Neutral ≥45 Risk-ON ≥70 RISK-ON
  - paragraph: 추세 추종과 공격적 종목 탐색에 우호적인 매크로 환경입니다. 마스터 필터 상태를 함께 확인하세요.
  - button "컴포넌트 근거 보기"
  - text: Macro Score 7일 추세 0pt (78 → 78)
  - application
  - text: ── RISK-ON ≥70 ── NEUTRAL ≥45 기준 2026. 5. 23. 오후 11:00:00
  - heading "매크로 운용 원칙" [level=3]
  - list:
    - listitem: "RISK-ON: 진입 비중 최대화. 마스터 필터 GREEN 조건 충족 시 공격적 후보 탐색."
    - listitem: "NEUTRAL: 진입 비중 절반 이하. 이미 보유 중인 종목 손절선 점검 우선."
    - listitem: "RISK-OFF: 신규 매수 중단. 현금 비중 확대 및 포지션 정리 우선."
  - paragraph: Credit
  - paragraph: HY OAS · HYG/IEF
  - paragraph: 크레딧 스프레드 축소 여부
  - paragraph: Rates / FX
  - paragraph: UUP · TLT · Curve
  - paragraph: 달러와 금리 충격 방향
  - paragraph: Volatility
  - paragraph: VIX
  - paragraph: 변동성 레벨과 급등 위험
  - paragraph: Leadership
  - paragraph: QQQ/SPY · IWM/SPY
  - paragraph: 성장주·소형주 참여 폭
  - paragraph: 매크로 해석
  - paragraph: 글로벌 자금 흐름이 위험자산으로 향하는 국면입니다
  - list:
    - listitem: S&P 500이 50일 이동평균 위에 위치해 단기 추세가 유지되고 있습니다
    - listitem: 하이일드 채권(HYG)이 국채(IEF) 대비 0.45%p 강세로 신용 시장이 Risk-ON을 지지합니다
    - listitem: VIX 14.2 — 공포지수가 낮아 시장 심리가 안정적입니다
  - text: S&P 500 +0.85% $542.30 ▲ 대형주 추세 지표 50MA 위 Nasdaq 100 +1.12% $478.50 ▲ 기술주 강도 지표 50MA 위 HY Bond +0.32% $78.40 ▲ 하이일드 채권 · Risk-ON 신호 50MA 위 7-10Y UST -0.15% $95.20 ▼ 중기 국채 · 안전자산 흐름 50MA 아래 20Y+ UST -0.28% $98.50 ▼ 장기 국채 · 금리 방향 50MA 아래 Gold +0.55% $225.80 ▲ 안전자산 수요 지표 50MA 위 VIX -3.40% 14.20 ▼ 공포지수 · 변동성 레벨 Bitcoin +2.30% $108500.00 ▲ 위험선호 확장 지표
  - paragraph: 상대강도 비교
  - text: QQQ / SPY 기술주 쏠림 QQQ +1.12% vs SPY +0.85% ▲ 빅테크 주도 장세 HYG / IEF 크레딧 스프레드 HYG +0.32% vs IEF -0.15% ▲ Risk-ON · 하이일드 강세
  - paragraph: 진입 결정
  - paragraph: 레짐 78점 — RISK-ON 환경. 마스터 필터가 GREEN이면 공격적 후보를 탐색하세요.
  - link "마스터 필터":
    - /url: /master-filter
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
> 16 |       await expect(page.locator('text=Macro Analysis')).toBeVisible();
     |                                                         ^ Error: expect(locator).toBeVisible() failed
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
  27 |       await expect(page.locator('text=SPY')).toBeVisible();
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