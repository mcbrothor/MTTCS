import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { readRecommendationMetrics } from '@/lib/recommendations/read';
import { readRecommendationEvidence } from '@/lib/recommendations/evidence-repository';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import type { RecommendationCategory, RecommendationMarket } from '@/lib/recommendations/types';
import {
  KR_RISK_ENGINE_VERSION,
  KR_RISK_FLOW_ENGINE_VERSION,
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_CATEGORY_MARKET,
  RECOMMENDATION_ENGINE_VERSION,
} from '@/lib/recommendations/config';
import { evaluateKrPolicyPromotion } from '@/lib/recommendations/policy-evaluation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;
  const params = new URL(request.url).searchParams;
  const categoryParam = params.get('category')?.toUpperCase() || null;
  if (categoryParam && !RECOMMENDATION_CATEGORIES.includes(categoryParam as RecommendationCategory)) {
    return apiError('category must be NASDAQ100, SP500, KOSPI200, or KOSDAQ150.', 'INVALID_CATEGORY', 400);
  }
  const category = categoryParam as RecommendationCategory | null;
  const market = category ? RECOMMENDATION_CATEGORY_MARKET[category] : (params.get('market')?.toUpperCase() || 'US');
  if (market !== 'US' && market !== 'KR') return apiError('market must be US or KR.', 'INVALID_MARKET', 400);
  try {
    const client = getSupabaseAdmin();
    const result = await readRecommendationMetrics({
      client,
      market: market as RecommendationMarket,
      category,
      from: params.get('from'),
      to: params.get('to'),
      official: params.has('official') ? params.get('official') === 'true' : undefined,
      engineVersion: params.get('engineVersion'),
    });
    if (market === 'KR' && !params.get('engineVersion')) {
      const policies = await Promise.all([
        RECOMMENDATION_ENGINE_VERSION,
        KR_RISK_ENGINE_VERSION,
        KR_RISK_FLOW_ENGINE_VERSION,
      ].map((engineVersion) => readRecommendationMetrics({
        client,
        market: 'KR',
        category,
        from: params.get('from'),
        to: params.get('to'),
        engineVersion,
      })));
      const policyRows = policies.flatMap((policy) => policy.cohorts
        .filter((cohort) => cohort.horizon === 'D5'
          && cohort.averageExcessReturnPct !== null
          && cohort.averageMaePct !== null
          && cohort.lowerDecileReturnPct !== null)
        .map((cohort) => ({
          runDate: cohort.runDate,
          engineVersion: policy.engineVersion as string,
          averageExcessReturnPct: cohort.averageExcessReturnPct as number,
          averageMaePct: cohort.averageMaePct as number,
          lowerDecileReturnPct: cohort.lowerDecileReturnPct as number,
          flowCoveragePct: cohort.flowCoveragePct,
        })));
      const legacyPromotion = evaluateKrPolicyPromotion(policyRows);
      const candidateEngineVersion = legacyPromotion.decision === 'PROMOTE_FLOW'
        ? KR_RISK_FLOW_ENGINE_VERSION
        : legacyPromotion.decision === 'PROMOTE_RISK'
          ? KR_RISK_ENGINE_VERSION
          : RECOMMENDATION_ENGINE_VERSION;
      const evidence = await readRecommendationEvidence({
        client,
        market: 'KR',
        category,
        engineVersion: candidateEngineVersion,
      });
      const evidencePromotion = evidence.evidencePromotion;
      const evidenceGatePassed = evidencePromotion.status === 'PASS';
      return apiSuccess({
        ...result,
        policies,
        evidence,
        evidencePromotion,
        promotion: {
          ...legacyPromotion,
          legacyDecision: legacyPromotion.decision,
          decision: evidenceGatePassed ? legacyPromotion.decision : 'CONTINUE',
          evidenceGatePassed,
          authoritativeGate: 'COST_ADJUSTED_COHORT_BOOTSTRAP_95',
        },
      }, { source: 'MTN recommendation metrics', provider: 'Supabase', delay: 'EOD' });
    }
    const evidence = await readRecommendationEvidence({
      client,
      market: market as RecommendationMarket,
      category,
      engineVersion: params.get('engineVersion') || RECOMMENDATION_ENGINE_VERSION,
    });
    const evidencePromotion = evidence.evidencePromotion;
    return apiSuccess({ ...result, evidence, evidencePromotion }, { source: 'MTN recommendation metrics', provider: 'Supabase', delay: 'EOD' });
  } catch (error) {
    return apiError(getErrorMessage(error, 'Recommendation metrics query failed.'), 'API_ERROR', 500);
  }
}
