# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ft-03-market-analysis.spec.ts >> FT-03: 시장 분석 >> 매크로 분석 (/macro) >> 매크로 레짐 카드 렌더링
- Location: tests/e2e/smoke/ft-03-market-analysis.spec.ts:57:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=/매크로|Macro|레짐|Regime/i').first()
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for locator('text=/매크로|Macro|레짐|Regime/i').first()

```

```yaml
- navigation:
  - link "MTN Live Mantori's Trading Navigator":
    - /url: /
    - text: MTN Live
    - paragraph: Mantori's Trading Navigator
  - textbox "종목 검색 ⌘K":
    - /placeholder: 종목 검색  ⌘K
  - text: "S&P500 7,558.32 +0.19% Yahoo NASDAQ 26,230.70 +0.09% Yahoo KOSPI 7,475.94 +2.52% KIS KOSDAQ 837.43 +5.47% KIS USD/KRW 1,501.35 -0.13% Yahoo Last Updated: 2026.07.10. 22:54:01"
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
- text: 01 시장 분석
- link "오늘의 결론":
  - /url: /master-filter
- link "시장 밖 위험 점검":
  - /url: /macro
- main:
  - paragraph: STEP 01 · 시장 분석 / 시장 밖 위험 점검
  - heading "시장 밖 위험 점검" [level=1]
  - paragraph: 금리, 달러, 신용 시장, 시장 불안도처럼 큰 자금 흐름을 보고 권장 투자 비중을 조절합니다.
  - 'status "오늘 진입 결정: 비중 줄여 진입"':
    - text: 오늘의 결론 US 시장 · 진입 가능 지연 데이터
    - paragraph: 비중 줄여 진입
    - paragraph: 시장 내부 건강도는 통과했지만 시장 밖 위험이 불안합니다. 새 매수를 하더라도 절반 비중과 더 엄격한 손절선이 필요합니다.
    - paragraph: 종합 점수
    - paragraph: 91/100
    - paragraph: 새 매수 비중
    - paragraph: 50% 권장 상한
    - text: 진입 가능 신호는 좋지만 큰 흐름이 불안합니다 — 새 매수 시 권장 비중을 50%로 줄이고 손절선을 더 엄격히 보세요. 주요 근거
    - paragraph: 지수 평균선 위치 741.2 / 694.47
    - paragraph: 시장 폭 100
    - text: 판단 변경 트리거
    - paragraph: "빅테크 7종목 묶음이 핵심 가격선을 지키는가: 빅테크 약세가 다른 업종으로 흡수되는지 확인"
    - paragraph: "위험 선호 환율이 110선을 지키는가: 환율과 변동성 동시 확인"
    - paragraph: "강한 반등 확인 여부: 위험"
    - text: 데이터 신뢰도
    - paragraph: MTN Aggregator · Market Analysis Engine
    - paragraph: 2026. 7. 10. 오후 10:54:00
  - text: 오늘 시장 브리핑 2026. 7. 10. 오후 10:54:00 애매한 흐름
  - paragraph:
    - strong: "미국 시장:"
    - text: 시장 내부 건강도가 좋으면 종목 발굴을 진행할 수 있습니다. 다만 시장 밖 위험이 조심 구간이거나 애매하면 투자 비중과 추가 매수 속도를 낮춰야 합니다.
  - paragraph:
    - strong: "한국 시장:"
    - text: 한국 시장은 지수 추세, 원/달러, 외국인 수급, 반도체·2차전지 등 리더십의 폭을 함께 확인해 공격성을 조절합니다.
  - paragraph:
    - strong: 이 화면은 권장 투자 비중 조절용입니다.
    - text: 신규 진입 가능 여부는 반드시
    - link "오늘의 결론":
      - /url: /master-filter
    - text: 에서 먼저 확인하세요. 시장 내부 건강도가 좋지 않으면 시장 밖 위험 점수와 관계없이 새 매수는 보류합니다.
  - paragraph: 시장 밖 위험 점수
  - text: 53 /100 · 애매한 흐름 권장 비중 조절 · 매일 장마감 갱신
  - progressbar "시장 밖 위험 점수 53/100, 상태 애매한 흐름"
  - text: 조심 애매함 45 이상 좋음 70 이상 애매한 흐름
  - paragraph: 시장 밖 신호가 섞여 있습니다. 새 매수 비중을 줄이고 리스크 관리를 우선하세요.
  - button "세부 근거 보기"
  - text: 기준 2026. 7. 10. 오후 10:54:00
  - heading "시장 밖 위험 운용 원칙" [level=3]
  - list:
    - listitem: "투자하기 좋은 흐름: 새 매수 비중을 높일 수 있습니다. 시장 내부 건강도가 좋을 때 후보를 적극 검토합니다."
    - listitem: "애매한 흐름: 권장 비중을 줄입니다. 이미 보유 중인 종목은 손절선을 먼저 점검합니다."
    - listitem: "조심해야 할 흐름: 새 매수보다 현금 비중 확대와 포지션 정리가 우선입니다."
  - paragraph: 신용 시장
  - paragraph: HY OAS · HYG/IEF
  - paragraph: 돈이 위험자산을 편하게 보는지
  - paragraph: 금리/달러 부담
  - paragraph: UUP · TLT · Curve
  - paragraph: 달러와 금리가 시장에 주는 압박
  - paragraph: 시장 불안도
  - paragraph: VIX
  - paragraph: 불안 심리와 급등 위험
  - paragraph: 시장 참여 폭
  - paragraph: QQQ/SPY · IWM/SPY
  - paragraph: 성장주·소형주가 함께 움직이는지
  - paragraph: 시장 밖 위험 해석
  - paragraph: 큰 흐름 신호가 뚜렷하지 않은 애매한 구간입니다
  - list:
    - listitem: S&P 500이 50일 이동평균 위에 위치해 단기 추세가 유지되고 있습니다
    - listitem: 하이일드 채권과 국채 간 상대강도 차이(-0.04%p)가 중립 수준입니다
    - listitem: VIX 15.6 — 공포지수가 낮아 시장 심리가 안정적입니다
  - text: S&P 500 +0.19% $753.14 ▲ 대형주 추세 지표 50MA 위 Nasdaq 100 +0.04% $723.55 ▲ 기술주 강도 지표 50MA 위 HY Bond +0.00% $79.75 ▲ 하이일드 채권 · 위험자산 선호 신호 50MA 아래 7-10Y UST +0.04% $93.75 ▲ 중기 국채 · 안전자산 흐름 50MA 아래 20Y+ UST -0.00% $84.49 ▼ 장기 국채 · 금리 방향 50MA 아래 Gold -0.42% $376.60 ▼ 안전자산 수요 지표 50MA 아래 VIX -1.45% 15.61 ▼ 공포지수 · 변동성 레벨 Bitcoin +2.17% $64564.60 ▲ 위험선호 확장 지표
  - paragraph: 상대강도 비교
  - text: QQQ / SPY 기술주 쏠림 QQQ +0.04% vs SPY +0.19% ▼ 대형주 분산 진행 HYG / IEF 크레딧 스프레드 HYG +0.00% vs IEF +0.04% ▼ 안전자산 선호 · 국채 우위 IWM / SPY 중소형 순환매 IWM -0.16% vs SPY +0.19% ▼ 대형주 집중 · 폭 약화
  - paragraph: 진입 결정
  - paragraph: 시장 밖 위험 53점 — 애매한 흐름. 후보를 신중하게 검토하고 비중을 줄이세요.
  - link "오늘의 결론":
    - /url: /master-filter
