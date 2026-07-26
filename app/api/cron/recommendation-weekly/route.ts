import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { validateCronRequest } from '@/lib/contest-cron';
import { evaluateKrPolicyPromotion, type PolicyCohortMetric } from '@/lib/recommendations/policy-evaluation';
import { readRecommendationDiagnostics, readRecommendationMetrics } from '@/lib/recommendations/read';
import {
  formatRecommendationWeeklyReport,
  getRecommendationWeeklyWindow,
  validateRecommendationWeeklyReadiness,
} from '@/lib/recommendations/weekly-report';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { chunkTelegramMessage, sendTelegramMessage } from '@/lib/telegram';
import {
  createWeeklyDeliveryHooks,
  weeklyReportKey,
  weeklyReportMessageHash,
} from '@/lib/recommendations/weekly-delivery';
import {
  KR_RISK_ENGINE_VERSION,
  KR_RISK_FLOW_ENGINE_VERSION,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_CATEGORY_MARKET,
  RECOMMENDATION_ENGINE_VERSION,
} from '@/lib/recommendations/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const POLICY_ENGINE_VERSIONS = [
  RECOMMENDATION_ENGINE_VERSION,
  KR_RISK_ENGINE_VERSION,
  KR_RISK_FLOW_ENGINE_VERSION,
] as const;

function isDryRun(request: Request) {
  const value = new URL(request.url).searchParams.get('dryRun');
  return value === 'true' || value === '1' || process.env.RECOMMENDATION_WEEKLY_DRY_RUN === 'true';
}

function toPolicyCohorts(
  engineVersion: string,
  cohorts: Awaited<ReturnType<typeof readRecommendationMetrics>>['cohorts'],
): PolicyCohortMetric[] {
  return cohorts.flatMap((row) => {
    if (
      row.horizon !== 'D5'
      || row.averageExcessReturnPct === null
      || row.averageMaePct === null
      || row.lowerDecileReturnPct === null
    ) {
      return [];
    }
    return [{
      runDate: row.runDate,
      engineVersion,
      averageExcessReturnPct: row.averageExcessReturnPct,
      averageMaePct: row.averageMaePct,
      lowerDecileReturnPct: row.lowerDecileReturnPct,
      flowCoveragePct: row.flowCoveragePct,
    }];
  });
}

