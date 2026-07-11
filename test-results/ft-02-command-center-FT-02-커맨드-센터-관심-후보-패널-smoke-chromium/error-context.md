# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ft-02-command-center.spec.ts >> FT-02: 커맨드 센터 >> 관심 후보 패널
- Location: tests/e2e/smoke/ft-02-command-center.spec.ts:33:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('section').filter({ has: locator('h2:has-text("관심 후보")') })
Expected: visible
Error: strict mode violation: locator('section').filter({ has: locator('h2:has-text("관심 후보")') }) resolved to 2 elements:
    1) <section class="grid gap-4 lg:grid-cols-2">…</section> aka getByText('관심 후보전체 보기아직 표시할 관심 후보가 없습니다. 스캐너를 실행하거나 관심종목을 직접 추가하세요.스캐너 실행하기 최근 매매 흐름복기 보기아직')
    2) <section class="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-5">…</section> aka getByText('관심 후보전체 보기아직 표시할 관심 후보가 없습니다. 스캐너를 실행하거나 관심종목을 직접 추가하세요.스캐너 실행하기')

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('section').filter({ has: locator('h2:has-text("관심 후보")') })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - navigation [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]:
          - generic [ref=e7]:
            - link "MTN Live Mantori's Trading Navigator" [ref=e8] [cursor=pointer]:
              - /url: /
              - img [ref=e10]
              - generic [ref=e12]:
                - generic [ref=e13]:
                  - generic [ref=e14]: MTN
                  - generic [ref=e15]: Live
                - paragraph [ref=e17]: Mantori's Trading Navigator
            - generic [ref=e18]:
              - img
              - textbox "종목 검색 ⌘K" [ref=e19]:
                - /placeholder: 종목 검색  ⌘K
          - generic [ref=e21]:
            - generic [ref=e22]:
              - generic [ref=e23]: S&P500
              - generic [ref=e24]: "--"
              - generic [ref=e25]:
                - generic [ref=e26]: "--"
                - generic [ref=e27]: KIS
            - generic [ref=e28]:
              - generic [ref=e29]: NASDAQ
              - generic [ref=e30]: "--"
              - generic [ref=e31]:
                - generic [ref=e32]: "--"
                - generic [ref=e33]: KIS
            - generic [ref=e34]:
              - generic [ref=e35]: KOSPI
              - generic [ref=e36]: "--"
              - generic [ref=e37]:
                - generic [ref=e38]: "--"
                - generic [ref=e39]: KIS
            - generic [ref=e40]:
              - generic [ref=e41]: KOSDAQ
              - generic [ref=e42]: "--"
              - generic [ref=e43]:
                - generic [ref=e44]: "--"
                - generic [ref=e45]: KIS
            - generic [ref=e46]:
              - generic [ref=e47]: USD/KRW
              - generic [ref=e48]: "--"
              - generic [ref=e49]:
                - generic [ref=e50]: "--"
                - generic [ref=e51]: Yahoo
        - generic [ref=e52]:
          - generic [ref=e53]:
            - link "오늘" [ref=e54] [cursor=pointer]:
              - /url: /
            - link "시장 분석" [ref=e55] [cursor=pointer]:
              - /url: /master-filter
            - link "종목 발굴" [ref=e56] [cursor=pointer]:
              - /url: /scanner
            - link "콘테스트" [ref=e57] [cursor=pointer]:
              - /url: /contest
            - link "관심종목" [ref=e58] [cursor=pointer]:
              - /url: /watchlist
            - link "매매 계획" [ref=e59] [cursor=pointer]:
              - /url: /plan
            - link "포트폴리오" [ref=e60] [cursor=pointer]:
              - /url: /portfolio
            - link "성과 복기" [ref=e61] [cursor=pointer]:
              - /url: /history
          - generic [ref=e62]:
            - link "사용 가이드" [ref=e63] [cursor=pointer]:
              - /url: /guide
            - link "링크 허브" [ref=e64] [cursor=pointer]:
              - /url: /links
            - link "관리" [ref=e65] [cursor=pointer]:
              - /url: /admin
            - link "분석 큐" [ref=e66] [cursor=pointer]:
              - /url: /admin/local-analysis
            - button "로그아웃" [ref=e68]
    - main [ref=e69]:
      - generic [ref=e70]:
        - generic [ref=e71]:
          - generic [ref=e72]:
            - paragraph [ref=e73]: Command Center
            - heading "오늘의 의사결정" [level=1] [ref=e74]
            - paragraph [ref=e75]: 시장 상태를 확인하고, 후보 발굴부터 계획 저장까지 다음 행동만 빠르게 결정합니다.
          - generic [ref=e76]:
            - button "미국" [ref=e77]
            - button "한국" [ref=e78]
        - generic [ref=e79]:
          - generic [ref=e80]:
            - generic [ref=e81]:
              - generic [ref=e82]:
                - paragraph [ref=e83]: 다음에 할 일
                - heading "오늘 시장 신호판 확인" [level=2] [ref=e84]
                - paragraph [ref=e85]: 오늘 신규 진입이 가능한지 먼저 확인합니다.
              - link "시장 신호판 확인하기" [ref=e86] [cursor=pointer]:
                - /url: /master-filter
                - text: 시장 신호판 확인하기
                - img [ref=e87]
            - generic [ref=e90]:
              - generic [ref=e91]:
                - generic [ref=e92]:
                  - img [ref=e93]
                  - text: 지금 새로 사도 되는지
                - paragraph [ref=e95]: "--"
              - generic [ref=e96]:
                - generic [ref=e97]:
                  - img [ref=e98]
                  - text: 시장 밖 위험
                - paragraph [ref=e100]: "--"
              - generic [ref=e101]:
                - generic [ref=e102]:
                  - img [ref=e103]
                  - text: 오픈 리스크
                - paragraph [ref=e105]: "--"
          - generic [ref=e106]:
            - generic [ref=e108]:
              - paragraph [ref=e109]: 오늘 요약
              - paragraph [ref=e110]: Updated --
            - generic [ref=e113]:
              - generic [ref=e114]:
                - generic [ref=e115]:
                  - img [ref=e116]
                  - text: 계획 대기
                - generic [ref=e119]: 0건
              - generic [ref=e120]:
                - generic [ref=e121]:
                  - img [ref=e122]
                  - text: 관심 후보
                - generic [ref=e124]: 0개
              - generic [ref=e125]:
                - generic [ref=e126]:
                  - img [ref=e127]
                  - text: 최근 기록
                - generic [ref=e130]: 0건
        - generic [ref=e131]:
          - generic [ref=e132]:
            - generic [ref=e133]:
              - heading "관심 후보" [level=2] [ref=e134]
              - link "전체 보기" [ref=e135] [cursor=pointer]:
                - /url: /watchlist
            - generic [ref=e137]:
              - paragraph [ref=e138]: 아직 표시할 관심 후보가 없습니다. 스캐너를 실행하거나 관심종목을 직접 추가하세요.
              - link "스캐너 실행하기" [ref=e139] [cursor=pointer]:
                - /url: /scanner
                - text: 스캐너 실행하기
                - img [ref=e140]
          - generic [ref=e143]:
            - generic [ref=e144]:
              - heading "최근 매매 흐름" [level=2] [ref=e145]
              - link "복기 보기" [ref=e146] [cursor=pointer]:
                - /url: /history
            - generic [ref=e148]:
              - paragraph [ref=e149]: 아직 표시할 매매 기록이 없습니다. 오늘 시장 상태를 먼저 확인하세요.
              - link "시장 신호판 확인하기" [ref=e150] [cursor=pointer]:
                - /url: /master-filter
                - text: 시장 신호판 확인하기
                - img [ref=e151]
        - generic [ref=e154]:
          - link "01시장 확인" [ref=e155] [cursor=pointer]:
            - /url: /master-filter
            - generic [ref=e156]: 01시장 확인
            - img [ref=e157]
          - link "02종목 발굴" [ref=e160] [cursor=pointer]:
            - /url: /scanner
            - generic [ref=e161]: 02종목 발굴
            - img [ref=e162]
          - link "03콘테스트" [ref=e165] [cursor=pointer]:
            - /url: /contest
            - generic [ref=e166]: 03콘테스트
            - img [ref=e167]
          - link "04관심종목" [ref=e170] [cursor=pointer]:
            - /url: /watchlist
            - generic [ref=e171]: 04관심종목
            - img [ref=e172]
          - link "05매매 계획" [ref=e175] [cursor=pointer]:
            - /url: /plan
            - generic [ref=e176]: 05매매 계획
            - img [ref=e177]
  - button "Open Next.js Dev Tools" [ref=e185] [cursor=pointer]:
    - img [ref=e186]
  - alert [ref=e189]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { smokeLogin, waitForContentLoad } from './helpers/auth';
  3  | 
  4  | /**
  5  |  * FT-02: 커맨드 센터 (/)
  6  |  */
  7  | test.describe('FT-02: 커맨드 센터', () => {
  8  |   test.beforeEach(async ({ page }) => {
  9  |     await smokeLogin(page);
  10 |   });
  11 | 
  12 |   test('시장 상태 카드 3개 렌더링', async ({ page }) => {
  13 |     await page.goto('/');
  14 |     await waitForContentLoad(page);
  15 | 
  16 |     await expect(page.getByText('지금 새로 사도 되는지', { exact: true }).first()).toBeVisible();
  17 |     await expect(page.getByText('시장 밖 위험', { exact: true }).first()).toBeVisible();
  18 |     await expect(page.getByText('오픈 리스크', { exact: true }).first()).toBeVisible();
  19 |   });
  20 | 
  21 |   test('"다음에 할 일" 추천 + CTA 버튼', async ({ page }) => {
  22 |     await page.goto('/');
  23 |     await waitForContentLoad(page);
  24 | 
  25 |     // "다음에 할 일" 라벨
  26 |     await expect(page.getByText('다음에 할 일', { exact: true })).toBeVisible();
  27 | 
  28 |     // CTA 버튼 (시작하기 링크)
  29 |     const ctaButton = page.locator('a').filter({ hasText: /시작하기|확인하기/ }).first();
  30 |     await expect(ctaButton).toBeVisible();
  31 |   });
  32 | 
  33 |   test('관심 후보 패널', async ({ page }) => {
  34 |     await page.goto('/');
  35 |     await waitForContentLoad(page);
  36 | 
  37 |     // 관심 후보 섹션
  38 |     await expect(page.locator('h2:has-text("관심 후보")').first()).toBeVisible();
  39 | 
  40 |     // 관심 후보 목록 또는 빈 상태
  41 |     const panel = page.locator('section').filter({ has: page.locator('h2:has-text("관심 후보")') });
> 42 |     await expect(panel).toBeVisible();
     |                         ^ Error: expect(locator).toBeVisible() failed
  43 |   });
  44 | 
  45 |   test('최근 매매 흐름 패널', async ({ page }) => {
  46 |     await page.goto('/');
  47 |     await waitForContentLoad(page);
  48 | 
  49 |     // 최근 매매 흐름 섹션
  50 |     await expect(page.locator('h2:has-text("최근 매매 흐름")').first()).toBeVisible();
  51 |   });
  52 | 
  53 |   test('5단계 플로우 링크 동작', async ({ page }) => {
  54 |     await page.goto('/');
  55 |     await waitForContentLoad(page);
  56 | 
  57 |     const flowLinks = [
  58 |       { step: '01', href: '/master-filter' },
  59 |       { step: '02', href: '/scanner' },
  60 |       { step: '03', href: '/contest' },
  61 |       { step: '04', href: '/watchlist' },
  62 |       { step: '05', href: '/plan' },
  63 |     ];
  64 | 
  65 |     for (const flow of flowLinks) {
  66 |       const link = page.locator(`a[href="${flow.href}"]`).filter({ hasText: flow.step }).first();
  67 |       await expect(link).toBeVisible();
  68 |     }
  69 |   });
  70 | 
  71 |   test('US ↔ KR 토글 시 데이터 변경', async ({ page }) => {
  72 |     await page.goto('/');
  73 |     await waitForContentLoad(page);
  74 | 
  75 |     // US 상태에서 오픈 리스크 값 캡처
  76 |     const riskValue = page.locator('p.font-mono').last();
  77 |     const usRisk = await riskValue.textContent().catch(() => '');
  78 | 
  79 |     // KR 전환
  80 |     await page.locator('button:has-text("한국")').click();
  81 |     await waitForContentLoad(page);
  82 | 
  83 |     const krRisk = await riskValue.textContent().catch(() => '');
  84 |     // 값이 변경되거나 동일해도 에러 없이 전환됨
  85 |     expect(typeof krRisk).toBe('string');
  86 |   });
  87 | });
  88 | 
```