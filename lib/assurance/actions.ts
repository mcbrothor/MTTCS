import type { SupabaseClient } from '@supabase/supabase-js';
import { stableEvidenceHash } from '@/lib/recommendations/evidence-performance';
import {
  CONDITIONAL_90_CORE_ACCESSIBILITY_PATHS,
  CONDITIONAL_90_MANUAL_ACCESSIBILITY_CHECKS,
  CONDITIONAL_90_MANUAL_ACCESSIBILITY_SCHEMA_VERSION,
  CONDITIONAL_90_POLICY_VERSION,
} from './conditional-90';
import { buildAssuranceControlEvidenceRow } from './control-evidence';

type DecisionCode = 'ACCEPT' | 'REJECT' | 'WATCH' | 'NO_ACTION';

function requiredUuid(value: unknown, label: string) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error(`${label} must be a valid UUID.`);
  }
  return normalized;
}

function requiredHash(value: unknown, label: string) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`${label} must be a SHA-256 hash.`);
  return normalized;
}

function timestampNearNow(value: unknown, label: string) {
  if (value === null || value === undefined || value === '') return new Date().toISOString();
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO-8601 value.`);
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1_000) {
    throw new Error(`${label} must be recorded within five minutes of the server clock.`);
  }
  return new Date(timestamp).toISOString();
}

function finiteNumber(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number.`);
  return parsed;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function relationObject<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function databaseError(error: unknown, context: string) {
  if (!error) return null;
  const message = error instanceof Error
    ? error.message
    : String((error as { message?: unknown })?.message || error);
  return new Error(`${context}: ${message}`);
}

function actorSubjectHash(subject: string) {
  return stableEvidenceHash({ namespace: 'mtn-assurance-actor-v1', subject });
}