- alert
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { smokeLogin, waitForContentLoad } from './helpers/auth';
  3  | 
  4  | /**
  5  |  * FT-03: 시장 분석 (/master-filter, /macro)
  6  |  */
  7  | test.describe('FT-03: 시장 분석', () => {
  8  |   test.beforeEach(async ({ page }) => {
  9  |     await smokeLogin(page);
  10 |   });
  11 | 
  12 |   test.describe('마스터 필터 (/master-filter)', () => {
  13 |     test('핵심 UI 요소 렌더링', async ({ page }) => {
  14 |       await page.goto('/master-filter');
  15 |       await waitForContentLoad(page);
  16 | 
  17 |       // STEP 01 라벨
  18 |       await expect(page.locator('text=STEP 01').first()).toBeVisible();
  19 |       await expect(page.locator('text=오늘의 결론').first()).toBeVisible();
  20 |     });
  21 | 
  22 |     test('US/KR 토글 동작', async ({ page }) => {
  23 |       await page.goto('/master-filter');
  24 |       await waitForContentLoad(page);
  25 | 
  26 |       const usBtn = page.locator('button:has-text("US 미국")');
  27 |       const krBtn = page.locator('button:has-text("KR 한국")');
  28 | 
  29 |       await krBtn.click();
  30 |       await waitForContentLoad(page);
  31 | 
  32 |       await usBtn.click();
  33 |       await waitForContentLoad(page);
  34 |     });
  35 | 
  36 |     test('지표 그리드 렌더링', async ({ page }) => {
  37 |       await page.goto('/master-filter');
  38 |       await waitForContentLoad(page, 45_000);
  39 | 
  40 |       // MetricsGrid가 로딩 후 지표 카드를 표시해야 함
  41 |       // 실제 API 응답 대기 필요
  42 |       const gridArea = page.locator('[class*="grid"]').first();
  43 |       await expect(gridArea).toBeVisible({ timeout: 30_000 });
  44 |     });
  45 |   });
  46 | 
  47 |   test.describe('매크로 분석 (/macro)', () => {
  48 |     test('페이지 로딩 + 자산 테이블', async ({ page }) => {
  49 |       await page.goto('/macro');
  50 |       await waitForContentLoad(page, 45_000);
  51 | 
  52 |       // 매크로 페이지 식별
  53 |       const body = await page.textContent('body');
  54 |       expect(body).toContain('매크로');
  55 |     });
  56 | 
  57 |     test('매크로 레짐 카드 렌더링', async ({ page }) => {
  58 |       await page.goto('/macro');
  59 |       await waitForContentLoad(page, 45_000);
  60 | 
  61 |       // RegimeHeroCard 또는 매크로 점수 표시
  62 |       const macroContent = page.locator('text=/매크로|Macro|레짐|Regime/i').first();
> 63 |       await expect(macroContent).toBeVisible({ timeout: 30_000 });
     |                                  ^ Error: expect(locator).toBeVisible() failed
  64 |     });
  65 | 
  66 |     test('자산별 가격 데이터 표시', async ({ page }) => {
  67 |       await page.goto('/macro');
  68 |       await waitForContentLoad(page, 45_000);
  69 | 
  70 |       // 주요 자산 심볼 존재 확인 (SPY, QQQ 등)
  71 |       const symbols = ['SPY', 'QQQ'];
  72 |       for (const sym of symbols) {
  73 |         const symLocator = page.locator(`text=${sym}`).first();
  74 |         const isVisible = await symLocator.isVisible().catch(() => false);
  75 |         if (isVisible) {
  76 |           expect(isVisible).toBeTruthy();
  77 |           break; // 하나라도 보이면 데이터 로딩 확인
  78 |         }
  79 |       }
  80 |     });
  81 |   });
  82 | });
  83 | 
```