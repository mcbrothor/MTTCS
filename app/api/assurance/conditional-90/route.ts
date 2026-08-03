import { rejectUnauthenticatedRequest } from '@/lib/auth/api';
import { apiError, apiSuccess, getErrorMessage } from '@/lib/api/response';
import { readConditional90Assurance } from '@/lib/assurance/repository';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getRequestSession } from '@/lib/auth/session';
import { getAssuranceReviewerSubject } from '@/lib/assurance/reviewer-auth';
import {
  linkRecommendationPilot,
  recordBrokerEvidenceReview,
  recordManualAccessibilityReview,
  recordRecommendationDecision,
  recordRecommendationPilotOutcome,
} from '@/lib/assurance/actions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authFailure = await rejectUnauthenticatedRequest(request);
  if (authFailure) return authFailure;

  try {
    const scorecard = await readConditional90Assurance({
      client: getSupabaseAdmin(),
      releaseSha: process.env.MTN_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
    });
    const response = apiSuccess(scorecard, {
      source: 'MTN immutable assurance ledgers',
      provider: 'Supabase/GitHub Actions/MTN',
      delay: 'EOD',
    });
    response.headers.set('cache-control', 'no-store, max-age=0');
    return response;
  } catch (error) {
    console.error('[MTN] Conditional assurance evaluation failed:', getErrorMessage(error));
    const response = apiError(
      'Conditional 90-point assurance evaluation failed.',
      'ASSURANCE_EVALUATION_FAILED',
      503,
    );
    response.headers.set('cache-control', 'no-store, max-age=0');
    return response;
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return apiError('A JSON object is required.', 'INVALID_INPUT', 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return apiError('A valid JSON body is required.', 'INVALID_JSON', 400);
  }

  const action = String(body.action || '').toUpperCase();
  const client = getSupabaseAdmin();
  if (action === 'RECORD_BROKER_REVIEW') {
    const reviewerSubject = await getAssuranceReviewerSubject(request);
    if (!reviewerSubject) return apiError('Independent assurance reviewer authentication required.', 'REVIEWER_AUTH_REQUIRED', 401);
    try {
      const result = await recordBrokerEvidenceReview({
        client,
        reviewerSubject,
        pilotLinkId: body.pilotLinkId,
        sourceKind: body.sourceKind,
        artifactHash: body.artifactHash,
        checklist: body.checklist,
        attestation: body.attestation,
        reviewedAt: body.reviewedAt,
      });
      return apiSuccess({ action, result }, { source: 'MTN independent broker evidence review ledger', provider: 'Supabase', delay: 'REALTIME' }, 201);
    } catch (error) {
      console.error('[MTN] Broker evidence review append failed:', getErrorMessage(error));
      return apiError('Broker evidence review append failed.', 'BROKER_REVIEW_APPEND_FAILED', 400);
    }
  }
  if (action === 'RECORD_ACCESSIBILITY_REVIEW') {
    const reviewerSubject = await getAssuranceReviewerSubject(request);
    if (!reviewerSubject) return apiError('Independent assurance reviewer authentication required.', 'REVIEWER_AUTH_REQUIRED', 401);
    try {
      const result = await recordManualAccessibilityReview({
        client,
        reviewerSubject,
        releaseSha: body.releaseSha,
        artifactHash: body.artifactHash,
        assistiveTechnology: body.assistiveTechnology,
        routesReviewed: body.routesReviewed,
        checks: body.checks,
        reviewerAttestation: body.reviewerAttestation,
        notes: body.notes,
        observedAt: body.observedAt,
      });
      return apiSuccess({ action, result }, { source: 'MTN independent accessibility review ledger', provider: 'Supabase', delay: 'REALTIME' }, 201);
    } catch (error) {
      console.error('[MTN] Accessibility review append failed:', getErrorMessage(error));
      return apiError('Accessibility review append failed.', 'ACCESSIBILITY_REVIEW_APPEND_FAILED', 400);
    }
  }

  const session = await getRequestSession(request);
  if (!session) return apiError('Authentication required.', 'AUTH_REQUIRED', 401);
  try {
    if (action === 'RECORD_DECISION') {
      const result = await recordRecommendationDecision({
        client,
        actorSubject: session.sub,
        pickId: body.pickId,
        decisionCode: body.decisionCode,
        reasonCodes: body.reasonCodes,
        rationale: body.rationale,
        decidedAt: body.decidedAt,
        supersedesId: body.supersedesId,
      });
      return apiSuccess({ action, result }, { source: 'MTN assurance decision ledger', provider: 'Supabase', delay: 'REALTIME' }, 201);
    }
    if (action === 'LINK_PILOT') {
      const result = await linkRecommendationPilot({
        client,
        actorSubject: session.sub,
        decisionId: body.decisionId,
        tradeId: body.tradeId,
        authorizedRiskR: body.authorizedRiskR,
        linkedAt: body.linkedAt,
      });
      return apiSuccess({ action, result }, { source: 'MTN assurance pilot ledger', provider: 'Supabase', delay: 'REALTIME' }, 201);
    }
    if (action === 'RECORD_OUTCOME') {
      const result = await recordRecommendationPilotOutcome({
        client,
        actorSubject: session.sub,
        pilotLinkId: body.pilotLinkId,
        sourceKind: body.sourceKind,
        brokerEvidenceReviewId: body.brokerEvidenceReviewId,
        commissionAmount: body.commissionAmount,
        taxAmount: body.taxAmount,
        fxCostAmount: body.fxCostAmount,
        otherCostAmount: body.otherCostAmount,
        observedAt: body.observedAt,
        supersedesId: body.supersedesId,
      });
      return apiSuccess({ action, result }, { source: 'MTN assurance account-actual ledger', provider: 'Supabase', delay: 'REALTIME' }, 201);
    }
    return apiError('action must be RECORD_DECISION, LINK_PILOT, RECORD_BROKER_REVIEW, RECORD_OUTCOME, or RECORD_ACCESSIBILITY_REVIEW.', 'INVALID_ACTION', 400);
  } catch (error) {
    console.error('[MTN] Assurance evidence append failed:', getErrorMessage(error));
    return apiError('Assurance evidence append failed.', 'ASSURANCE_APPEND_FAILED', 400);
  }
}
