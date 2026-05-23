# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scanner.spec.ts >> TC-SCAN: 미너비니 스크리너 >> SCAN-02: 스캔 결과 Tier별 카운트 확인
- Location: tests/e2e/scanner.spec.ts:34:7

# Error details

```
TimeoutError: locator.textContent: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('text=Recommended').locator('..').locator('p.font-mono')

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
              - generic [ref=e50]: "Last Updated: 2026.05.23. 23:00:00"
          - generic [ref=e51]:
            - generic [ref=e52]:
              - link "오늘" [ref=e53] [cursor=pointer]:
                - /url: /
              - link "시장 분석" [ref=e54] [cursor=pointer]:
                - /url: /master-filter
              - link "종목 발굴" [ref=e55] [cursor=pointer]:
                - /url: /scanner
              - link "콘테스트" [ref=e56] [cursor=pointer]:
                - /url: /contest
              - link "관심종목" [ref=e57] [cursor=pointer]:
                - /url: /watchlist
              - link "매매 계획" [ref=e58] [cursor=pointer]:
                - /url: /plan
              - link "포트폴리오" [ref=e59] [cursor=pointer]:
                - /url: /portfolio
              - link "성과 복기" [ref=e60] [cursor=pointer]:
                - /url: /history
            - generic [ref=e61]:
              - link "미너비니 스크리닝" [ref=e62] [cursor=pointer]:
                - /url: /scanner
              - link "윌리엄 오닐 스크리닝" [ref=e63] [cursor=pointer]:
                - /url: /canslim
              - link "가이드" [ref=e64] [cursor=pointer]:
                - /url: /guide
              - link "링크 허브" [ref=e65] [cursor=pointer]:
                - /url: /links
              - link "관리" [ref=e66] [cursor=pointer]:
                - /url: /admin
              - button "로그아웃" [ref=e68]
      - generic [ref=e70]:
        - link "오늘 의사결정" [ref=e71] [cursor=pointer]:
          - /url: /
          - img [ref=e73]
          - generic [ref=e75]:
            - generic [ref=e76]: 오늘
            - generic [ref=e77]: 의사결정
        - link "시장 분석 진입 조건 확인" [ref=e78] [cursor=pointer]:
          - /url: /master-filter
          - img [ref=e80]
          - generic [ref=e82]:
            - generic [ref=e83]: 시장 분석
            - generic [ref=e84]: 진입 조건 확인
        - link "02 종목 발굴 SEPA/VCP · CAN SLIM" [ref=e85] [cursor=pointer]:
          - /url: /scanner
          - generic [ref=e86]: "02"
          - generic [ref=e87]:
            - generic [ref=e88]: 종목 발굴
            - generic [ref=e89]: SEPA/VCP · CAN SLIM
        - link "03 콘테스트 LLM 비교 분석" [ref=e90] [cursor=pointer]:
          - /url: /contest
          - generic [ref=e91]: "03"
          - generic [ref=e92]:
            - generic [ref=e93]: 콘테스트
            - generic [ref=e94]: LLM 비교 분석
        - link "04 관심종목 후보 추적" [ref=e95] [cursor=pointer]:
          - /url: /watchlist
          - generic [ref=e96]: "04"
          - generic [ref=e97]:
            - generic [ref=e98]: 관심종목
            - generic [ref=e99]: 후보 추적
        - link "05 매매 계획 리스크 계산" [ref=e100] [cursor=pointer]:
          - /url: /plan
          - generic [ref=e101]: "05"
          - generic [ref=e102]:
            - generic [ref=e103]: 매매 계획
            - generic [ref=e104]: 리스크 계산
        - link "06 포트폴리오 노출도 점검" [ref=e105] [cursor=pointer]:
          - /url: /portfolio
          - generic [ref=e106]: "06"
          - generic [ref=e107]:
            - generic [ref=e108]: 포트폴리오
            - generic [ref=e109]: 노출도 점검
        - link "07 성과 복기 결과 축적" [ref=e110] [cursor=pointer]:
          - /url: /history
          - generic [ref=e111]: "07"
          - generic [ref=e112]:
            - generic [ref=e113]: 성과 복기
            - generic [ref=e114]: 결과 축적
    - main [ref=e115]:
      - generic [ref=e116]:
        - generic [ref=e117]:
          - paragraph [ref=e118]: 오류가 발생했습니다
          - paragraph [ref=e119]: Cannot read properties of undefined (reading 'updatedAt')
        - button "다시 시도" [ref=e120]
  - alert [ref=e121]
```

# Test source