export async function GET(request: Request) {
  if (!validateCronRequest(request)) return apiError('Unauthorized cron request.', 'AUTH_REQUIRED', 401);
  const dryRun = isDryRun(request);
  const generatedAt = new Date().toISOString();
  const reportingWindow = getRecommendationWeeklyWindow(generatedAt);

  try {
    const client = getSupabaseAdmin();
    const categories = [];
    for (const category of RECOMMENDATION_CATEGORIES) {
      const market = RECOMMENDATION_CATEGORY_MARKET[category];
      const [weeklyMetrics, cumulativeMetrics, diagnostics, ...policyMetrics] = await Promise.all([
        readRecommendationMetrics({
          client,
          market,
          category,
          evaluationFrom: reportingWindow.from,
          evaluationTo: reportingWindow.to,
        }),
        readRecommendationMetrics({ client, market, category }),
        readRecommendationDiagnostics({
          client,
          market,
          category,
          analyzedFrom: `${reportingWindow.from}T00:00:00+09:00`,
          analyzedTo: `${reportingWindow.to}T23:59:59+09:00`,
        }),
        ...(market === 'KR'
          ? POLICY_ENGINE_VERSIONS.map((engineVersion) => readRecommendationMetrics({
            client,
            market,
            category,
            engineVersion,
            horizon: 'D5',
          }))
          : []),
      ]);

      const policyCohorts = policyMetrics.flatMap((policy) => (
        toPolicyCohorts(policy.engineVersion as string, policy.cohorts)
      ));

      categories.push({
        category,
        market,
        horizons: weeklyMetrics.horizons,
        cumulativeHorizons: cumulativeMetrics.horizons,
        dataAsOf: cumulativeMetrics.dataAsOf,
        weeklyDataAsOf: weeklyMetrics.dataAsOf,
        causes: diagnostics.causeSummary,
        findings: diagnostics.findings.map((finding) => ({
          summaryKo: finding.summary_ko,
          findingStatus: finding.finding_status,
          severity: finding.severity,
          sampleSize: finding.sample_size,
          causeCode: finding.cause_code,
        })),
        policies: policyMetrics.map((policy) => ({
          engineVersion: policy.engineVersion as string,
          d5: policy.horizons.find((row) => row.horizon === 'D5') || null,
        })),
        policyDecision: market === 'KR' ? evaluateKrPolicyPromotion(policyCohorts) : null,
      });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.MTN_BASE_URL || null;
    const message = formatRecommendationWeeklyReport({
      generatedAt,
      reportingWindow,
      categories,
      dashboardUrl: origin ? `${origin.replace(/\/$/, '')}/recommendations?view=metrics` : null,
    });
    const chunks = chunkTelegramMessage(message);
    const readiness = validateRecommendationWeeklyReadiness(
      categories.map((category) => ({
        category: category.category,
        weeklyDataAsOf: category.weeklyDataAsOf,
        d5SampleSize: category.horizons.find((row) => row.horizon === 'D5')?.sampleSize || 0,
      })),
      reportingWindow,
      {
        minD5SampleSize: Number(process.env.RECOMMENDATION_WEEKLY_MIN_D5_SAMPLE || 5),
        maxDataLagDays: Number(process.env.RECOMMENDATION_WEEKLY_MAX_DATA_LAG_DAYS || 3),
      },
    );
    const dataAsOf = readiness.dataAsOf;
    if (message.length >= 3_200 || chunks.length !== 1) {
      throw new Error(`Weekly report exceeds the single-message limit (${message.length} chars, ${chunks.length} chunks).`);
    }

    console.info(JSON.stringify({
      event: 'recommendation_weekly_report_ready',
      dryRun,
      reportingWindow,
      categoryCount: categories.length,
      dataAsOf,
      messageLength: message.length,
      chunkCount: chunks.length,
      readiness,
    }));

    if (dryRun) {
      return apiSuccess({
        dryRun: true,
        preview: message,
        messageLength: message.length,
        chunkCount: chunks.length,
        dataAsOf,
        readiness,
        categories,
      }, { source: 'MTN weekly recommendation review', provider: 'Rules/Statistics', delay: 'EOD' });
    }

    if (!readiness.ready) {
      throw new Error(`Weekly report data is incomplete: ${readiness.failures.join('; ')}`);
    }

    const delivery = await sendTelegramMessage(message, createWeeklyDeliveryHooks({
      client,
      reportKey: weeklyReportKey(reportingWindow),
      messageHash: weeklyReportMessageHash(message),
    }));
    if (delivery.skipped) {
      throw new Error('Telegram delivery was skipped.');
    }
    console.info(JSON.stringify({
      event: 'recommendation_weekly_report_delivered',
      reportingWindow,
      categoryCount: categories.length,
      dataAsOf,
      messageLength: message.length,
      chunkCount: chunks.length,
      deliveredChats: delivery.sent,
    }));
    return apiSuccess({
      dryRun: false,
      categories,
      delivery,
      messageLength: message.length,
      chunkCount: chunks.length,
      dataAsOf,
    }, { source: 'MTN weekly recommendation review', provider: 'Rules/Statistics', delay: 'EOD' });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'recommendation_weekly_report_failed',
      dryRun,
      reportingWindow,
      error: getErrorMessage(error, 'Recommendation weekly report failed.'),
    }));
    return apiError(getErrorMessage(error, 'Recommendation weekly report failed.'), 'API_ERROR', 500);
  }
}
