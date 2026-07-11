# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cp-03-portfolio-review.spec.ts >> CP-03: 포트폴리오 점검 → 성과 복기 >> 추천 이력 페이지 로딩
- Location: tests/e2e/smoke/cp-03-portfolio-review.spec.ts:87:7

# Error details

```
Error: smokeLogin: All login strategies failed after 3 retries
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - img [ref=e7]
        - heading "MTN 로그인" [level=1] [ref=e9]
        - paragraph [ref=e10]: Mantori's Trading Navigator 접근 권한을 확인합니다.
      - generic [ref=e11]:
        - text: 아이디
        - textbox "아이디" [ref=e12]: notead12
      - generic [ref=e13]:
        - text: 비밀번호
        - textbox "비밀번호" [ref=e14]: gksakscjf1!A
      - generic [ref=e15]: 로그인에 실패했습니다.
      - button "로그인" [ref=e16]
  - button "Open Next.js Dev Tools" [ref=e22] [cursor=pointer]:
    - img [ref=e23]
  - alert [ref=e26]
```

# Test source

```ts
  12  | const SMOKE_PASSWORD = process.env.MTN_ADMIN_PASSWORD || 'gksakscjf1!A';
  13  | 
  14  | /**
  15  |  * Login via API first (reliable), then navigate to command center.
  16  |  * Falls back to UI login if API approach fails.
  17  |  */
  18  | export async function smokeLogin(page: Page): Promise<void> {
  19  |   // Step 0: Wait for dev server to be responsive (handles hot-reload gaps)
  20  |   for (let healthCheck = 0; healthCheck < 5; healthCheck++) {
  21  |     try {
  22  |       const res = await page.request.get('/api/auth/session', { timeout: 5_000 });
  23  |       const session = await res.json().catch(() => null) as { authenticated?: boolean } | null;
  24  |       if (session?.authenticated) {
  25  |         await page.goto('/');
  26  |         return;
  27  |       }
  28  |       break; // Server is responsive, proceed with login
  29  |     } catch {
  30  |       // Server not ready — wait and retry
  31  |       await page.waitForTimeout(2_000);
  32  |     }
  33  |   }
  34  | 
  35  |   // Retry wrapper — dev server may hot-reload between sequential tests
  36  |   for (let topRetry = 0; topRetry < 3; topRetry++) {
  37  |     if (topRetry > 0) {
  38  |       // Wait for dev server to stabilize after hot-reload
  39  |       await page.waitForTimeout(3_000);
  40  |     }
  41  | 
  42  |     // Strategy 2: API-based login (set cookie directly)
  43  |     try {
  44  |       const loginResponse = await page.request.post('/api/auth/login', {
  45  |         data: { username: SMOKE_USERNAME, password: SMOKE_PASSWORD },
  46  |       });
  47  | 
  48  |       if (loginResponse.ok()) {
  49  |         // Explicitly extract Set-Cookie headers and add to browser context
  50  |         const headers = loginResponse.headers();
  51  |         const setCookie = headers['set-cookie'];
  52  |         if (setCookie) {
  53  |           const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  54  |           for (const raw of cookies) {
  55  |             const nameValue = raw.split(';')[0];
  56  |             const eqIdx = nameValue.indexOf('=');
  57  |             if (eqIdx > 0) {
  58  |               await page.context().addCookies([{
  59  |                 name: nameValue.substring(0, eqIdx),
  60  |                 value: nameValue.substring(eqIdx + 1),
  61  |                 domain: 'localhost',
  62  |                 path: '/',
  63  |               }]);
  64  |             }
  65  |           }
  66  |         }
  67  | 
  68  |         await page.goto('/', { waitUntil: 'domcontentloaded' });
  69  | 
  70  |         if (!page.url().includes('/login')) {
  71  |           return;
  72  |         }
  73  |       }
  74  |     } catch {
  75  |       // API login failed — fall back to UI
  76  |     }
  77  | 
  78  |     // Strategy 3: UI-based login (fallback)
  79  |     await page.goto('/login', { waitUntil: 'domcontentloaded' });
  80  | 
  81  |     const hydrated = await page.waitForFunction(
  82  |       () => document.querySelector('[data-testid="login-form"]')?.getAttribute('data-hydrated') === 'true',
  83  |       { timeout: 30_000 },
  84  |     ).then(() => true).catch(() => false);
  85  | 
  86  |     if (!hydrated) continue;
  87  | 
  88  |     const usernameInput = page.locator('input[autoComplete="username"], input').first();
  89  |     const passwordInput = page.locator('input[autoComplete="current-password"], input[type="password"]').first();
  90  | 
  91  |     await usernameInput.fill(SMOKE_USERNAME);
  92  |     await passwordInput.fill(SMOKE_PASSWORD);
  93  | 
  94  |     const submitButton = page.locator('button[type="submit"], button:has-text("로그인")').first();
  95  |     await submitButton.click();
  96  | 
  97  |     const redirected = await page.waitForURL(
  98  |       (url) => !url.pathname.includes('/login'),
  99  |       { timeout: 15_000 },
  100 |     ).then(() => true).catch(() => false);
  101 | 
  102 |     if (redirected) return;
  103 | 
  104 |     // Check for error message on the page
  105 |     const errorMsg = await page.locator('text=/실패|올바르지/').first().textContent().catch(() => '');
  106 |     if (errorMsg) {
  107 |       // Login was rejected — wait and retry from the top
  108 |       continue;
  109 |     }
  110 |   }
  111 | 
> 112 |   throw new Error('smokeLogin: All login strategies failed after 3 retries');
      |         ^ Error: smokeLogin: All login strategies failed after 3 retries
  113 | }
  114 | 
  115 | /**
  116 |  * Login via UI with specific credentials (for negative testing only).
  117 |  */
  118 | export async function smokeLoginWith(page: Page, username: string, password: string): Promise<void> {
  119 |   await page.goto('/login');
  120 | 
  121 |   await page.waitForFunction(
  122 |     () => document.querySelector('[data-testid="login-form"]')?.getAttribute('data-hydrated') === 'true',
  123 |     { timeout: 30_000 },
  124 |   );
  125 | 
  126 |   const usernameInput = page.locator('input[autoComplete="username"], input').first();
  127 |   const passwordInput = page.locator('input[autoComplete="current-password"], input[type="password"]').first();
  128 | 
  129 |   await usernameInput.fill(username);
  130 |   await passwordInput.fill(password);
  131 | 
  132 |   const submitButton = page.locator('button[type="submit"], button:has-text("로그인")').first();
  133 |   await submitButton.click();
  134 | }
  135 | 
  136 | /**
  137 |  * Assert that we are on the login page.
  138 |  */
  139 | export async function expectLoginPage(page: Page): Promise<void> {
  140 |   await expect(page).toHaveURL(/\/login/);
  141 | }
  142 | 
  143 | /**
  144 |  * Assert that we are on the command center.
  145 |  */
  146 | export async function expectDashboard(page: Page): Promise<void> {
  147 |   await expect(page).toHaveURL((url) => url.pathname === '/');
  148 |   await expect(page.locator('text=Command Center')).toBeVisible({ timeout: 15_000 });
  149 | }
  150 | 
  151 | /**
  152 |  * Wait for page content to load (spinner disappears or content appears).
  153 |  */
  154 | export async function waitForContentLoad(page: Page, timeout = 30_000): Promise<void> {
  155 |   // Wait for any loading spinners to disappear
  156 |   const spinner = page.locator('[class*="animate-spin"], text=로드 중, text=로딩');
  157 |   await spinner.first().waitFor({ state: 'hidden', timeout }).catch(() => {
  158 |     // No spinner found — content may have loaded instantly
  159 |   });
  160 | }
  161 | 
```