import { expect, test } from '@playwright/test';
import { login } from './helpers/auth';
import { buildConditional90ScorecardMock, setupAllMocks } from './mocks/handlers';

test.describe('TC-REC: 추천 성과·원인 분석', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await login(page);
  });

  test('REC-01: 공식 추천 이력과 기간별 성과 표시', async ({ page }) => {
    await page.goto('/recommendations');
    await expect(page.getByRole('heading', { name: '추천 성과·원인 분석' })).toBeVisible();
    await expect(page.getByText('2026-05-19 나스닥 Top10')).toBeVisible();
    await expect(page.getByText('1. NVDA')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '현재 수익' })).toBeVisible();
    await expect(page.getByText('+4.20%').first()).toBeVisible();
    await expect(page.getByText('+3.50%')).toBeVisible();
  });

  test('REC-09: 최근 2주 추천 빈도 상위 5종목 표시', async ({ page }) => {
    await page.goto('/recommendations');
    const summary = page.getByRole('region', { name: '최근 2주 추천 빈도 Top 5' });

    await expect(summary).toBeVisible();
    await expect(summary.getByText('2026-06-08 ~ 2026-06-21 공식 추천 기준')).toBeVisible();
    await expect(summary.getByRole('row')).toHaveCount(6);
    await expect(summary.getByRole('row').nth(1)).toContainText('NVDA');
    await expect(summary.getByRole('row').nth(1)).toContainText('5회');
  });

  test('REC-07: 첫 진입 시가와 최신 평가가격 표시', async ({ page }) => {
    await page.goto('/recommendations');
    const row = page.getByRole('row').filter({ hasText: '1. NVDA' });

    await expect(page.getByRole('columnheader', { name: '진입 시가' }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '현재가' }).first()).toBeVisible();
    await expect(row.getByText('$120.00')).toBeVisible();
    await expect(row.getByText('2026-05-20')).toBeVisible();
    await expect(row.getByText('$125.04')).toBeVisible();
    await expect(row.getByText('2026-06-19')).toBeVisible();
  });

  test('REC-08: 카테고리와 분석 탭은 직접 이동 가능한 링크 제공', async ({ page }) => {
    await page.goto('/recommendations?category=NASDAQ100&date=2026-05-19');
    const main = page.getByRole('main');

    await expect(main.getByRole('link', { name: '코스피' })).toHaveAttribute('href', '/recommendations?category=KOSPI200&date=2026-05-19');
    await expect(main.getByRole('link', { name: '성과 분석' })).toHaveAttribute('href', '/recommendations?category=NASDAQ100&date=2026-05-19&view=metrics');
    await expect(main.getByRole('link', { name: '원인 분석' })).toHaveAttribute('href', '/recommendations?category=NASDAQ100&date=2026-05-19&view=diagnostics');
    await expect(main.getByRole('link', { name: '추천 이력' })).toHaveAttribute('aria-current', 'page');

    await main.getByRole('link', { name: '코스피' }).click();
    await expect(page).toHaveURL('/recommendations?category=KOSPI200&date=2026-05-19');
    await expect(page.getByRole('main').getByRole('link', { name: '코스피' })).toHaveAttribute('aria-current', 'page');
  });

  test('REC-05: 미성숙 기간은 완료 거래일 수를 표시', async ({ page }) => {
    await page.goto('/recommendations');
    await expect(page.getByText('대기 4/5')).toBeVisible();
    await expect(page.getByText('대기 4/20')).toBeVisible();
    await expect(page.getByText('대기 4/60')).toBeVisible();
  });

  test('REC-06: 성과 지표 헤더에 계산 기준 툴팁 표시', async ({ page }) => {
    await page.goto('/recommendations');
    const table = page.getByRole('table').filter({
      has: page.getByRole('button', { name: 'MFE / MAE 계산 기준' }),
    });

    await table.getByRole('button', { name: '초과수익 계산 기준' }).hover();
    await expect(page.locator('[role="tooltip"]:visible').getByText('종목 수익률 - 동일 기간 벤치마크 수익률')).toBeVisible();

    await table.getByRole('button', { name: 'MFE / MAE 계산 기준' }).hover();
    await expect(page.locator('[role="tooltip"]:visible').getByText('MFE는 진입 후 가장 높았던 수익률, MAE는 가장 낮았던 수익률입니다.')).toBeVisible();
  });

  test('REC-04: 추천일을 선택하면 해당 날짜 이력만 조회', async ({ page }) => {
    await page.goto('/recommendations');
    const requestPromise = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return url.pathname === '/api/recommendations'
        && url.searchParams.get('from') === '2026-05-19'
        && url.searchParams.get('to') === '2026-05-19';
    });

    await page.getByLabel('추천일 선택').fill('2026-05-19');
    await page.getByRole('button', { name: '조회' }).click();
    await requestPromise;

    await expect(page).toHaveURL(/date=2026-05-19/);
    await expect(page.getByText('2026-05-19 나스닥 Top10')).toBeVisible();
    await page.getByRole('link', { name: '전체 보기' }).click();
    await expect(page).not.toHaveURL(/date=/);
  });

  test('REC-02: 5·20·60일 성과와 표본 수 표시', async ({ page }) => {
    await page.goto('/recommendations');
    await page.getByRole('link', { name: '성과 분석' }).click();
    await expect(page).toHaveURL(/view=metrics/);
    await expect(page.getByRole('heading', { name: 'D5' })).toBeVisible();
    await expect(page.getByText('n=40')).toBeVisible();
    await expect(page.getByText('신호 소스별 성과')).toBeVisible();
  });

  test('REC-14: 조건부 73·85·90 점수판은 MFA를 차단하지 않고 자동승인을 금지', async ({ page }) => {
    await page.goto('/recommendations?view=metrics');

    const scorecard = page.getByRole('region', { name: '조건부 90점 검증 점수판' });
    await expect(scorecard).toBeVisible();
    await expect(scorecard.getByRole('progressbar', { name: '조건부 최대 점수 진행도' }))
      .toHaveAttribute('aria-valuenow', '73');
    await expect(scorecard.getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '구현 검증 기준선 포함 현재 점수 73점, 무료 인프라 조건부 이론상 최대 90점',
    );
    await expect(scorecard).toContainText('MFA 비필수 · 보상통제 적용');
    await expect(scorecard).toContainText('점수 차단 아님');
    await expect(scorecard).toContainText('자동 실매매 승인 아님');
    await expect(scorecard).toContainText('점수효과+12점');
    await expect(scorecard.getByText('85점', { exact: true })).toBeVisible();
    await expect(scorecard.getByText('90점', { exact: true })).toBeVisible();
  });

  test('REC-15: 최신 추천의 당시 결정을 사후결과와 분리해 기록', async ({ page }) => {
    await page.goto('/recommendations');
    const row = page.getByRole('row').filter({ hasText: '1. NVDA' });
    const requestPromise = page.waitForRequest((request) => (
      new URL(request.url()).pathname === '/api/assurance/conditional-90'
      && request.method() === 'POST'
    ));

    await row.getByText('결정 원장 기록').click();
    await row.getByLabel('결정').selectOption('WATCH');
    await row.getByLabel('주된 사유').selectOption('NEEDS_REVIEW');
    await row.getByLabel('당시 판단 근거').fill('실적 발표 전이라 추가 확인이 필요합니다.');
    await row.getByRole('button', { name: '불변 원장에 기록' }).click();

    const request = await requestPromise;
    expect(await request.postDataJSON()).toMatchObject({
      action: 'RECORD_DECISION',
      decisionCode: 'WATCH',
      reasonCodes: ['NEEDS_REVIEW'],
    });
    await expect(row.getByRole('status')).toContainText('거래나 자본 승인이 생성되지는 않습니다');
  });

  test('REC-15A: HTTP 200이라도 결정 기록 응답 계약이 틀리면 성공으로 표시하지 않음', async ({ page }) => {
    await page.route('**/api/assurance/conditional-90', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: buildConditional90ScorecardMock() }),
      });
    });
    await page.goto('/recommendations');
    const row = page.getByRole('row').filter({ hasText: '1. NVDA' });

    await row.getByText('결정 원장 기록').click();
    await row.getByLabel('당시 판단 근거').fill('실적 발표 전이라 추가 확인이 필요합니다.');
    await row.getByRole('button', { name: '불변 원장에 기록' }).click();

    await expect(row.getByRole('alert')).toContainText('엄격한 기록 계약과 일치하지 않습니다');
    await expect(row.getByRole('status')).toHaveCount(0);
    await expect(row.getByLabel('당시 판단 근거')).toHaveValue('실적 발표 전이라 추가 확인이 필요합니다.');
  });

  test('REC-15B: 서버가 다른 유효 decision code를 반환해도 제출 성공으로 오인하지 않음', async ({ page }) => {
    await page.route('**/api/assurance/conditional-90', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            action: 'RECORD_DECISION',
            result: {
              id: '90000000-0000-4000-8000-000000000004',
              decision_hash: 'f'.repeat(64),
              pick_id: 'pick-1',
              decision_code: 'ACCEPT',
              decided_at: '2026-08-03T00:00:00.000Z',
            },
          },
          meta: {
            asOf: '2026-08-03T00:00:00.000Z',
            source: 'MTN assurance decision ledger',
            provider: 'Supabase',
            delay: 'REALTIME',
            fallbackUsed: false,
            warnings: [],
          },
        }),
      });
    });
    await page.goto('/recommendations');
    const row = page.getByRole('row').filter({ hasText: '1. NVDA' });

    await row.getByText('결정 원장 기록').click();
    await row.getByLabel('결정').selectOption('WATCH');
    await row.getByLabel('당시 판단 근거').fill('실적 발표 전이라 추가 확인이 필요합니다.');
    await row.getByRole('button', { name: '불변 원장에 기록' }).click();

    await expect(row.getByRole('alert')).toContainText('엄격한 기록 계약과 일치하지 않습니다');
    await expect(row.getByRole('status')).toHaveCount(0);
  });

  test('REC-16: 점수판 API 장애는 기존 추천 성과 화면과 격리', async ({ page }) => {
    await page.route('**/api/assurance/conditional-90', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'ASSURANCE_EVALUATION_FAILED',
          message: 'PostgREST internal connection details should not be exposed',
          recoverable: false,
        }),
      });
    });
    await page.goto('/recommendations?view=metrics');

    await expect(page.getByRole('heading', { name: 'D5' })).toBeVisible();
    const failure = page.getByRole('alert', { name: '조건부 90점 검증 점수판 장애' });
    await expect(failure).toContainText('조건부 90점 검증 근거를 불러오지 못했습니다');
    await expect(failure).toContainText('기존 추천 성과 화면은 계속 사용할 수 있습니다');
    await expect(failure).not.toContainText('PostgREST');
  });

  test('REC-17: 위조되거나 불완전한 점수판 응답은 fail-closed', async ({ page }) => {
    await page.route('**/api/assurance/conditional-90', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            schemaVersion: 'mtn-conditional-90-scorecard-v1',
            policyVersion: 'mtn-conditional-90-policy-2026.08-v1',
            evaluatedAt: '2026-08-03T00:00:00.000Z',
            score: { verifiedScore: 90, scaleMax: 100, conditionalMaximum: 90, nextMilestone: null },
            disposition: 'ELIGIBLE_FOR_HUMAN_REVIEW',
            capitalApproval: 'NOT_GRANTED',
            milestones: [],
            domains: [],
          },
        }),
      });
    });
    await page.goto('/recommendations?view=metrics');

    await expect(page.getByRole('heading', { name: 'D5' })).toBeVisible();
    const failure = page.getByRole('alert', { name: '조건부 90점 검증 점수판 장애' });
    await expect(failure).toContainText('점수판 응답 형식이 v1 계약과 일치하지 않습니다');
    await expect(failure).toContainText('기존 추천 성과 화면은 계속 사용할 수 있습니다');
  });

  test('REC-17A: 유효한 3개 뒤에 위조 milestone을 덧붙인 응답도 fail-closed', async ({ page }) => {
    const scorecard = buildConditional90ScorecardMock();
    await page.route('**/api/assurance/conditional-90', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            ...scorecard,
            milestones: [
              { score: 73, status: 'PASS', requirements: null },
              ...scorecard.milestones,
            ],
          },
        }),
      });
    });
    await page.goto('/recommendations?view=metrics');

    const failure = page.getByRole('alert', { name: '조건부 90점 검증 점수판 장애' });
    await expect(failure).toContainText('점수판 응답 형식이 v1 계약과 일치하지 않습니다');
    await expect(page.getByRole('region', { name: '조건부 90점 검증 점수판' })).toHaveCount(0);
  });

  test('REC-17B: malformed blocker와 음수 개선효과 action은 렌더 전에 거부', async ({ page }) => {
    const scorecard = buildConditional90ScorecardMock();
    await page.route('**/api/assurance/conditional-90', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            ...scorecard,
            blockers: [{ ...scorecard.blockers[0], evidenceAsOf: 'not-a-date', unexpected: 'forged' }],
            priorityActions: [{ ...scorecard.priorityActions[0], expectedPointGain: -999 }],
          },
        }),
      });
    });
    await page.goto('/recommendations?view=metrics');

    const failure = page.getByRole('alert', { name: '조건부 90점 검증 점수판 장애' });
    await expect(failure).toContainText('점수판 응답 형식이 v1 계약과 일치하지 않습니다');
    await expect(page.getByText('-999점')).toHaveCount(0);
  });

  test('REC-10: 데이터 근거와 성과 검증 한계를 정직하게 표시', async ({ page }) => {
    await page.route('**/api/recommendations/metrics**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            engineVersion: null,
            horizons: [{
              horizon: 'D5', sampleSize: 40, positiveHitRate: 62.5, benchmarkWinRate: 57.5,
              averageReturnPct: 2.4, medianReturnPct: 1.8, averageExcessReturnPct: 0.9,
              averageMfePct: 5.2, averageMaePct: -2.1, lowerDecileReturnPct: -6.4,
            }],
            segments: [],
            cohorts: [
              { runDate: '2026-06-18', horizon: 'D5' },
              { runDate: '2026-06-19', horizon: 'D5' },
            ],
            dataAsOf: '2026-06-19',
          },
          meta: {
            source: 'MTN recommendation metrics', provider: 'Supabase', delay: 'EOD',
            asOf: '2026-06-20T00:00:00Z', fallbackUsed: false, warnings: [],
          },
        }),
      });
    });

    await page.goto('/recommendations?view=metrics');

    const trust = page.getByRole('region', { name: '추천 데이터 신뢰도' });
    await expect(trust).toContainText('기준시각');
    await expect(trust).toContainText('Supabase');
    await expect(trust).toContainText('신선도미측정');
    await expect(trust).toContainText('대체 데이터미사용');

    const evidence = page.getByRole('region', { name: '추천 성과 검증 상태' });
    await expect(evidence).toContainText('독립 추천일2일');
    await expect(evidence).toContainText('95% 신뢰구간미측정');
    await expect(evidence).toContainText('평균 MAE-2.10%');
    await expect(evidence).toContainText('하위 10%-6.40%');
    await expect(evidence).toContainText('실자금 승격 상태검증 대기');
  });

  test('REC-12: 권위 근거는 기간별 비용 후 공식·대체 성과와 차단 사유를 분리 표시', async ({ page }) => {
    const evidenceSummary = ({
      sampleSize,
      cohortCount,
      meanNetReturnPct,
      meanNetExcessReturnPct,
      lower,
      upper,
      averageMaePct,
      lowerDecileNetReturnPct,
      marketRegimeCount,
    }: {
      sampleSize: number;
      cohortCount: number;
      meanNetReturnPct: number;
      meanNetExcessReturnPct: number;
      lower: number;
      upper: number;
      averageMaePct: number;
      lowerDecileNetReturnPct: number;
      marketRegimeCount: number;
    }) => ({
      sampleSize,
      cohortCount,
      meanNetReturnPct,
      meanNetExcessReturnPct,
      excessReturnConfidenceInterval95: { confidenceLevel: 0.95, lower, upper },
      averageMaePct,
      lowerDecileNetReturnPct,
      marketRegimeCount,
      marketRegimes: marketRegimeCount > 1 ? ['GREEN', 'RED'] : ['GREEN'],
    });
    const official = evidenceSummary({
      sampleSize: 120, cohortCount: 24, meanNetReturnPct: 2.1, meanNetExcessReturnPct: 1,
      lower: 0.4, upper: 1.6, averageMaePct: -3.2, lowerDecileNetReturnPct: -7.8,
      marketRegimeCount: 2,
    });
    const fallback = evidenceSummary({
      sampleSize: 8, cohortCount: 3, meanNetReturnPct: -1.2, meanNetExcessReturnPct: -2,
      lower: -4.1, upper: 0.2, averageMaePct: -6.4, lowerDecileNetReturnPct: -11.3,
      marketRegimeCount: 1,
    });
    const evaluation = (horizon: string, status: 'PASS' | 'BLOCKED', reasons: string[]) => ({
      horizon,
      sample_size: official.sampleSize,
      cohort_count: official.cohortCount,
      market_regime_count: official.marketRegimeCount,
      mean_net_return_pct: official.meanNetReturnPct,
      mean_net_excess_return_pct: official.meanNetExcessReturnPct,
      excess_ci95_lower: official.excessReturnConfidenceInterval95.lower,
      excess_ci95_upper: official.excessReturnConfidenceInterval95.upper,
      average_mae_pct: official.averageMaePct,
      lower_decile_net_return_pct: official.lowerDecileNetReturnPct,
      evidence_status: 'READY',
      account_evidence_status: 'NOT_AVAILABLE',
      statistics: { official, fallback },
      promotion_gate: { status, passed: status === 'PASS', reasons },
    });

    await page.route('**/api/recommendations/metrics**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            engineVersion: 'engine-v2', horizons: [], segments: [], cohorts: [], dataAsOf: '2026-08-01',
            promotion: { decision: 'PROMOTE_FLOW', legacyDecision: 'PROMOTE_FLOW' },
            evidence: {
              status: 'AVAILABLE', authoritative: true, accountEvidenceStatus: 'NOT_AVAILABLE',
              methodology: {
                confidenceLevel: 0.95, bootstrapUnit: 'RECOMMENDATION_DAY_COHORT',
                officialFallbackSeparated: true, costs: 'STANDARDIZED_MODEL_NOT_ACCOUNT_ACTUAL',
              },
              evaluations: [
                evaluation('D5', 'PASS', []),
                evaluation('D20', 'BLOCKED', ['NON_POSITIVE_EXCESS_CI_LOWER_BOUND']),
                evaluation('D60', 'PASS', []),
              ],
              evidencePromotion: {
                status: 'BLOCKED', engineVersion: 'engine-v2', reasons: ['HORIZON_GATE_BLOCKED'],
              },
            },
            evidencePromotion: {
              status: 'BLOCKED', engineVersion: 'engine-v2', reasons: ['HORIZON_GATE_BLOCKED'],
            },
          },
          meta: { source: 'MTN recommendation metrics', provider: 'Supabase', delay: 'EOD' },
        }),
      });
    });

    await page.goto('/recommendations?view=metrics');

    const evidence = page.getByRole('region', { name: '비용 후 추천 권위 근거' });
    await expect(evidence.getByText('권위 승격 게이트', { exact: true })).toBeVisible();
    await expect(evidence.getByText('차단', { exact: true }).first()).toBeVisible();
    await expect(evidence).toContainText('실계좌 근거 없음 (NOT_AVAILABLE)');
    await expect(evidence).toContainText('공식 데이터와 대체 데이터 분리');

    const d5 = evidence.getByRole('row', { name: /D5/ });
    await expect(d5).toContainText('n=120 · 독립 24일');
    await expect(d5).toContainText('비용 후 순수익 +2.10%');
    await expect(d5).toContainText('비용 후 초과 +1.00%');
    await expect(d5).toContainText('95% CI +0.40% ~ +1.60%');
    await expect(d5).toContainText('MAE -3.20% · 하위 10% -7.80%');
    await expect(d5).toContainText('시장 국면 2개');
    await expect(d5).toContainText('n=8 · 독립 3일');

    const d20 = evidence.getByRole('row', { name: /D20/ });
    await expect(d20).toContainText('95% CI 하한 0% 이하');
    await expect(evidence).not.toContainText('수급 정책 승격 후보');
  });

  test('REC-13: 권위 근거가 없으면 legacy 승격 후보를 무시하고 검증 대기로 닫힘 처리', async ({ page }) => {
    await page.route('**/api/recommendations/metrics**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            horizons: [], segments: [], cohorts: [],
            promotion: { decision: 'PROMOTE_FLOW', legacyDecision: 'PROMOTE_FLOW' },
            evidence: {
              status: 'MISSING', authoritative: true, accountEvidenceStatus: 'NOT_AVAILABLE',
              evaluations: [],
              evidencePromotion: { status: 'BLOCKED', engineVersion: null, reasons: ['MISSING_EVIDENCE'] },
            },
            evidencePromotion: { status: 'BLOCKED', engineVersion: null, reasons: ['MISSING_EVIDENCE'] },
          },
        }),
      });
    });

    await page.goto('/recommendations?view=metrics');

    const evidence = page.getByRole('region', { name: '비용 후 추천 권위 근거' });
    await expect(evidence).toContainText('권위 승격 게이트검증 대기');
    await expect(evidence).toContainText('권위 근거 없음');
    await expect(evidence).toContainText('공식 표본미측정');
    await expect(evidence.getByRole('row')).toHaveCount(4);
    await expect(evidence).not.toContainText('수급 정책 승격 후보');
  });

  test('REC-11: 부분 장애에서 원시 오류를 숨기고 마지막 성공과 다음 조치를 표시', async ({ page }) => {
    await page.route('**/api/recommendations/metrics**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'API_ERROR', recoverable: false,
          message: 'TypeError: fetch failed at GET route.ts:42 cause ECONNREFUSED 127.0.0.1:5432',
          lastSuccessfulAt: '2026-06-19T21:00:00Z',
        }),
      });
    });

    await page.goto('/recommendations?view=metrics');

    const failure = page.getByRole('alert', { name: '추천 성과 데이터를 불러오지 못했습니다' });
    await expect(failure).toContainText('추천 성과 데이터를 불러오지 못했습니다');
    await expect(failure).toContainText('마지막 성공');
    await expect(failure).toContainText('다음 조치');
    await expect(failure).not.toContainText('ECONNREFUSED');
    await expect(failure).not.toContainText('route.ts');
  });

  test('REC-03: 표본 부족 원인은 반복 원인이 아닌 가설로 표시', async ({ page }) => {
    await page.goto('/recommendations?view=diagnostics');
    await expect(page.getByText('진입 시점').first()).toBeVisible();
    await expect(page.getByText('가설', { exact: true })).toBeVisible();
    await expect(page.getByText(/n=18/)).toBeVisible();
    await expect(page.getByText(/진입 시점 가설/)).toBeVisible();
  });
});