```ts
  1   | import { type Page, type Locator } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * MTN E2E Page Objects
  5   |  *
  6   |  * Encapsulate page-specific selectors and actions to reduce duplication
  7   |  * and improve test maintainability.
  8   |  */
  9   | 
  10  | // ─── Dashboard (Command Center) ───
  11  | 
  12  | export class DashboardPage {
  13  |   readonly page: Page;
  14  |   readonly marketToggleUS: Locator;
  15  |   readonly marketToggleKR: Locator;
  16  |   readonly nextActionLabel: Locator;
  17  |   readonly nextActionCta: Locator;
  18  |   readonly marketStateCard: Locator;
  19  |   readonly macroCard: Locator;
  20  |   readonly riskCard: Locator;
  21  |   readonly watchlistPanel: Locator;
  22  |   readonly recentTradesPanel: Locator;
  23  |   readonly flowLinks: Locator;
  24  | 
  25  |   constructor(page: Page) {
  26  |     this.page = page;
  27  |     this.marketToggleUS = page.locator('button:has-text("미국")');
  28  |     this.marketToggleKR = page.locator('button:has-text("한국")');
  29  |     this.nextActionLabel = page.locator('h2').filter({ hasText: /.+/ }).first();
  30  |     this.nextActionCta = page.locator('a:has-text("이동")');
  31  |     this.marketStateCard = page.locator('div').filter({ hasText: /^시장 상태$/ }).locator('..').first();
  32  |     this.macroCard = page.locator('div').filter({ hasText: /^매크로$/ }).locator('..').first();
  33  |     this.riskCard = page.locator('div').filter({ hasText: /^오픈 리스크$/ }).locator('..').first();
  34  |     this.watchlistPanel = page.locator('text=관심 후보').locator('..');
  35  |     this.recentTradesPanel = page.locator('text=최근 매매 흐름').locator('..');
  36  |     this.flowLinks = page.locator('a:has(span.font-mono)');
  37  |   }
  38  | 
  39  |   async goto() {
  40  |     await this.page.goto('/');
  41  |     await this.page.waitForLoadState('networkidle');
  42  |   }
  43  | 
  44  |   async switchMarket(market: 'US' | 'KR') {
  45  |     const btn = market === 'US' ? this.marketToggleUS : this.marketToggleKR;
  46  |     await btn.click();
  47  |   }
  48  | }
  49  | 
  50  | // ─── Scanner ───
  51  | 
  52  | export class ScannerPage {
  53  |   readonly page: Page;
  54  |   readonly scanButton: Locator;
  55  |   readonly stopButton: Locator;
  56  |   readonly progressBar: Locator;
  57  |   readonly filterButtons: Locator;
  58  |   readonly sortSelect: Locator;
  59  |   readonly selectedCount: Locator;
  60  |   readonly contestButton: Locator;
  61  |   readonly telegramButton: Locator;
  62  | 
  63  |   constructor(page: Page) {
  64  |     this.page = page;
  65  |     this.scanButton = page.locator('button:has-text("스캔 시작")');
  66  |     this.stopButton = page.locator('button:has-text("중단")');
  67  |     this.progressBar = page.locator('text=Scan Progress').locator('..');
  68  |     this.filterButtons = page.locator('button').filter({ hasText: /Recommended|Action|IB Review|전체/ });
  69  |     this.sortSelect = page.locator('select');
  70  |     this.selectedCount = page.locator('text=/Selected/');
  71  |     this.contestButton = page.locator('button:has-text("콘테스트로 이동"), a:has-text("콘테스트로 이동")');
  72  |     this.telegramButton = page.locator('button:has-text("텔레그램 전송")');
  73  |   }
  74  | 
  75  |   async goto() {
  76  |     await this.page.goto('/scanner');
  77  |     await this.page.waitForLoadState('domcontentloaded');
  78  |   }
  79  | 
  80  |   async getStatCardValue(label: string): Promise<string> {
  81  |     const card = this.page.locator(`text=${label}`).locator('..').locator('p.font-mono');
> 82  |     return (await card.textContent()) ?? '';
      |                        ^ TimeoutError: locator.textContent: Timeout 15000ms exceeded.
  83  |   }
  84  | }
  85  | 
  86  | // ─── Plan ───
  87  | 
  88  | export class PlanPage {
  89  |   readonly page: Page;
  90  |   readonly tickerInput: Locator;
  91  |   readonly analyzeButton: Locator;
  92  |   readonly sepaSection: Locator;
  93  |   readonly vcpSection: Locator;
  94  |   readonly riskSection: Locator;
  95  |   readonly saveButton: Locator;
  96  |   readonly successBanner: Locator;
  97  |   readonly errorBanner: Locator;
  98  | 
  99  |   constructor(page: Page) {
  100 |     this.page = page;
  101 |     this.tickerInput = page.locator('input[placeholder*="ticker"], input[placeholder*="종목"]').first();
  102 |     this.analyzeButton = page.locator('button:has-text("분석"), button:has-text("Analyze")').first();
  103 |     this.sepaSection = page.locator('text=SEPA').first().locator('..').locator('..');
  104 |     this.vcpSection = page.locator('text=VCP').first().locator('..').locator('..');
  105 |     this.riskSection = page.locator('text=리스크'), 
  106 |     this.saveButton = page.locator('button:has-text("계획 저장")');
  107 |     this.successBanner = page.locator('text=계획 저장 완료');
  108 |     this.errorBanner = page.locator('[class*="red"]').filter({ hasText: /오류|실패|error/i });
  109 |   }
  110 | 
  111 |   async goto(params?: { ticker?: string; exchange?: string; autoAnalyze?: boolean }) {
  112 |     const searchParams = new URLSearchParams();
  113 |     if (params?.ticker) searchParams.set('ticker', params.ticker);
  114 |     if (params?.exchange) searchParams.set('exchange', params.exchange);
  115 |     if (params?.autoAnalyze) searchParams.set('autoAnalyze', '1');
  116 |     const qs = searchParams.toString();
  117 |     await this.page.goto(`/plan${qs ? `?${qs}` : ''}`);
  118 |     await this.page.waitForLoadState('domcontentloaded');
  119 |   }
  120 | }
  121 | 
  122 | // ─── Portfolio ───
  123 | 
  124 | export class PortfolioPage {
  125 |   readonly page: Page;
  126 |   readonly marketToggleUS: Locator;
  127 |   readonly marketToggleKR: Locator;
  128 |   readonly totalEquity: Locator;
  129 |   readonly cashMetric: Locator;
  130 |   readonly openRisk: Locator;
  131 |   readonly positionCards: Locator;
  132 |   readonly sectorBars: Locator;
  133 |   readonly warningBanners: Locator;
  134 | 
  135 |   constructor(page: Page) {
  136 |     this.page = page;
  137 |     this.marketToggleUS = page.locator('button:has-text("미국")');
  138 |     this.marketToggleKR = page.locator('button:has-text("한국")');
  139 |     this.totalEquity = page.locator('text=총 자산').locator('..').locator('p.font-mono');
  140 |     this.cashMetric = page.locator('text=현금').locator('..').locator('p.font-mono');
  141 |     this.openRisk = page.locator('text=오픈 리스크').locator('..').locator('p.font-mono');
  142 |     this.positionCards = page.locator('text=활성 포지션').locator('..').locator('..').locator('[class*="rounded-xl"]');
  143 |     this.sectorBars = page.locator('text=섹터 노출도').locator('..').locator('[class*="bg-emerald"]');
  144 |     this.warningBanners = page.locator('[class*="amber"]').filter({ hasText: /.+/ });
  145 |   }
  146 | 
  147 |   async goto() {
  148 |     await this.page.goto('/portfolio');
  149 |     await this.page.waitForLoadState('domcontentloaded');
  150 |   }
  151 | }
  152 | 
  153 | // ─── History ───
  154 | 
  155 | export class HistoryPage {
  156 |   readonly page: Page;
  157 |   readonly reviewTab: Locator;
  158 |   readonly statsTab: Locator;
  159 |   readonly marketToggleUS: Locator;
  160 |   readonly marketToggleKR: Locator;
  161 |   readonly tradeTable: Locator;
  162 | 
  163 |   constructor(page: Page) {
  164 |     this.page = page;
  165 |     this.reviewTab = page.locator('button:has-text("복기 목록")');
  166 |     this.statsTab = page.locator('button:has-text("성과 통계")');
  167 |     this.marketToggleUS = page.locator('button:has-text("미국")');
  168 |     this.marketToggleKR = page.locator('button:has-text("한국")');
  169 |     this.tradeTable = page.locator('table, [role="table"]').first();
  170 |   }
  171 | 
  172 |   async goto(params?: { market?: 'US' | 'KR'; view?: 'review' | 'stats' }) {
  173 |     const searchParams = new URLSearchParams();
  174 |     if (params?.market) searchParams.set('market', params.market);
  175 |     if (params?.view) searchParams.set('view', params.view);
  176 |     const qs = searchParams.toString();
  177 |     await this.page.goto(`/history${qs ? `?${qs}` : ''}`);
  178 |     await this.page.waitForLoadState('domcontentloaded');
  179 |   }
  180 | }
  181 | 
```