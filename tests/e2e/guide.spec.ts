import { expect, test } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

test('GUIDE-01: 현재 플로우와 투자 전략 메뉴 사용법을 안내한다', async ({ page }) => {
  await setupAllMocks(page);
  await login(page);
  await page.goto('/guide');

  await expect(page.getByText('00 오늘', { exact: true })).toBeVisible();
  await expect(page.getByText('02-C · 스캐너 메뉴와 결과 운용')).toBeVisible();
  await expect(page.getByText('캐시 우선 표시', { exact: true })).toBeVisible();
  await expect(page.getByText('단일 종목 재계산', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '금·나스닥100 투자 전략 메뉴' })).toBeVisible();
  await expect(page.getByText('전략 계산 원금', { exact: true })).toBeVisible();
  await expect(page.getByText('입력 금액 단위', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '금 투자 메뉴 사용법' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '나스닥100 메뉴 사용법' })).toBeVisible();
  await expect(page.getByText('RESEARCH_ONLY', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: '금 투자 메뉴 열기' })).toHaveAttribute('href', '/gold');
  await expect(page.getByRole('link', { name: '나스닥100 메뉴 열기' })).toHaveAttribute('href', '/nasdaq');
});
