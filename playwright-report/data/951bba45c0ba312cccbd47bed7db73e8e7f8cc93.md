# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scanner.spec.ts >> TC-SCAN: 미너비니 스크리너 >> SCAN-07: 종목 선택 및 카운터 증가
- Location: tests/e2e/scanner.spec.ts:62:7

# Error details

```
TimeoutError: locator.check: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('input[type="checkbox"]').first()

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
  1   | import { test, expect } from '@playwright/test';
  2   | import { login } from './helpers/auth';
  3   | import { setupAllMocks } from './mocks/handlers';
  4   | import { ScannerPage } from './helpers/page-objects';
  5   | 
  6   | test.describe('TC-SCAN: 미너비니 스크리너', () => {
  7   |   let scannerPage: ScannerPage;
  8   | 
  9   |   test.beforeEach(async ({ page }) => {
  10  |     await setupAllMocks(page);
  11  |     await login(page);
  12  |     scannerPage = new ScannerPage(page);
  13  |   });
  14  | 
  15  |   test('SCAN-01: Universe 선택 후 스캔 시작 → 결과 렌더링', async ({ page }) => {
  16  |     await scannerPage.goto();
  17  | 
  18  |     // Check header
  19  |     await expect(page.locator('text=미너비니 스크리너')).toBeVisible();
  20  | 
  21  |     // Click scan button
  22  |     await scannerPage.scanButton.click();
  23  | 
  24  |     // Progress bar should appear
  25  |     await expect(page.locator('text=/Scan Progress|스캔 진행율/')).toBeVisible();
  26  | 
  27  |     // Results should load (fixture returns 4 results)
  28  |     await expect(page.locator('text=NVDA')).toBeVisible({ timeout: 15_000 });
  29  |     await expect(page.locator('text=META')).toBeVisible();
  30  |     await expect(page.locator('text=SNOW')).toBeVisible();
  31  |     await expect(page.locator('text=ERRX')).toBeVisible();
  32  |   });
  33  | 
  34  |   test('SCAN-02: 스캔 결과 Tier별 카운트 확인', async ({ page }) => {
  35  |     await scannerPage.goto();
  36  | 
  37  |     // Our fixture has 1 Recommended, 1 Action, 1 IB Review, 1 Errors
  38  |     // Cards should display these numbers
  39  |     const recommendedCount = await scannerPage.getStatCardValue('Recommended');
  40  |     const actionCount = await scannerPage.getStatCardValue('Action');
  41  |     const ibReviewCount = await scannerPage.getStatCardValue('IB Review');
  42  |     const errorsCount = await scannerPage.getStatCardValue('Errors');
  43  | 
  44  |     expect(recommendedCount.trim()).toBe('1');
  45  |     expect(actionCount.trim()).toBe('1');
  46  |     expect(ibReviewCount.trim()).toBe('1');
  47  |     expect(errorsCount.trim()).toBe('1');
  48  |   });
  49  | 
  50  |   test('SCAN-04: 필터 탭 전환', async ({ page }) => {
  51  |     await scannerPage.goto();
  52  | 
  53  |     // Filter by Recommended
  54  |     const recFilter = page.locator('button:has-text("Recommended")');
  55  |     await recFilter.click();
  56  | 
  57  |     // Only NVDA should be visible
  58  |     await expect(page.locator('text=NVDA')).toBeVisible();
  59  |     await expect(page.locator('text=META')).not.toBeVisible();
  60  |   });
  61  | 
  62  |   test('SCAN-07: 종목 선택 및 카운터 증가', async ({ page }) => {
  63  |     await scannerPage.goto();
  64  | 
  65  |     // Checkboxes should exist for valid candidates
  66  |     const checkboxes = page.locator('input[type="checkbox"]');
  67  |     
  68  |     // Select first one
> 69  |     await checkboxes.first().check();
      |                              ^ TimeoutError: locator.check: Timeout 15000ms exceeded.
  70  |     
  71  |     // Check selected count
  72  |     await expect(scannerPage.selectedCount).toHaveText(/1/);
  73  | 
  74  |     // Select second one
  75  |     await checkboxes.nth(1).check();
  76  |     await expect(scannerPage.selectedCount).toHaveText(/2/);
  77  |   });
  78  | 
  79  |   test('SCAN-08: 종목 클릭 → VCP Drilldown 모달', async ({ page }) => {
  80  |     await scannerPage.goto();
  81  | 
  82  |     // Click on NVDA row/card
  83  |     const nvdaRow = page.locator('text=NVDA').first();
  84  |     await nvdaRow.click();
  85  | 
  86  |     // Modal should appear
  87  |     const modal = page.locator('div[role="dialog"]');
  88  |     await expect(modal).toBeVisible();
  89  |     await expect(modal.locator('text=VCP Analysis')).toBeVisible();
  90  |   });
  91  | 
  92  |   test('SCAN-10: 콘테스트로 이동 플로팅 버튼', async ({ page }) => {
  93  |     await scannerPage.goto();
  94  | 
  95  |     // Select one candidate
  96  |     await page.locator('input[type="checkbox"]').first().check();
  97  | 
  98  |     // Contest button should become active and clickable
  99  |     await expect(scannerPage.contestButton).toBeEnabled();
  100 |     await scannerPage.contestButton.click();
  101 | 
  102 |     // Should navigate to contest page
  103 |     await expect(page).toHaveURL(/\/contest/);
  104 |   });
  105 | });
  106 | 
```