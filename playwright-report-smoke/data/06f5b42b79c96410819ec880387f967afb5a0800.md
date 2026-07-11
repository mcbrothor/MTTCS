# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ed-03-responsive.spec.ts >> ED-03: 반응형 레이아웃 >> 모바일 뷰포트 (375x812) >> 모바일 — 하단 탭바 표시
- Location: tests/e2e/smoke/ed-03-responsive.spec.ts:22:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('text=오늘').first()
Expected: visible
Received: hidden
Timeout:  15000ms

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('text=오늘').first()
    33 × locator resolved to <a href="/" class="shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-all border-emerald-400/35 bg-emerald-500/12 text-[var(--text-primary)]">오늘</a>
       - unexpected value "hidden"

```

```yaml
- banner:
  - link "MTN":
    - /url: /
  - button "메뉴 열기": 메뉴
- navigation:
  - link "오늘":
    - /url: /
  - link "시장":
    - /url: /master-filter
  - link "발굴":
    - /url: /scanner
  - link "포트":
    - /url: /portfolio
  - link "복기":
    - /url: /history
- main:
  - paragraph: Command Center
  - heading "오늘의 의사결정" [level=1]
  - paragraph: 시장 상태를 확인하고, 후보 발굴부터 계획 저장까지 다음 행동만 빠르게 결정합니다.
  - button "미국"
  - button "한국"
  - paragraph: 다음에 할 일
  - heading "종목 발굴 시작" [level=2]
  - paragraph: 시장 상태를 바탕으로 신규 후보를 탐색합니다.
  - link "종목 발굴 시작 시작하기":
    - /url: /scanner
  - text: 지금 새로 사도 되는지
  - paragraph: 진입 가능
  - text: 시장 밖 위험
  - paragraph: 조심해야 할 흐름
  - text: 오픈 리스크
  - paragraph: $0.00
  - paragraph: 오늘 요약
  - paragraph: Updated 2026. 7. 10. 오후 10:50:13
  - text: 계획 대기 0건 관심 후보 0개 최근 기록 0건
  - heading "관심 후보" [level=2]
  - link "전체 보기":
    - /url: /watchlist
  - paragraph: 아직 표시할 관심 후보가 없습니다. 스캐너를 실행하거나 관심종목을 직접 추가하세요.
  - link "스캐너 실행하기":
    - /url: /scanner
  - heading "최근 매매 흐름" [level=2]
  - link "복기 보기":
    - /url: /history
  - paragraph: 아직 표시할 매매 기록이 없습니다. 오늘 시장 상태를 먼저 확인하세요.
  - link "시장 신호판 확인하기":
    - /url: /master-filter
  - link "01시장 확인":
    - /url: /master-filter
  - link "02종목 발굴":
    - /url: /scanner
  - link "03콘테스트":
    - /url: /contest
  - link "04관심종목":
    - /url: /watchlist
  - link "05매매 계획":
    - /url: /plan
- alert
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { smokeLogin, waitForContentLoad } from './helpers/auth';
  3   | 
  4   | /**
  5   |  * ED-03: 반응형 & 모바일 레이아웃
  6   |  *
  7   |  * Playwright 제약: test.use({ ...devices[...] }) 는 중첩 describe에서
  8   |  * defaultBrowserType을 변경할 수 없으므로, viewport만 직접 설정합니다.
  9   |  */
  10  | test.describe('ED-03: 반응형 레이아웃', () => {
  11  |   test.describe('모바일 뷰포트 (375x812)', () => {
  12  |     test.use({ viewport: { width: 375, height: 812 } });
  13  | 
  14  |     test('모바일 — 커맨드 센터 렌더링', async ({ page }) => {
  15  |       await smokeLogin(page);
  16  |       await page.goto('/');
  17  |       await waitForContentLoad(page);
  18  | 
  19  |       await expect(page.locator('text=Command Center')).toBeVisible();
  20  |     });
  21  | 
  22  |     test('모바일 — 하단 탭바 표시', async ({ page }) => {
  23  |       await smokeLogin(page);
  24  |       await page.goto('/');
  25  |       await waitForContentLoad(page);
  26  | 
  27  |       // 모바일 네비게이션 확인
  28  |       const mobileNav = page.locator('text=오늘').first();
> 29  |       await expect(mobileNav).toBeVisible();
      |                               ^ Error: expect(locator).toBeVisible() failed
  30  |     });
  31  | 
  32  |     test('모바일 — 마스터 필터 렌더링', async ({ page }) => {
  33  |       await smokeLogin(page);
  34  |       await page.goto('/master-filter');
  35  |       await waitForContentLoad(page);
  36  | 
  37  |       const body = await page.textContent('body');
  38  |       expect(body).toBeTruthy();
  39  |       expect(body!.length).toBeGreaterThan(100);
  40  |     });
  41  | 
  42  |     test('모바일 — 스캐너 페이지 렌더링', async ({ page }) => {
  43  |       await smokeLogin(page);
  44  |       await page.goto('/scanner');
  45  |       await waitForContentLoad(page);
  46  | 
  47  |       const body = await page.textContent('body');
  48  |       expect(body).toBeTruthy();
  49  |       expect(body!.length).toBeGreaterThan(100);
  50  |     });
  51  | 
  52  |     test('모바일 — 매매 계획 렌더링', async ({ page }) => {
  53  |       await smokeLogin(page);
  54  |       await page.goto('/plan');
  55  |       await waitForContentLoad(page);
  56  | 
  57  |       await expect(page.locator('text=신규 매매 계획').first()).toBeVisible({ timeout: 15_000 });
  58  |     });
  59  |   });
  60  | 
  61  |   test.describe('태블릿 뷰포트 (1024x768)', () => {
  62  |     test.use({ viewport: { width: 1024, height: 768 } });
  63  | 
  64  |     test('태블릿 — 커맨드 센터 렌더링', async ({ page }) => {
  65  |       await smokeLogin(page);
  66  |       await page.goto('/');
  67  |       await waitForContentLoad(page);
  68  | 
  69  |       await expect(page.locator('text=Command Center')).toBeVisible();
  70  |     });
  71  | 
  72  |     test('태블릿 — 스캐너 레이아웃', async ({ page }) => {
  73  |       await smokeLogin(page);
  74  |       await page.goto('/scanner');
  75  |       await waitForContentLoad(page);
  76  | 
  77  |       const body = await page.textContent('body');
  78  |       expect(body).toBeTruthy();
  79  |     });
  80  |   });
  81  | 
  82  |   test.describe('데스크톱 와이드 뷰포트', () => {
  83  |     test.use({ viewport: { width: 1920, height: 1080 } });
  84  | 
  85  |     test('와이드 — 모든 주요 페이지 렌더링', async ({ page }) => {
  86  |       await smokeLogin(page);
  87  | 
  88  |       const pages = ['/', '/master-filter', '/scanner', '/contest', '/watchlist', '/plan', '/portfolio', '/history'];
  89  | 
  90  |       for (const pagePath of pages) {
  91  |         const response = await page.goto(pagePath);
  92  |         expect(response?.status()).toBeLessThan(500);
  93  | 
  94  |         const body = await page.textContent('body');
  95  |         expect(body).toBeTruthy();
  96  |         expect(body!.length).toBeGreaterThan(50);
  97  |       }
  98  |     });
  99  |   });
  100 | });
  101 | 
```