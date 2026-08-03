import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

const CORE_A11Y_ROUTES = [
  {
    key: 'recommendations',
    path: '/recommendations?view=metrics',
    ready: (page: Page) => page.getByRole('heading', { name: '조건부 90점 검증 점수판' }),
  },
  {
    key: 'portfolio',
    path: '/portfolio',
    ready: (page: Page) => page.getByRole('heading', { name: '섹터 노출도' }),
  },
  {
    key: 'scanner',
    path: '/scanner',
    ready: (page: Page) => page.getByRole('button', { name: '스캔 시작' }),
  },
  {
    key: 'dashboard',
    path: '/',
    ready: (page: Page) => page.locator('a[href*="/plan?ticker=NVDA"]').first(),
  },
] as const;

async function openCoreRoute(page: Page, route: (typeof CORE_A11Y_ROUTES)[number]) {
  await page.goto(route.path);
  await expect(route.ready(page), `${route.path} 핵심 콘텐츠가 준비되어야 합니다.`).toBeVisible();
}

function seriousOrCriticalViolations(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
        checks: [...node.any, ...node.all, ...node.none].map((check) => ({
          id: check.id,
          message: check.message,
          data: check.data,
        })),
      })),
    }));
}

async function auditMainKeyboardTraversal(page: Page) {
  const setup = await page.evaluate(() => {
    const selector = [
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      'summary',
      '[contenteditable="true"]',
      '[tabindex]',
    ].join(',');
    const isKeyboardReachable = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      const disabled = element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';
      return !disabled
        && element.tabIndex >= 0
        && rect.width > 0
        && rect.height > 0
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && !element.closest('[inert], [aria-hidden="true"]');
    };
    const allFocusable = [...document.querySelectorAll<HTMLElement>(selector)].filter(isKeyboardReachable);
    const mainFocusable = allFocusable.filter((element) => Boolean(element.closest('main')));
    Object.defineProperty(window, '__mtnA11yFocusTargets', {
      configurable: true,
      value: mainFocusable,
    });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    return {
      expectedIds: mainFocusable.map((_, index) => `main-${index}`),
      maximumTabs: Math.min(600, allFocusable.length + mainFocusable.length + 10),
    };
  });

  const reached = new Map<string, { focusVisible: boolean; visibleIndicator: boolean; label: string }>();
  for (let attempt = 0; attempt < setup.maximumTabs && reached.size < setup.expectedIds.length; attempt += 1) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      const targets = (window as Window & { __mtnA11yFocusTargets?: HTMLElement[] }).__mtnA11yFocusTargets || [];
      if (!(element instanceof HTMLElement)) return null;
      const targetIndex = targets.indexOf(element);
      if (targetIndex < 0) return null;
      const style = window.getComputedStyle(element);
      const outlineVisible = style.outlineStyle !== 'none'
        && style.outlineStyle !== 'hidden'
        && Number.parseFloat(style.outlineWidth || '0') >= 1;
      const boxShadowVisible = style.boxShadow !== 'none' && style.boxShadow.trim().length > 0;
      return {
        id: `main-${targetIndex}`,
        focusVisible: element.matches(':focus-visible'),
        visibleIndicator: outlineVisible || boxShadowVisible,
        label: element.getAttribute('aria-label')
          || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100)
          || element.tagName.toLowerCase(),
      };
    });
    if (focused) reached.set(focused.id, focused);
  }

  return {
    expectedCount: setup.expectedIds.length,
    reachedCount: reached.size,
    missingIds: setup.expectedIds.filter((id) => !reached.has(id)),
    focusIndicatorFailures: [...reached.values()]
      .filter((item) => !item.focusVisible || !item.visibleIndicator),
  };
}

async function horizontalDocumentOverflow(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function viewportEscapeIssues(page: Page) {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const hasHorizontalScrollContainer = (element: Element) => {
      let current: Element | null = element.parentElement;
      while (current && current !== document.documentElement) {
        const overflowX = window.getComputedStyle(current).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
        current = current.parentElement;
      }
      return false;
    };
    return [...document.querySelectorAll<HTMLElement>('main *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden' || style.display === 'none') return false;
        if (style.position === 'fixed' || hasHorizontalScrollContainer(element)) return false;
        return rect.left < -1 || rect.right > viewportWidth + 1;
      })
      .slice(0, 20)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: element.className,
        text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || '',
      }));
  });
}

