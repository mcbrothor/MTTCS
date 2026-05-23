# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: macro.spec.ts >> TC-MACRO: 매크로 분석 >> 정상 플로우 (RISK_ON) >> MACRO-04: 자산 그리드 8개 카드 표시
- Location: tests/e2e/macro.spec.ts:23:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=SPY')
Expected: visible
Error: strict mode violation: locator('text=SPY') resolved to 3 elements:
    1) <p class="mt-1 text-sm font-bold text-[var(--text-primary)]">QQQ/SPY · IWM/SPY</p> aka getByText('QQQ/SPY · IWM/SPY')
    2) <span class="text-[11px] font-bold text-emerald-400">QQQ / SPY</span> aka getByText('QQQ / SPY')
    3) <div class="font-mono text-[10px] text-[var(--text-secondary)] mb-1">…</div> aka getByText('QQQ +1.12% vs SPY +0.85%')

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('text=SPY')

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
              - link "마스터 필터" [ref=e61] [cursor=pointer]:
                - /url: /master-filter
              - link "매크로" [ref=e62] [cursor=pointer]:
                - /url: /macro
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
        - link "01 시장 분석 진입 조건 확인" [ref=e77] [cursor=pointer]:
          - /url: /master-filter
          - generic [ref=e78]: "01"
          - generic [ref=e79]:
            - generic [ref=e80]: 시장 분석
            - generic [ref=e81]: 진입 조건 확인
        - link "02 종목 발굴 SEPA/VCP · CAN SLIM" [ref=e82] [cursor=pointer]:
          - /url: /scanner
          - generic [ref=e83]: "02"
          - generic [ref=e84]:
            - generic [ref=e85]: 종목 발굴
            - generic [ref=e86]: SEPA/VCP · CAN SLIM
        - link "03 콘테스트 LLM 비교 분석" [ref=e87] [cursor=pointer]:
          - /url: /contest
          - generic [ref=e88]: "03"
          - generic [ref=e89]:
            - generic [ref=e90]: 콘테스트
            - generic [ref=e91]: LLM 비교 분석
        - link "04 관심종목 후보 추적" [ref=e92] [cursor=pointer]:
          - /url: /watchlist
          - generic [ref=e93]: "04"
          - generic [ref=e94]:
            - generic [ref=e95]: 관심종목
            - generic [ref=e96]: 후보 추적
        - link "05 매매 계획 리스크 계산" [ref=e97] [cursor=pointer]:
          - /url: /plan
          - generic [ref=e98]: "05"
          - generic [ref=e99]:
            - generic [ref=e100]: 매매 계획
            - generic [ref=e101]: 리스크 계산
        - link "06 포트폴리오 노출도 점검" [ref=e102] [cursor=pointer]:
          - /url: /portfolio
          - generic [ref=e103]: "06"
          - generic [ref=e104]:
            - generic [ref=e105]: 포트폴리오
            - generic [ref=e106]: 노출도 점검
        - link "07 성과 복기 결과 축적" [ref=e107] [cursor=pointer]:
          - /url: /history
          - generic [ref=e108]: "07"
          - generic [ref=e109]:
            - generic [ref=e110]: 성과 복기
            - generic [ref=e111]: 결과 축적
    - main [ref=e112]:
      - generic [ref=e113]:
        - generic [ref=e114]:
          - paragraph [ref=e115]: STEP 01 · 시장 분석 / 매크로
          - heading "매크로 분석" [level=1] [ref=e116]
          - paragraph [ref=e117]: 글로벌 자금 흐름과 리스크 선호도를 6개 컴포넌트로 점수화합니다. 마스터 필터와 함께 확인해 진입 공격성을 조절하세요.
        - generic [ref=e118]:
          - generic [ref=e119]:
            - generic [ref=e120]: DECISION COCKPIT
            - generic [ref=e121]: 동기화 중
          - generic [ref=e122]:
            - generic [ref=e123]:
              - paragraph [ref=e124]: 시장 데이터 확인 중
              - paragraph [ref=e125]: 마스터 필터와 매크로 레짐을 동시에 확인하고 있습니다. 응답이 지연되면 데이터 미채점 상태로 전환합니다.
            - generic [ref=e126]:
              - generic [ref=e127]:
                - paragraph [ref=e128]: P3 Score
                - paragraph [ref=e129]: PENDING
              - generic [ref=e130]:
                - paragraph [ref=e131]: Exposure
                - paragraph [ref=e132]: Hold
        - generic [ref=e134]:
          - img [ref=e136]
          - generic [ref=e139]:
            - generic [ref=e140]:
              - generic [ref=e141]: IB MARKET DESK BRIEFING
              - generic [ref=e142]: RISK-ON
            - paragraph [ref=e143]:
              - strong [ref=e144]: "미국 시장:"
              - text: 마스터 필터가 GREEN이면 종목 발굴을 진행할 수 있습니다. 다만 매크로 레짐이 RISK-OFF 또는 NEUTRAL이면 포지션 사이즈와 피라미딩 속도를 낮춰야 합니다.
            - paragraph [ref=e145]:
              - strong [ref=e146]: "한국 시장:"
              - text: 한국 시장은 지수 추세, 원/달러, 외국인 수급, 반도체·2차전지 등 리더십의 폭을 함께 확인해 공격성을 조절합니다.
        - generic [ref=e147]:
          - img [ref=e148]
          - paragraph [ref=e150]:
            - strong [ref=e151]: 이 화면은 포지션 사이즈 조절용입니다.
            - text: 신규 진입 가능 여부는 반드시
            - link "마스터 필터" [ref=e152] [cursor=pointer]:
              - /url: /master-filter
            - text: 에서 먼저 확인하세요. 마스터 필터가 RED/YELLOW이면 매크로 점수와 관계없이 신규 진입은 금지입니다.
        - generic [ref=e153]:
          - generic [ref=e154]:
            - generic [ref=e155]:
              - generic [ref=e157]:
                - paragraph [ref=e158]: MACRO REGIME
                - generic [ref=e159]:
                  - generic [ref=e160]: "78"
                  - generic [ref=e161]:
                    - generic [ref=e162]: /100 ·
                    - generic [ref=e163]:
                      - img [ref=e164]
                      - text: RISK-ON
                - generic [ref=e167]: 공격성 조절 · 매일 장마감 갱신
                - generic [ref=e168]:
                  - progressbar "매크로 레짐 점수 78/100, 상태 RISK-ON" [ref=e169]
                  - generic [ref=e173]:
                    - generic [ref=e174]: Risk-OFF
                    - generic [ref=e175]: Neutral ≥45
                    - generic [ref=e176]: Risk-ON ≥70
                - generic [ref=e177]:
                  - generic [ref=e178]:
                    - img [ref=e180]
                    - generic [ref=e183]: RISK-ON
                  - paragraph [ref=e184]: 추세 추종과 공격적 종목 탐색에 우호적인 매크로 환경입니다. 마스터 필터 상태를 함께 확인하세요.
              - button "컴포넌트 근거 보기" [ref=e186]:
                - generic [ref=e187]: 컴포넌트 근거 보기
                - img [ref=e188]
              - generic [ref=e191]:
                - generic [ref=e192]:
                  - generic [ref=e193]: Macro Score 7일 추세
                  - generic [ref=e194]: 0pt (78 → 78)
                - application [ref=e198]
                - generic [ref=e207]:
                  - generic [ref=e208]: ── RISK-ON ≥70
                  - generic [ref=e209]: ── NEUTRAL ≥45
              - generic [ref=e210]:
                - img [ref=e211]
                - generic [ref=e214]: 기준 2026. 5. 23. 오후 11:00:00
            - generic [ref=e215]:
              - heading "매크로 운용 원칙" [level=3] [ref=e216]
              - list [ref=e217]:
                - listitem [ref=e218]:
                  - generic [ref=e219]:
                    - img [ref=e220]
                    - text: "RISK-ON:"
                  - text: 진입 비중 최대화. 마스터 필터 GREEN 조건 충족 시 공격적 후보 탐색.
                - listitem [ref=e223]:
                  - generic [ref=e224]:
                    - img [ref=e225]
                    - text: "NEUTRAL:"
                  - text: 진입 비중 절반 이하. 이미 보유 중인 종목 손절선 점검 우선.
                - listitem [ref=e226]:
                  - generic [ref=e227]:
                    - img [ref=e228]
                    - text: "RISK-OFF:"
                  - text: 신규 매수 중단. 현금 비중 확대 및 포지션 정리 우선.
          - generic [ref=e231]:
            - generic [ref=e232]:
              - generic [ref=e233]:
                - paragraph [ref=e234]: Credit
                - paragraph [ref=e235]: HY OAS · HYG/IEF
                - paragraph [ref=e236]: 크레딧 스프레드 축소 여부
              - generic [ref=e237]:
                - paragraph [ref=e238]: Rates / FX
                - paragraph [ref=e239]: UUP · TLT · Curve
                - paragraph [ref=e240]: 달러와 금리 충격 방향
              - generic [ref=e241]:
                - paragraph [ref=e242]: Volatility
                - paragraph [ref=e243]: VIX
                - paragraph [ref=e244]: 변동성 레벨과 급등 위험
              - generic [ref=e245]:
                - paragraph [ref=e246]: Leadership
                - paragraph [ref=e247]: QQQ/SPY · IWM/SPY
                - paragraph [ref=e248]: 성장주·소형주 참여 폭
            - generic [ref=e249]:
              - paragraph [ref=e250]: 매크로 해석
              - paragraph [ref=e251]: 글로벌 자금 흐름이 위험자산으로 향하는 국면입니다
              - list [ref=e252]:
                - listitem [ref=e253]: S&P 500이 50일 이동평균 위에 위치해 단기 추세가 유지되고 있습니다
                - listitem [ref=e255]: 하이일드 채권(HYG)이 국채(IEF) 대비 0.45%p 강세로 신용 시장이 Risk-ON을 지지합니다
                - listitem [ref=e257]: VIX 14.2 — 공포지수가 낮아 시장 심리가 안정적입니다
            - generic [ref=e259]:
              - generic [ref=e260]:
                - generic [ref=e261]:
                  - generic [ref=e262]: S&P 500
                  - generic [ref=e263]: +0.85%
                - generic [ref=e264]: $542.30
                - generic [ref=e265]:
                  - generic [ref=e266]: ▲ 대형주 추세 지표
                  - generic [ref=e267]: 50MA 위
              - generic [ref=e268]:
                - generic [ref=e269]:
                  - generic [ref=e270]: Nasdaq 100
                  - generic [ref=e271]: +1.12%
                - generic [ref=e272]: $478.50
                - generic [ref=e273]:
                  - generic [ref=e274]: ▲ 기술주 강도 지표
                  - generic [ref=e275]: 50MA 위
              - generic [ref=e276]:
                - generic [ref=e277]:
                  - generic [ref=e278]: HY Bond
                  - generic [ref=e279]: +0.32%
                - generic [ref=e280]: $78.40
                - generic [ref=e281]:
                  - generic [ref=e282]: ▲ 하이일드 채권 · Risk-ON 신호
                  - generic [ref=e283]: 50MA 위
              - generic [ref=e284]:
                - generic [ref=e285]:
                  - generic [ref=e286]: 7-10Y UST
                  - generic [ref=e287]: "-0.15%"
                - generic [ref=e288]: $95.20
                - generic [ref=e289]:
                  - generic [ref=e290]: ▼ 중기 국채 · 안전자산 흐름
                  - generic [ref=e291]: 50MA 아래
              - generic [ref=e292]:
                - generic [ref=e293]:
                  - generic [ref=e294]: 20Y+ UST
                  - generic [ref=e295]: "-0.28%"
                - generic [ref=e296]: $98.50
                - generic [ref=e297]:
                  - generic [ref=e298]: ▼ 장기 국채 · 금리 방향
                  - generic [ref=e299]: 50MA 아래
              - generic [ref=e300]:
                - generic [ref=e301]:
                  - generic [ref=e302]: Gold
                  - generic [ref=e303]: +0.55%
                - generic [ref=e304]: $225.80
                - generic [ref=e305]:
                  - generic [ref=e306]: ▲ 안전자산 수요 지표
                  - generic [ref=e307]: 50MA 위
              - generic [ref=e308]:
                - generic [ref=e309]:
                  - generic [ref=e310]: VIX
                  - generic [ref=e311]: "-3.40%"
                - generic [ref=e312]: "14.20"
                - generic [ref=e314]: ▼ 공포지수 · 변동성 레벨
              - generic [ref=e315]:
                - generic [ref=e316]:
                  - generic [ref=e317]: Bitcoin
                  - generic [ref=e318]: +2.30%
                - generic [ref=e319]: $108500.00
                - generic [ref=e321]: ▲ 위험선호 확장 지표
            - generic [ref=e322]:
              - paragraph [ref=e323]: 상대강도 비교
              - generic [ref=e324]:
                - generic [ref=e325]:
                  - generic [ref=e326]:
                    - generic [ref=e327]: QQQ / SPY
                    - generic [ref=e328]: 기술주 쏠림
                  - generic [ref=e329]: QQQ +1.12% vs SPY +0.85%
                  - generic [ref=e330]:
                    - generic [ref=e331]: ▲
                    - text: 빅테크 주도 장세
                - generic [ref=e332]:
                  - generic [ref=e333]:
                    - generic [ref=e334]: HYG / IEF
                    - generic [ref=e335]: 크레딧 스프레드
                  - generic [ref=e336]: HYG +0.32% vs IEF -0.15%
                  - generic [ref=e337]:
                    - generic [ref=e338]: ▲
                    - text: Risk-ON · 하이일드 강세
        - generic [ref=e339]:
          - generic [ref=e340]:
            - paragraph [ref=e341]: 진입 결정
            - paragraph [ref=e342]: 레짐 78점 — RISK-ON 환경. 마스터 필터가 GREEN이면 공격적 후보를 탐색하세요.
          - link "마스터 필터" [ref=e343] [cursor=pointer]:
            - /url: /master-filter
            - text: 마스터 필터
            - img [ref=e344]
  - alert [ref=e347]
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
  16 |       await expect(page.locator('text=Macro Analysis')).toBeVisible();
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
> 27 |       await expect(page.locator('text=SPY')).toBeVisible();
     |                                              ^ Error: expect(locator).toBeVisible() failed
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