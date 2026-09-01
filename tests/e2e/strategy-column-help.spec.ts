import { expect, test } from '@playwright/test';

test('RS 산출 기준은 마우스와 키보드로 확인할 수 있다', async ({ page }) => {
  await page.route('**/api/strategies/us-monthly-v7', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          modelVersion: 'test-v1',
          modelStatus: 'RESEARCH_ONLY',
          status: 'FINAL',
          signalAt: '2026-08-31',
          effectiveAt: '2026-09-01',
          latestObservationAt: '2026-09-01',
          breadth: 62.5,
          drawdownPct: -2.1,
          averageRelativeMomentum: 4.2,
          cashWeightPct: 50,
          quality: { status: 'FULL', requested: 8, available: 8, coverage: 1, warnings: [] },
          regime: { regime: 'TREND', rawRegime: 'TREND', hysteresisApplied: false, weight: 50 },
          portfolio: [{ ticker: 'XLK', name: 'Technology', targetWeightPct: 50, score: 88 }],
          rankings: [{ ticker: 'XLK', name: 'Technology', rank: 1, score: 88, eligible: true, relativeMomentum6: 20.2 }],
          actions: { buy: [], hold: [], sell: [], watch: [] },
        },
      }),
    });
  });

  await page.goto('/strategies/us-monthly-v7');

  const rsHelp = page.getByRole('button', { name: 'RS 산출 기준' });
  await expect(rsHelp).toBeVisible();
  await rsHelp.hover();
  await expect(page.getByRole('tooltip')).toContainText('126거래일');
  await expect(page.getByRole('tooltip')).toContainText('산식:');

  await page.mouse.move(0, 0);
  await rsHelp.focus();
  await expect(page.getByRole('tooltip')).toContainText('벤치마크 상대가격');

  await expect(page.getByRole('button', { name: '순위 산출 기준' })).toBeVisible();
  await expect(page.getByRole('button', { name: '비고 산출 기준' })).toBeVisible();
});