async function fixedPixelTextClassesInResizeScopes(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-a11y-text-resize-scope] *')]
    .flatMap((element) => [...element.classList]
      .filter((className) => /^text-\[(?:\d+(?:\.\d+)?)px\]$/.test(className))
      .map((className) => ({
        scope: element.closest<HTMLElement>('[data-a11y-text-resize-scope]')?.dataset.a11yTextResizeScope || 'unknown',
        className,
        text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || '',
      }))));
}

test.describe('Wave 5: 접근성 (A11y) 검증', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
  });

  test('A11Y-SUPPORT::login-error-alert', async ({ page }) => {
    await page.context().clearCookies();
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: '접근성 테스트 인증 실패' }),
      });
    });

    await page.goto('/login');
    await expect(page.getByTestId('login-form')).toHaveAttribute('data-hydrated', 'true');
    await page.getByLabel('아이디').fill('invalid-user');
    await page.getByLabel('비밀번호').fill('invalid-password');
    await page.getByRole('button', { name: '로그인' }).click();

    await expect(page.getByRole('alert').filter({ hasText: '접근성 테스트 인증 실패' }))
      .toHaveText('접근성 테스트 인증 실패');
  });

  for (const route of CORE_A11Y_ROUTES) {
    test(`A11Y-CORE::${route.key}::axe`, async ({ page }) => {
      await openCoreRoute(page, route);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        seriousOrCriticalViolations(results),
        `${route.path}에서 axe serious/critical 위반이 없어야 합니다.`,
      ).toEqual([]);
    });

    test(`A11Y-CORE::${route.key}::keyboard`, async ({ page }) => {
      await openCoreRoute(page, route);
      const audit = await auditMainKeyboardTraversal(page);
      expect(audit.expectedCount, `${route.path}의 main에는 키보드로 조작할 수 있는 대상이 있어야 합니다.`).toBeGreaterThan(0);
      expect(audit.missingIds, `${route.path}의 모든 표시된 main 조작 대상을 실제 Tab 순서로 도달해야 합니다.`).toEqual([]);
      expect(audit.focusIndicatorFailures, `${route.path}의 Tab 초점은 :focus-visible과 실제 outline/ring을 모두 가져야 합니다.`).toEqual([]);
    });

    test(`A11Y-CORE::${route.key}::zoom-200`, async ({ page }) => {
      // A 1440px desktop viewport at browser zoom 200% exposes 720 CSS pixels for reflow.
      await page.setViewportSize({ width: 720, height: 900 });
      await openCoreRoute(page, route);
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(720);
      expect(
        await horizontalDocumentOverflow(page),
        `${route.path}의 브라우저 200% zoom 등가 viewport에서 문서 가로 넘침이 없어야 합니다.`,
      ).toBeLessThanOrEqual(1);
      expect(
        await viewportEscapeIssues(page),
        `${route.path}의 브라우저 200% zoom 등가 viewport에서 숨은 잘림이 없어야 합니다.`,
      ).toEqual([]);
      expect(
        await fixedPixelTextClassesInResizeScopes(page),
        `${route.path}의 명시된 텍스트 확대 검증 범위는 root 글꼴 확대를 무시하는 fixed-px typography를 사용하면 안 됩니다.`,
      ).toEqual([]);
    });

    test(`A11Y-CORE::${route.key}::mobile-360`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await openCoreRoute(page, route);
      expect(
        await horizontalDocumentOverflow(page),
        `${route.path}의 360px viewport에서 문서 가로 넘침이 없어야 합니다.`,
      ).toBeLessThanOrEqual(1);
      expect(
        await viewportEscapeIssues(page),
        `${route.path}의 360px viewport에서 표시 콘텐츠가 화면 밖으로 잘리면 안 됩니다.`,
      ).toEqual([]);
    });
  }
});
