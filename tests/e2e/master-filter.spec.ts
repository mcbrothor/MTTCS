import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks, setupHaltMocks, setupMasterFilterInsightStatusMock } from './mocks/handlers';

test.describe('TC-MF: 오늘의 결론과 위험 조기경보', () => {
  test.describe('정상 진입 가능 상태', () => {
    test.beforeEach(async ({ page }) => {
      await setupAllMocks(page); // GREEN by default
      await login(page);
    });

    test('MF-01: 투자 가능 결론과 쉬운 용어 표시', async ({ page }) => {
      await page.goto('/master-filter');

      await expect(page.getByRole('heading', { name: '오늘의 결론과 위험 조기경보' })).toBeVisible();
      await expect(page.getByRole('status', { name: '오늘 진입 결정: 정상 진입 가능' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: '마스터필터 화면 읽는 순서' })).toBeVisible();
      await expect(page.getByText('지금은 이렇게 하세요')).toBeVisible();
      await expect(page.getByText('왜 이렇게 판단했나요?')).toBeVisible();
      await expect(page.getByText('언제 다시 판단하나요?')).toBeVisible();
      await expect(page.getByText('종합 점수').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: '위험이 커지는지 먼저 확인' })).toBeVisible();
      const indexReasonButton = page.getByRole('button', { name: '지수가 50일 평균선 위에 있는가 판정 근거: 정상' });
      await indexReasonButton.hover();
      await expect(page.getByRole('tooltip')).toContainText('대표 지수와 QQQ가 모두 50일선 위');
      await expect(page.getByRole('tooltip')).toContainText('관측값');
      await expect(page.getByRole('tooltip')).toContainText('판정 기준');
      await expect(page.locator('text=시장 폭').first()).toBeVisible();
      await expect(page.getByText('20일 평균 하루 변동폭').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: '하루 변동폭 바로 읽기' })).toBeVisible();
      await expect(page.getByText('별도 참고: 상승/하락 종목 비율')).toBeVisible();
      await expect(page.getByText('75% 이하', { exact: true })).toBeVisible();
      await expect(page.getByText('120% 이상', { exact: true })).toBeVisible();

      const sectorTable = page.getByRole('table').filter({ hasText: '미국 기술 업종 상장지수펀드' });
      await expect(sectorTable.getByRole('columnheader', { name: '실제 종목명' })).toBeVisible();
      await expect(sectorTable.getByRole('columnheader', { name: '주간 수익률' })).toBeVisible();
      const technologyRow = sectorTable.getByRole('row').filter({ hasText: 'XLK' });
      await expect(technologyRow.getByText('+1.20%', { exact: true })).toBeVisible();
      await expect(technologyRow.getByText('+3.40%', { exact: true })).toBeVisible();
      await expect(technologyRow.getByText('5일선 위', { exact: true })).toBeVisible();
      await expect(technologyRow.getByText('20일선 위', { exact: true })).toBeVisible();
    });

    test('MF-02: 운영 제외 모델을 대기나 실패 집계로 표시하지 않음', async ({ page }) => {
      await setupMasterFilterInsightStatusMock(page);
      await page.goto('/master-filter');

      await expect(page.getByText('성공 1 / 수집 2', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /코드 분석 모델 운영 환경 제외/ })).toBeVisible();
      await expect(page.getByText('응답 대기', { exact: true })).toHaveCount(0);
    });
  });

  test.describe('방어 상태', () => {
    test.beforeEach(async ({ page }) => {
      await setupHaltMocks(page); // Sets to RED / HALT
      await login(page);
    });

    test('MF-03: 위험 판정 시 신규 매수 보류 표시', async ({ page }) => {
      await page.goto('/master-filter');

      await expect(page.getByRole('status', { name: '오늘 진입 결정: 방어 우선' })).toBeVisible();
      await expect(page.locator('text=현금 확보').or(page.locator('text=보유 종목 방어'))).toBeVisible();
    });

    test('MF-04: 쉬운 운용 가이드라인 표시', async ({ page }) => {
      await page.goto('/master-filter');
      
      const decisionBox = page.locator('text=현금 비중').or(page.locator('text=신규 매수 금지')).first();
      await expect(decisionBox).toBeVisible();
    });
  });
});