function boundedText(value: unknown, label: string, minimum: number, maximum: number) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum} characters.`);
  }
  return normalized;
}

function exactStringSet(value: unknown, expected: readonly string[]) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item) => typeof item === 'string')
    && new Set(value).size === expected.length
    && expected.every((item) => value.includes(item));
}

export async function recordManualAccessibilityReview(input: {
  client: SupabaseClient;
  reviewerSubject: string;
  releaseSha: unknown;
  artifactHash: unknown;
  assistiveTechnology: unknown;
  routesReviewed: unknown;
  checks: unknown;
  reviewerAttestation: unknown;
  notes: unknown;
  observedAt?: unknown;
}) {
  if (!/^assurance-reviewer:[A-Za-z0-9._:@-]{3,200}$/.test(input.reviewerSubject)) {
    throw new Error('An independently authenticated assurance reviewer subject is required.');
  }
  const releaseSha = typeof input.releaseSha === 'string' ? input.releaseSha.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{40}$/.test(releaseSha)) throw new Error('releaseSha must be a 40-character Git commit SHA.');
  const artifactHash = requiredHash(input.artifactHash, 'artifactHash');
  const assistiveTechnologyInput = input.assistiveTechnology
    && typeof input.assistiveTechnology === 'object'
    && !Array.isArray(input.assistiveTechnology)
    ? input.assistiveTechnology as Record<string, unknown>
    : {};
  const assistiveTechnology = {
    name: boundedText(assistiveTechnologyInput.name, 'assistiveTechnology.name', 2, 80),
    version: boundedText(assistiveTechnologyInput.version, 'assistiveTechnology.version', 1, 40),
    platform: boundedText(assistiveTechnologyInput.platform, 'assistiveTechnology.platform', 2, 80),
  };
  if (!exactStringSet(input.routesReviewed, CONDITIONAL_90_CORE_ACCESSIBILITY_PATHS)) {
    throw new Error(`routesReviewed must be the exact core route set: ${CONDITIONAL_90_CORE_ACCESSIBILITY_PATHS.join(', ')}.`);
  }
  const routesReviewed = [...CONDITIONAL_90_CORE_ACCESSIBILITY_PATHS];
  const checksInput = input.checks && typeof input.checks === 'object' && !Array.isArray(input.checks)
    ? input.checks as Record<string, unknown>
    : {};
  const checks = Object.fromEntries(
    CONDITIONAL_90_MANUAL_ACCESSIBILITY_CHECKS.map((key) => [key, checksInput[key] === true]),
  ) as Record<(typeof CONDITIONAL_90_MANUAL_ACCESSIBILITY_CHECKS)[number], boolean>;
  const reviewerAttestation = boundedText(input.reviewerAttestation, 'reviewerAttestation', 40, 4_000);
  const notes = boundedText(input.notes, 'notes', 20, 4_000);
  const observedAt = timestampNearNow(input.observedAt, 'observedAt');
  const reviewerSubjectHash = actorSubjectHash(input.reviewerSubject);
  const status = CONDITIONAL_90_MANUAL_ACCESSIBILITY_CHECKS.every((key) => checks[key]) ? 'PASS' : 'FAIL';
  const payload = {
    schema_version: CONDITIONAL_90_MANUAL_ACCESSIBILITY_SCHEMA_VERSION,
    policy_version: CONDITIONAL_90_POLICY_VERSION,
    result: status,
    artifact_kind: 'ACCESSIBILITY_REVIEW_REPORT',
    artifact_hash: artifactHash,
    reviewer_subject_hash: reviewerSubjectHash,
    reviewer_authentication: 'INDEPENDENT_ASSURANCE_CREDENTIAL',
    assistive_technology: assistiveTechnology,
    routes_reviewed: routesReviewed,
    checks,
    reviewer_attestation: reviewerAttestation,
    notes,
  };
  const row = buildAssuranceControlEvidenceRow({
    controlKey: 'ACCESSIBILITY_MANUAL',
    status,
    sourceKind: 'MANUAL_REVIEW',
    sourceRecordId: artifactHash,
    observedAt,
    validForSeconds: 90 * 24 * 60 * 60,
    payload,
    releaseSha,
  });
  const { data, error } = await input.client
    .from('assurance_control_evidence')
    .insert(row)
    .select('id, evidence_hash, control_key, status, release_sha, observed_at, valid_until')
    .single();
  if (error) throw databaseError(error, 'manual accessibility evidence append');
  return data;
}

const BROKER_REVIEW_CHECKS = [
  'artifactHashVerified',
  'accountOwnershipMatched',
  'tickerMatched',
  'entryExitMatched',
  'costsReconciled',
  'riskReviewed',
] as const;

export async function recordBrokerEvidenceReview(input: {
  client: SupabaseClient;
  reviewerSubject: string;
  pilotLinkId: unknown;
  sourceKind: unknown;
  artifactHash: unknown;
  checklist: unknown;
  attestation: unknown;
  reviewedAt?: unknown;
}) {
  const pilotLinkId = requiredUuid(input.pilotLinkId, 'pilotLinkId');
  const sourceKind = String(input.sourceKind || '').toUpperCase();
  if (!['BROKER_API', 'BROKER_STATEMENT'].includes(sourceKind)) {
    throw new Error('sourceKind must be BROKER_API or BROKER_STATEMENT.');
  }
  const artifactHash = requiredHash(input.artifactHash, 'artifactHash');
  const checklistInput = input.checklist && typeof input.checklist === 'object' && !Array.isArray(input.checklist)
    ? input.checklist as Record<string, unknown>
    : {};
  const checklist = Object.fromEntries(
    BROKER_REVIEW_CHECKS.map((key) => [key, checklistInput[key] === true]),
  ) as Record<(typeof BROKER_REVIEW_CHECKS)[number], boolean>;
  const attestation = typeof input.attestation === 'string' ? input.attestation.trim() : '';
  if (attestation.length < 20 || attestation.length > 4_000) {
    throw new Error('attestation must be between 20 and 4000 characters.');
  }
  const reviewedAt = timestampNearNow(input.reviewedAt, 'reviewedAt');
  const { data: link, error: linkError } = await input.client
    .from('recommendation_pilot_links')
    .select('id, pick_id, trade_id')
    .eq('id', pilotLinkId)
    .maybeSingle();
  if (linkError) throw databaseError(linkError, 'broker evidence pilot link');
  if (!link) throw new Error('Pilot link was not found.');
  const reviewerSubjectHash = actorSubjectHash(input.reviewerSubject);
  const row = {
    pilot_link_id: pilotLinkId,
    pick_id: link.pick_id,
    trade_id: link.trade_id,
    source_kind: sourceKind,
    artifact_hash: artifactHash,
    reviewer_subject_hash: reviewerSubjectHash,
    attestation_status: BROKER_REVIEW_CHECKS.every((key) => checklist[key]) ? 'PASS' : 'REJECTED',
    attestation,
    checklist,
    checklist_hash: stableEvidenceHash(checklist),
    reviewed_at: reviewedAt,
  };
  const insert = { ...row, review_hash: stableEvidenceHash(row) };
  const { data, error } = await input.client
    .from('recommendation_broker_evidence_reviews')
    .insert(insert)
    .select('id, review_hash, pilot_link_id, source_kind, artifact_hash, attestation_status, reviewed_at')
    .single();
  if (error) throw databaseError(error, 'broker evidence review append');
  return data;
}

export async function recordRecommendationDecision(input: {
  client: SupabaseClient;
  actorSubject: string;
  pickId: unknown;
  decisionCode: unknown;
  reasonCodes: unknown;
  rationale: unknown;
  decidedAt?: unknown;
  supersedesId?: unknown;
}) {
  const pickId = requiredUuid(input.pickId, 'pickId');
  const decisionCode = String(input.decisionCode || '').toUpperCase() as DecisionCode;
  if (!['ACCEPT', 'REJECT', 'WATCH', 'NO_ACTION'].includes(decisionCode)) {
    throw new Error('decisionCode must be ACCEPT, REJECT, WATCH, or NO_ACTION.');
  }
  const reasonCodes = Array.isArray(input.reasonCodes)
    ? [...new Set(input.reasonCodes.map((value) => String(value).trim().toUpperCase()).filter(Boolean))].slice(0, 12)
    : [];
  if (reasonCodes.length === 0) throw new Error('At least one reasonCode is required.');
  const rationale = typeof input.rationale === 'string' ? input.rationale.trim() : '';
  if (rationale.length < 10 || rationale.length > 4_000) {
    throw new Error('rationale must be between 10 and 4000 characters.');
  }
  const decidedAt = timestampNearNow(input.decidedAt, 'decidedAt');
  const { data, error } = await input.client
    .from('recommendation_picks')
    .select('id, ticker, candidate_snapshot, recommendation_publications!inner(id, engine_version, prompt_version, generated_at)')
    .eq('id', pickId)
    .maybeSingle();
  if (error) throw databaseError(error, 'recommendation decision basis');
  if (!data) throw new Error('Recommendation pick was not found.');
  const publication = relationObject((data as Record<string, unknown>).recommendation_publications as Record<string, unknown> | Record<string, unknown>[] | null);
  if (!publication) throw new Error('Recommendation publication was not found.');
  const candidateSnapshot = (data as Record<string, unknown>).candidate_snapshot;
  const actorHash = actorSubjectHash(input.actorSubject);
  const { data: latestDecision, error: latestDecisionError } = await input.client
    .from('recommendation_decision_events')
    .select('id')
    .eq('pick_id', pickId)
    .eq('actor_subject_hash', actorHash)
    .order('decided_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestDecisionError) throw databaseError(latestDecisionError, 'latest recommendation decision');
  const snapshot = {
    pickId,
    ticker: (data as Record<string, unknown>).ticker,
    publicationId: publication.id,
    engineVersion: publication.engine_version,
    promptVersion: publication.prompt_version || null,
    generatedAt: publication.generated_at,
    candidateSnapshot,
    decisionCode,
    decidedAt,
    reasonCodes,
    rationale,
  };
  const row = {
    pick_id: pickId,
    actor_subject_hash: actorHash,
    decision_code: decisionCode,
    decided_at: decidedAt,
    engine_version: String(publication.engine_version || ''),
    prompt_version: publication.prompt_version ? String(publication.prompt_version) : null,
    candidate_snapshot_hash: stableEvidenceHash(candidateSnapshot),
    policy_version: CONDITIONAL_90_POLICY_VERSION,
    reason_codes: reasonCodes,
    rationale,
    snapshot,
    snapshot_hash: stableEvidenceHash(snapshot),
    supersedes_id: input.supersedesId
      ? requiredUuid(input.supersedesId, 'supersedesId')
      : latestDecision?.id || null,
  };
  const insert = { ...row, decision_hash: stableEvidenceHash(row) };
  const { data: inserted, error: insertError } = await input.client
    .from('recommendation_decision_events')
    .insert(insert)
    .select('id, decision_hash, pick_id, decision_code, decided_at')
    .single();
  if (insertError) throw databaseError(insertError, 'recommendation decision append');
  return inserted;
}

export async function linkRecommendationPilot(input: {
  client: SupabaseClient;
  actorSubject: string;
  decisionId: unknown;
  tradeId: unknown;
  authorizedRiskR: unknown;
  linkedAt?: unknown;
}) {
  const decisionId = requiredUuid(input.decisionId, 'decisionId');
  const tradeId = requiredUuid(input.tradeId, 'tradeId');
  const authorizedRiskR = finiteNumber(input.authorizedRiskR, 'authorizedRiskR');
  if (authorizedRiskR <= 0 || authorizedRiskR > 0.5) throw new Error('authorizedRiskR must be greater than 0 and at most 0.5.');
  const actorHash = actorSubjectHash(input.actorSubject);
  const [
    { data: decision, error: decisionError },
    { data: trade, error: tradeError },
    { data: scoreSnapshot, error: scoreError },
  ] = await Promise.all([
    input.client
      .from('recommendation_decision_events')
      .select('id, pick_id, actor_subject_hash, decision_code')
      .eq('id', decisionId)
      .maybeSingle(),
    input.client
      .from('trades')
      .select('id, version, status, planned_risk, risk_percent, risk_gate, risk_policy_snapshot')
      .eq('id', tradeId)
      .maybeSingle(),
    input.client
      .from('assurance_score_snapshots')
      .select('awarded_score, status, evaluated_at')
      .order('evaluated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (decisionError) throw databaseError(decisionError, 'pilot decision');
  if (tradeError) throw databaseError(tradeError, 'pilot trade');
  if (scoreError) throw databaseError(scoreError, 'pilot assurance milestone');
  if (!decision || !trade) throw new Error('Pilot decision or trade was not found.');
  const scoreEvaluatedAt = scoreSnapshot ? Date.parse(String(scoreSnapshot.evaluated_at)) : Number.NaN;
  const scoreAgeMs = Date.now() - scoreEvaluatedAt;
  if (!scoreSnapshot
    || Number(scoreSnapshot.awarded_score) < 85
    || !['SMALL_PILOT_REVIEW', 'ELIGIBLE_FOR_HUMAN_REVIEW'].includes(String(scoreSnapshot.status))
    || !Number.isFinite(scoreEvaluatedAt)
    || scoreAgeMs < -5 * 60 * 1_000
    || scoreAgeMs > 24 * 60 * 60 * 1_000) {
    throw new Error('Pilot links require a fresh, verified 85-point assurance snapshot.');
  }
  if (decision.actor_subject_hash !== actorHash || decision.decision_code !== 'ACCEPT') {
    throw new Error('Pilot link requires the current actor\'s ACCEPT decision.');
  }
  const plannedRisk = numberOrNull(trade.planned_risk);
  const riskPercent = numberOrNull(trade.risk_percent);
  if (plannedRisk === null || plannedRisk <= 0 || riskPercent === null || riskPercent <= 0) {
    throw new Error('Pilot trade requires positive server-verified planned risk and account risk percent.');
  }
  if (riskPercent > authorizedRiskR / 100 + 0.000000001) {
    throw new Error('Pilot trade account risk exceeds the authorized R limit (1R = account equity 1%).');
  }
  const linkedAt = timestampNearNow(input.linkedAt, 'linkedAt');
  const riskPolicySnapshot = {
    riskUnit: {
      basis: 'ACCOUNT_EQUITY',
      oneRPercent: 1,
    },
    plannedRisk: trade.planned_risk,
    riskPercent: trade.risk_percent,
    riskGate: trade.risk_gate,
    riskPolicy: trade.risk_policy_snapshot,
    authorizedRiskR,
  };
  const row = {
    decision_id: decisionId,
    pick_id: decision.pick_id,
    trade_id: tradeId,
    actor_subject_hash: actorHash,
    authorized_risk_r: authorizedRiskR,
    trade_version_at_link: Number(trade.version || 0),
    risk_policy_snapshot: riskPolicySnapshot,
    risk_policy_hash: stableEvidenceHash(riskPolicySnapshot),
    linked_at: linkedAt,
  };
  const insert = { ...row, link_hash: stableEvidenceHash(row) };
  const { data: inserted, error: insertError } = await input.client
    .from('recommendation_pilot_links')
    .insert(insert)
    .select('id, link_hash, decision_id, pick_id, trade_id, authorized_risk_r, linked_at')
    .single();
  if (insertError) throw databaseError(insertError, 'recommendation pilot link append');
  return inserted;
}

export async function recordRecommendationPilotOutcome(input: {
  client: SupabaseClient;
  actorSubject: string;
  pilotLinkId: unknown;
  sourceKind: unknown;
  brokerEvidenceReviewId?: unknown;
  commissionAmount: unknown;
  taxAmount: unknown;
  fxCostAmount: unknown;
  otherCostAmount: unknown;
  observedAt?: unknown;
  supersedesId?: unknown;
}) {
  const pilotLinkId = requiredUuid(input.pilotLinkId, 'pilotLinkId');
  const sourceKind = String(input.sourceKind || '').toUpperCase();
  if (!['BROKER_API', 'BROKER_STATEMENT', 'MANUAL_JOURNAL'].includes(sourceKind)) {
    throw new Error('sourceKind must be BROKER_API, BROKER_STATEMENT, or MANUAL_JOURNAL.');
  }
  const brokerEvidenceReviewId = sourceKind === 'MANUAL_JOURNAL'
    ? null
    : requiredUuid(input.brokerEvidenceReviewId, 'brokerEvidenceReviewId');
  const commissionAmount = finiteNumber(input.commissionAmount, 'commissionAmount');
  const taxAmount = finiteNumber(input.taxAmount, 'taxAmount');
  const fxCostAmount = finiteNumber(input.fxCostAmount, 'fxCostAmount');
  const otherCostAmount = finiteNumber(input.otherCostAmount, 'otherCostAmount');
  if ([commissionAmount, taxAmount, fxCostAmount, otherCostAmount].some((value) => value < 0)) {
    throw new Error('Pilot outcome costs cannot be negative.');
  }
  const [linkResult, brokerReviewResult] = await Promise.all([
    input.client
      .from('recommendation_pilot_links')
      .select('id, trade_id, pick_id, actor_subject_hash')
      .eq('id', pilotLinkId)
      .maybeSingle(),
    brokerEvidenceReviewId
      ? input.client
          .from('recommendation_broker_evidence_reviews')
          .select('id, pilot_link_id, pick_id, trade_id, source_kind, artifact_hash, attestation_status')
          .eq('id', brokerEvidenceReviewId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { data: link, error: linkError } = linkResult;
  if (linkError) throw databaseError(linkError, 'pilot outcome link');
  if (brokerReviewResult.error) throw databaseError(brokerReviewResult.error, 'pilot broker evidence review');
  if (!link) throw new Error('Pilot link was not found.');
  if (link.actor_subject_hash !== actorSubjectHash(input.actorSubject)) throw new Error('Pilot link belongs to another actor.');
  const brokerReview = brokerReviewResult.data;
  if (brokerEvidenceReviewId && (!brokerReview
    || brokerReview.pilot_link_id !== pilotLinkId
    || brokerReview.pick_id !== link.pick_id
    || brokerReview.trade_id !== link.trade_id
    || brokerReview.source_kind !== sourceKind
    || brokerReview.attestation_status !== 'PASS')) {
    throw new Error('Verified pilot outcomes require a matching independent PASS broker evidence review.');
  }
  const brokerEvidenceHash = brokerReview ? String(brokerReview.artifact_hash) : null;

  const [tradeResult, performanceResult, executionsResult, modelResult] = await Promise.all([
    input.client.from('trades').select('id, status, direction').eq('id', link.trade_id).maybeSingle(),
    input.client.from('trade_performance_records').select('id, trade_id, fees, r_multiple, return_pct, pyramid_compliant, stop_raise_compliant, performance_snapshot').eq('trade_id', link.trade_id).maybeSingle(),
    input.client.from('trade_executions').select('id, side, executed_at, price, shares, fees, leg_label').eq('trade_id', link.trade_id).order('executed_at', { ascending: true }),
    input.client.from('recommendation_performance').select('entry_price').eq('pick_id', link.pick_id).eq('horizon', 'D5').maybeSingle(),
  ]);
  for (const [result, context] of [
    [tradeResult, 'pilot trade'],
    [performanceResult, 'pilot performance'],
    [executionsResult, 'pilot executions'],
    [modelResult, 'pilot model entry'],
  ] as const) {
    if (result.error) throw databaseError(result.error, context);
  }
  const trade = tradeResult.data;
  const performance = performanceResult.data;
  const executions = executionsResult.data || [];
  const model = modelResult.data;
  if (!trade || !performance || !model || trade.status !== 'COMPLETED') {
    throw new Error('Verified pilot outcome requires a completed trade, performance record, and D5 model entry.');
  }
  const entries = executions.filter((execution) => execution.side === 'ENTRY');
  const exits = executions.filter((execution) => execution.side === 'EXIT');
  const shares = entries.reduce((sum, execution) => sum + Number(execution.shares), 0);
  const actualEntryPrice = shares > 0
    ? entries.reduce((sum, execution) => sum + Number(execution.price) * Number(execution.shares), 0) / shares
    : null;
  const modeledEntryPrice = numberOrNull(model.entry_price);
  const rMultiple = numberOrNull(performance.r_multiple);
  const netReturnPct = numberOrNull(performance.return_pct);
  const performanceFees = numberOrNull(performance.fees);
  if (!entries.length || !exits.length || actualEntryPrice === null || modeledEntryPrice === null
    || rMultiple === null || netReturnPct === null || performanceFees === null) {
    throw new Error('Pilot account evidence is incomplete.');
  }
  const totalCostAmount = commissionAmount + taxAmount + fxCostAmount + otherCostAmount;
  if (Math.abs(totalCostAmount - performanceFees) > 0.000001) {
    throw new Error('Account cost breakdown must exactly reconcile to the trade performance fees.');
  }
  const adverseSlippagePct = ((actualEntryPrice - modeledEntryPrice) / modeledEntryPrice) * 100
    * (trade.direction === 'SHORT' ? -1 : 1);
  const riskBreach = performance.pyramid_compliant === false
    || performance.stop_raise_compliant === false
    || rMultiple <= -2;
  const executionSnapshot = {
    tradeId: link.trade_id,
    pickId: link.pick_id,
    performanceRecordId: performance.id,
    direction: trade.direction,
    executions,
    performanceSnapshot: performance.performance_snapshot,
  };
  const observedAt = timestampNearNow(input.observedAt, 'observedAt');
  const { data: latestOutcome, error: latestOutcomeError } = await input.client
    .from('recommendation_pilot_outcomes')
    .select('id')
    .eq('pilot_link_id', pilotLinkId)
    .order('observed_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestOutcomeError) throw databaseError(latestOutcomeError, 'latest pilot outcome');
  const row = {
    pilot_link_id: pilotLinkId,
    trade_id: link.trade_id,
    performance_record_id: performance.id,
    broker_evidence_review_id: brokerEvidenceReviewId,
    evidence_status: sourceKind === 'MANUAL_JOURNAL' ? 'INCOMPLETE' : 'VERIFIED',
    source_kind: sourceKind,
    broker_evidence_hash: brokerEvidenceHash,
    entry_at: entries[0].executed_at,
    exit_at: exits.at(-1)?.executed_at,
    modeled_entry_price: modeledEntryPrice,
    actual_entry_price: actualEntryPrice,
    adverse_slippage_pct: adverseSlippagePct,
    commission_amount: commissionAmount,
    tax_amount: taxAmount,
    fx_cost_amount: fxCostAmount,
    other_cost_amount: otherCostAmount,
    total_cost_amount: totalCostAmount,
    net_return_pct: netReturnPct,
    r_multiple: rMultiple,
    risk_breach: riskBreach,
    execution_snapshot: executionSnapshot,
    execution_snapshot_hash: stableEvidenceHash(executionSnapshot),
    supersedes_id: input.supersedesId
      ? requiredUuid(input.supersedesId, 'supersedesId')
      : latestOutcome?.id || null,
    observed_at: observedAt,
  };
  const insert = { ...row, outcome_hash: stableEvidenceHash(row) };
  const { data: inserted, error: insertError } = await input.client
    .from('recommendation_pilot_outcomes')
    .insert(insert)
    .select('id, outcome_hash, pilot_link_id, trade_id, evidence_status, observed_at')
    .single();
  if (insertError) throw databaseError(insertError, 'recommendation pilot outcome append');
  return inserted;
}
