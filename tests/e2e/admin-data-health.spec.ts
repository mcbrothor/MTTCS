import { expect, test } from '@playwright/test';
import { login } from './helpers/auth';
import { setupAllMocks } from './mocks/handlers';

test.describe('TC-ADMIN-HEALTH: 운영 데이터 상태', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
  });

  test('ADMIN-HEALTH-01: 정상·부분 장애·실패를 텍스트와 다음 조치로 구분', async ({ page }) => {
    await page.route('**/api/admin/data-health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'ok', pipeline: 'market-data', provider: 'KIS', market: 'KR', status: 'SUCCESS', observed_at: '2026-06-20T01:00:00Z', completed_at: '2026-06-20T01:01:00Z', fallback_used: false, error_message: null },
            { id: 'partial', pipeline: 'macro', provider: 'FRED/Yahoo', market: 'US', status: 'DEGRADED', observed_at: '2026-06-20T00:30:00Z', completed_at: '2026-06-20T00:31:00Z', fallback_used: true, error_message: 'primary provider unavailable' },
            { id: 'failed', pipeline: 'recommendations', provider: 'Supabase', market: 'US', status: 'FAILED', observed_at: null, completed_at: '2026-06-20T00:32:00Z', fallback_used: false, error_message: 'TypeError: fetch failed ECONNREFUSED 127.0.0.1:5432 at route.ts:42' },
          ],
          meta: { source: 'data_pipeline_runs', provider: 'Supabase', delay: 'REALTIME', asOf: '2026-06-20T01:01:00Z', fallbackUsed: false, warnings: [], isStale: false },
        }),
      });
    });

    await page.goto('/admin');

    const panel = page.getByRole('region', { name: 'Data Health', exact: true });
    await expect(panel).toContainText(/정상\s*1/);
    await expect(panel).toContainText(/부분 장애\s*1/);
    await expect(panel).toContainText(/실패\s*1/);
    await expect(panel).toContainText(/대체 데이터\s*사용/);
    await expect(panel).toContainText(/마지막 성공\s*미측정/);
    await expect(panel).toContainText(/다음 조치\s*신규 투자 판단을 중단하고 파이프라인을 재실행하세요\./);
    await expect(panel).not.toContainText('ECONNREFUSED');
    await expect(panel).not.toContainText('route.ts');

    await panel.getByRole('button', { name: 'Data Health 새로고침' }).focus();
    await expect(panel.getByRole('button', { name: 'Data Health 새로고침' })).toBeFocused();
  });

  test('ADMIN-HEALTH-02: 오래된 SUCCESS를 실패로 제한하고 실제 SLA를 표시', async ({ page }) => {
    await page.route('**/api/admin/data-health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            id: 'stale-success',
            pipeline: 'recommendation-performance',
            provider: 'KIS/Yahoo',
            market: 'KR',
            status: 'FAILED',
            recorded_status: 'SUCCESS',
            observed_at: '2026-07-09T08:00:00Z',
            freshness_at: '2026-07-09T08:00:00Z',
            completed_at: '2026-07-09T08:03:00Z',
            fallback_used: false,
            error_message: null,
            freshness_status: 'STALE',
            age_seconds: 2_073_600,
            expected_max_age_seconds: 108_000,
            next_expected_at: '2026-07-10T14:00:00Z',
            last_success_at: '2026-07-09T08:00:00Z',
            stale_reason: '원천 데이터가 108000초 SLA를 초과했습니다.',
          }],
          meta: {
            source: 'data_pipeline_runs', provider: 'Supabase', delay: 'UNKNOWN',
            asOf: '2026-07-09T08:00:00Z', observedAt: '2026-07-09T08:00:00Z',
            fallbackUsed: false, warnings: [], isStale: true,
            staleReason: '1개 파이프라인이 지연 상태입니다.',
          },
        }),
      });
    });

    await page.goto('/admin');
    const panel = page.getByRole('region', { name: 'Data Health', exact: true });
    await expect(panel).toContainText(/실패\s*1/);
    await expect(panel).toContainText('신선도 / SLA');
    await expect(panel).toContainText('지연 · 24일 / 30시간');
    await expect(panel).toContainText('저장 상태 SUCCESS였으나 신선도 검증 결과 FAILED로 제한했습니다.');
    await expect(panel).toContainText('신선도 제한 원천 데이터가 108000초 SLA를 초과했습니다.');
  });
});
