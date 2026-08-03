import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CONDITIONAL_90_REQUIRED_CATEGORIES,
  evaluateConditional90Assurance,
  summarizePilotEvidence,
  type AssuranceControlSummaryInput,
  type Conditional90Scorecard,
  type LongitudinalEvidenceInput,
} from './conditional-90';
import { stableEvidenceHash } from '@/lib/recommendations/evidence-performance';

const PILOT_OUTCOME_SETTLEMENT_GRACE_DAYS = 95;
const DAY_MS = 86_400_000;

type PublicationRow = {
  run_date: string;
  category: string | null;
  engine_version: string;
  assurance_contract_hash: string | null;
};

type ControlRow = {
  evidence_hash: string;
  control_key: string;
  status: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  source_kind: string | null;
  source_record_id: string | null;
  release_sha: string | null;
  observed_at: string;
  valid_until: string;
  payload: Record<string, unknown> | null;
};

type BackupRow = {
  id: number | string;
  status: 'SUCCESS' | 'FAILED';
  completed_at: string;
  encrypted: boolean;
  checksum_sha256: string | null;
  metadata: Record<string, unknown> | null;
};

type PilotLinkRow = {
  id: string;
  trade_id: string;
  authorized_risk_r: number | string;
  linked_at: string;
  trades: { status: string } | Array<{ status: string }> | null;
};

type PilotOutcomeRow = {
  id: string;
  pilot_link_id: string;
  broker_evidence_review_id: string | null;
  evidence_status: 'VERIFIED' | 'INCOMPLETE' | 'REJECTED';
  source_kind: 'BROKER_API' | 'BROKER_STATEMENT' | 'MANUAL_JOURNAL';
  r_multiple: number | string | null;
  adverse_slippage_pct: number | string | null;
  risk_breach: boolean;
  exit_at: string | null;
  observed_at: string;
  created_at: string;
};

function getError(error: unknown, context: string) {
  if (!error) return null;
  const message = error instanceof Error
    ? error.message
    : String((error as { message?: unknown })?.message || error);
  return new Error(`${context}: ${message}`);
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function summarizeControlRows(rows: ControlRow[]): AssuranceControlSummaryInput[] {
  const byKey = new Map<string, ControlRow[]>();
  for (const row of rows) byKey.set(row.control_key, [...(byKey.get(row.control_key) || []), row]);
  return [...byKey.entries()].map(([controlKey, controlRows]) => {
    const ordered = [...controlRows].sort((left, right) => Date.parse(left.observed_at) - Date.parse(right.observed_at));
    const latest = ordered.at(-1) || null;
    let resetIndex = -1;
    for (let index = 0; index < ordered.length; index += 1) {
      if (ordered[index].status !== 'PASS') resetIndex = index;
    }
    const passingWindow = ordered.slice(resetIndex + 1).filter((row) => row.status === 'PASS');
    return {
      controlKey,
      latestStatus: latest?.status || 'MISSING',
      latestObservedAt: latest?.observed_at || null,
      latestValidUntil: latest?.valid_until || null,
      firstPassingObservedAt: passingWindow[0]?.observed_at || null,
      passingObservationDays: new Set(passingWindow.map((row) => row.observed_at.slice(0, 10))).size,
      failedObservationCount: ordered.slice(resetIndex + 1).filter((row) => row.status === 'FAIL').length,
      releaseSha: latest?.release_sha || null,
      sourceKind: latest?.source_kind || null,
      sourceRecordId: latest?.source_record_id || null,
      payload: latest?.payload || null,
    };
  });
}

export function backupControlRows(rows: BackupRow[]): ControlRow[] {
  return rows.map((row) => {
    const metadata = row.metadata || {};
    const observedTime = Date.parse(row.completed_at);
    if (!Number.isFinite(observedTime)) {
      throw new Error(`Backup run ${row.id} has an invalid completion timestamp.`);
    }
    const checksumValid = typeof row.checksum_sha256 === 'string'
      && /^[a-f0-9]{64}$/.test(row.checksum_sha256);
    const completeSuccess = row.status === 'SUCCESS'
      && checksumValid
      && row.encrypted === true
      && metadata.restore_drill === true
      && metadata.row_count_reconciliation === true;
    const status = row.status === 'FAILED'
      ? 'FAIL' as const
      : completeSuccess ? 'PASS' as const : 'INCONCLUSIVE' as const;
    return {
      evidence_hash: stableEvidenceHash({
        backupRunId: String(row.id),
        status: row.status,
        completedAt: row.completed_at,
        checksumSha256: row.checksum_sha256,
        encrypted: row.encrypted,
        metadata,
      }),
      control_key: 'BACKUP_RESTORE',
      status,
      source_kind: 'BACKUP_LEDGER',
      source_record_id: String(row.id),
      release_sha: typeof metadata.release_sha === 'string'
        && /^[a-f0-9]{40}$/.test(metadata.release_sha)
        ? metadata.release_sha
        : null,
      observed_at: row.completed_at,
      valid_until: new Date(observedTime + 48 * 60 * 60 * 1000).toISOString(),
      payload: {
        ...metadata,
        sourceRecordId: String(row.id),
        checksum_sha256: row.checksum_sha256,
        encrypted: row.encrypted,
        qualification_reasons: [
          ...(row.status === 'SUCCESS' ? [] : ['BACKUP_RUN_FAILED']),
          ...(checksumValid ? [] : ['CHECKSUM_INVALID']),
          ...(row.encrypted === true ? [] : ['BACKUP_NOT_ENCRYPTED']),
          ...(metadata.restore_drill === true ? [] : ['RESTORE_DRILL_MISSING']),
          ...(metadata.row_count_reconciliation === true ? [] : ['ROW_COUNT_RECONCILIATION_MISSING']),
        ],
      },
    };
  });
}

function exactLedgerCountError(
  result: { data: unknown[] | null; count: number | null },
  context: string,
) {
  const returnedCount = result.data?.length || 0;
  if (!Number.isSafeInteger(result.count) || result.count !== returnedCount) {
    return new Error(
      `${context}: exact count ${String(result.count)} does not match ${returnedCount} returned rows; refusing truncated evidence`,
    );
  }
  return null;
}

function pilotTradeStatus(row: PilotLinkRow) {
  if (Array.isArray(row.trades)) return row.trades[0]?.status || null;
  return row.trades?.status || null;
}

function currentReleaseSha(explicit?: string | null) {
  const candidate = explicit
    || process.env.MTN_RELEASE_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || null;
  return candidate && /^[a-f0-9]{40}$/.test(candidate) ? candidate : null;
}

export function assuranceSnapshotInsertRow(
  scorecard: Conditional90Scorecard,
  evidenceManifest: Record<string, unknown>,
) {
  const domains = Object.fromEntries(scorecard.domains.map((domain) => [domain.code, domain.verified]));
  const milestone73 = scorecard.milestones.find((milestone) => milestone.score === 73);
  const milestone85 = scorecard.milestones.find((milestone) => milestone.score === 85);
  const milestone90 = scorecard.milestones.find((milestone) => milestone.score === 90);
  const longitudinalGatePassed = milestone85?.requirements
    .find((requirement) => requirement.code === 'LONGITUDINAL_12M')?.status === 'PASS';
  const operationalGatePassed = milestone85?.status === 'PASS';
  const pilotGatePassed = milestone90?.requirements
    .find((requirement) => requirement.code === 'LIVE_PILOT')?.status === 'PASS';
  const accessibilityGatePassed = milestone90?.requirements
    .filter((requirement) => requirement.code.startsWith('ACCESSIBILITY_'))
    .every((requirement) => requirement.status === 'PASS') === true;
  const duration24mGatePassed = milestone90?.requirements
    .find((requirement) => requirement.code === 'SHADOW_DURATION_24M')?.status === 'PASS';
  const longitudinal24mGatePassed = milestone90?.requirements
    .find((requirement) => requirement.code === 'LONGITUDINAL_24M')?.status === 'PASS';
  const recoveryGatePassed = milestone90?.requirements
    .find((requirement) => requirement.code === 'RECOVERY_DRILLS')?.status === 'PASS';
  const operations90dGatePassed = milestone90?.requirements
    .find((requirement) => requirement.code === 'OPERATIONS_90D')?.status === 'PASS';
  const evidenceManifestHash = stableEvidenceHash(evidenceManifest);
  const row = {
    policy_version: scorecard.policyVersion,
    evaluator_version: scorecard.schemaVersion,
    release_sha: scorecard.evidence.currentReleaseSha,
    investment_score: domains.investment,
    data_score: domains.data,
    strategy_score: domains.strategy,
    risk_score: domains.risk,
    software_score: domains.software,
    operations_score: domains.operations,
    security_score: domains.security,
    system_ui_score: domains.system_ui,
    technical_gate_passed: milestone73?.status === 'PASS',
    longitudinal_gate_passed: longitudinalGatePassed,
    pilot_gate_passed: pilotGatePassed,
    operational_gate_passed: operationalGatePassed,
    accessibility_gate_passed: accessibilityGatePassed,
    duration_24m_gate_passed: duration24mGatePassed,
    longitudinal_24m_gate_passed: longitudinal24mGatePassed,
    recovery_gate_passed: recoveryGatePassed,
    operations_90d_gate_passed: operations90dGatePassed,
    status: scorecard.disposition,
    blockers: scorecard.blockers,
    next_actions: scorecard.priorityActions,
    evidence_manifest: evidenceManifest,
    evidence_manifest_hash: evidenceManifestHash,
    capital_authorized: false,
    evaluated_at: scorecard.evaluatedAt,
  };
  const evaluatedTimestamp = Date.parse(scorecard.evaluatedAt);
  const evaluationDay = Number.isFinite(evaluatedTimestamp)
    ? new Date(evaluatedTimestamp).toISOString().slice(0, 10)
    : scorecard.evaluatedAt.slice(0, 10);
  const snapshotIdentity = {
    evaluationDay,
    policyVersion: scorecard.policyVersion,
    evaluatorVersion: scorecard.schemaVersion,
    releaseSha: scorecard.evidence.currentReleaseSha,
    verifiedScore: scorecard.score.verifiedScore,
    status: scorecard.disposition,
    domains,
    gates: {
      technical: row.technical_gate_passed,
      longitudinal: longitudinalGatePassed,
      pilot: pilotGatePassed,
      operational: operationalGatePassed,
      accessibility: accessibilityGatePassed,
      duration24m: duration24mGatePassed,
      longitudinal24m: longitudinal24mGatePassed,
      recovery: recoveryGatePassed,
      operations90d: operations90dGatePassed,
    },
    evidenceManifestHash,
  };
  return { ...row, snapshot_hash: stableEvidenceHash(snapshotIdentity) };
}

export async function readConditional90Assurance(input: {
  client: SupabaseClient;
  now?: string;
  releaseSha?: string | null;
  persistSnapshot?: boolean;
}) {
  const now = input.now || new Date().toISOString();
  const latestPublicationResults = await Promise.all(CONDITIONAL_90_REQUIRED_CATEGORIES.map((category) => (
    input.client
      .from('recommendation_publications')
      .select('run_date, category, engine_version, assurance_contract_hash')
      .eq('is_official', true)
      .eq('status', 'PUBLISHED')
      .eq('category', category)
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle()
  )));
  const [longitudinal, controls, backups, pilotLinks, pilotOutcomes] = await Promise.all([
    input.client
      .from('recommendation_longitudinal_evaluations')
      .select('evaluation_hash, category, engine_version, assurance_contract_hash, horizon, window_months, window_start, window_end, gate_status, evidence_status, sample_size, cohort_count, covered_month_count, market_regime_count, regime_cohort_counts, excess_ci95_lower, lower_decile_net_excess_return_pct, tail_breach_rate, statistics_version, policy_version, evaluated_at, gate_reasons')
      .order('evaluated_at', { ascending: false })
      .limit(1_000),
    input.client
      .from('assurance_control_evidence')
      .select('evidence_hash, control_key, status, source_kind, source_record_id, release_sha, observed_at, valid_until, payload')
      .eq('environment', 'PRODUCTION')
      .order('observed_at', { ascending: false })
      .limit(1_000),
    input.client
      .from('operations_backup_runs')
      .select('id, status, completed_at, encrypted, checksum_sha256, metadata')
      .order('completed_at', { ascending: false })
      .limit(100),
    input.client
      .from('recommendation_pilot_links')
      .select('id, trade_id, authorized_risk_r, linked_at, trades!inner(status)', { count: 'exact' })
      .order('linked_at', { ascending: true })
      .limit(1_000),
    input.client
      .from('recommendation_pilot_outcomes')
      .select('id, pilot_link_id, broker_evidence_review_id, evidence_status, source_kind, r_multiple, adverse_slippage_pct, risk_breach, exit_at, observed_at, created_at', { count: 'exact' })
      .order('observed_at', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1_000),
  ]);

  const dependencyErrors = [
    ...latestPublicationResults.map((result, index) => getError(
      result.error,
      `${CONDITIONAL_90_REQUIRED_CATEGORIES[index]} current recommendation engine`,
    )),
    getError(longitudinal.error, 'longitudinal recommendation evidence'),
    getError(controls.error, 'assurance controls'),
    getError(backups.error, 'backup/restore evidence'),
    getError(pilotLinks.error, 'recommendation pilot links'),
    getError(pilotOutcomes.error, 'recommendation pilot outcomes'),
    exactLedgerCountError(pilotLinks, 'recommendation pilot links'),
    exactLedgerCountError(pilotOutcomes, 'recommendation pilot outcomes'),
  ].filter((error): error is Error => error !== null);
  if (dependencyErrors.length > 0) throw new Error(dependencyErrors.map((error) => error.message).join(' | '));

  const latestRows = latestPublicationResults
    .map((result) => result.data as PublicationRow | null)
    .filter((row): row is PublicationRow => row !== null);
  const currentEngines: Record<string, string | null> = Object.fromEntries(
    CONDITIONAL_90_REQUIRED_CATEGORIES.map((category) => [category, null]),
  );
  for (const row of latestRows) {
    if (row.category && row.category in currentEngines && !currentEngines[row.category]) {
      currentEngines[row.category] = row.engine_version;
    }
  }
  const firstCurrentPublicationResults = await Promise.all(CONDITIONAL_90_REQUIRED_CATEGORIES.map((category) => {
    const latest = latestRows.find((row) => row.category === category) || null;
    const assuranceContractHash = latest?.assurance_contract_hash || null;
    if (!assuranceContractHash) return Promise.resolve({ data: null, error: null });
    return input.client
      .from('recommendation_publications')
      .select('run_date, category, engine_version, assurance_contract_hash')
      .eq('is_official', true)
      .eq('status', 'PUBLISHED')
      .eq('category', category)
      .eq('assurance_contract_hash', assuranceContractHash)
      .order('run_date', { ascending: true })
      .limit(1)
      .maybeSingle();
  }));
  const publicationWindowErrors = firstCurrentPublicationResults
    .map((result, index) => getError(
      result.error,
      `${CONDITIONAL_90_REQUIRED_CATEGORIES[index]} current-contract first publication`,
    ))
    .filter((error): error is Error => error !== null);
  if (publicationWindowErrors.length > 0) {
    throw new Error(publicationWindowErrors.map((error) => error.message).join(' | '));
  }
  const currentEnginePublicationWindows = Object.fromEntries(
    CONDITIONAL_90_REQUIRED_CATEGORIES.map((category, index) => {
      const first = firstCurrentPublicationResults[index].data as PublicationRow | null;
      const latest = latestRows.find((row) => row.category === category) || null;
      return [category, {
        engineVersion: currentEngines[category],
        assuranceContractHash: latest?.assurance_contract_hash || null,
        firstPublicationAt: first?.run_date || null,
        latestPublicationAt: latest?.run_date || null,
      }];
    }),
  );
  const longitudinalRows = (longitudinal.data || []) as Array<Record<string, unknown>>;
  const mappedLongitudinal: LongitudinalEvidenceInput[] = longitudinalRows.map((row) => ({
    category: String(row.category || ''),
    engineVersion: String(row.engine_version || ''),
    assuranceContractHash: String(row.assurance_contract_hash || ''),
    horizon: String(row.horizon || ''),
    windowMonths: Number(row.window_months || 0),
    gateStatus: row.gate_status === 'PASS' ? 'PASS' : 'BLOCKED',
    evidenceStatus: row.evidence_status === 'READY'
      ? 'READY'
      : row.evidence_status === 'INSUFFICIENT' ? 'INSUFFICIENT' : 'INCOMPLETE',
    sampleSize: Number(row.sample_size || 0),
    cohortCount: Number(row.cohort_count || 0),
    coveredMonthCount: Number(row.covered_month_count || 0),
    marketRegimeCount: Number(row.market_regime_count || 0),
    regimeCohortCounts: row.regime_cohort_counts
      && typeof row.regime_cohort_counts === 'object'
      && !Array.isArray(row.regime_cohort_counts)
      ? Object.fromEntries(Object.entries(row.regime_cohort_counts).map(([key, value]) => [key, Number(value)]))
      : {},
    excessCi95Lower: numberOrNull(row.excess_ci95_lower),
    lowerDecileNetExcessReturnPct: numberOrNull(row.lower_decile_net_excess_return_pct),
    tailBreachRate: numberOrNull(row.tail_breach_rate),
    windowStart: String(row.window_start || ''),
    windowEnd: String(row.window_end || ''),
    statisticsVersion: String(row.statistics_version || ''),
    policyVersion: String(row.policy_version || ''),
    evaluatedAt: String(row.evaluated_at || ''),
    reasons: Array.isArray(row.gate_reasons) ? row.gate_reasons.map(String) : [],
  }));

  const explicitControlRows = (controls.data || []) as ControlRow[];
  const derivedBackupRows = backupControlRows((backups.data || []) as BackupRow[]);
  const controlSummaries = summarizeControlRows([...explicitControlRows, ...derivedBackupRows]);
  const allLinks = (pilotLinks.data || []) as unknown as PilotLinkRow[];
  const nowTime = Date.parse(now);
  const isOverdueLink = (link: PilotLinkRow) => {
    const linkedTime = Date.parse(link.linked_at);
    return !Number.isFinite(nowTime)
      || !Number.isFinite(linkedTime)
      || nowTime - linkedTime >= PILOT_OUTCOME_SETTLEMENT_GRACE_DAYS * DAY_MS;
  };
  const links = allLinks.filter((link) => (
    pilotTradeStatus(link) === 'COMPLETED' || isOverdueLink(link)
  ));
  const outcomes = (pilotOutcomes.data || []) as PilotOutcomeRow[];
  const latestOutcomeByLink = new Map<string, PilotOutcomeRow>();
  for (const outcome of outcomes) {
    if (!latestOutcomeByLink.has(outcome.pilot_link_id)) latestOutcomeByLink.set(outcome.pilot_link_id, outcome);
  }
  const pilotRows = links.map((link) => {
    const outcome = latestOutcomeByLink.get(link.id);
    const authorizedRiskR = numberOrNull(link.authorized_risk_r);
    const rMultiple = numberOrNull(outcome?.r_multiple);
    const adverseSlippagePct = numberOrNull(outcome?.adverse_slippage_pct);
    const exitAt = outcome?.exit_at || null;
    const verifiedAccountActual = Boolean(outcome)
      && outcome?.evidence_status === 'VERIFIED'
      && (outcome.source_kind === 'BROKER_API' || outcome.source_kind === 'BROKER_STATEMENT')
      && Boolean(outcome.broker_evidence_review_id)
      && rMultiple !== null
      && adverseSlippagePct !== null
      && Number.isFinite(Date.parse(exitAt || ''));
    return {
      authorizedRiskR,
      rMultiple,
      adverseSlippagePct,
      riskBreach: outcome?.risk_breach === true,
      linkedAt: link.linked_at,
      exitAt,
      verifiedAccountActual,
      overdueUnresolved: isOverdueLink(link) && !verifiedAccountActual,
    };
  });
  const pilot = summarizePilotEvidence(pilotRows);
  const currentPublicationFirstDates = Object.values(currentEnginePublicationWindows)
    .map((window) => window.firstPublicationAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  const currentPublicationLatestDates = Object.values(currentEnginePublicationWindows)
    .map((window) => window.latestPublicationAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  const firstOfficialPublicationAt = currentPublicationFirstDates[0] || null;
  const latestOfficialPublicationAt = currentPublicationLatestDates[0] || null;
  const releaseSha = currentReleaseSha(input.releaseSha);
  const scorecard = evaluateConditional90Assurance({
    now,
    currentReleaseSha: releaseSha,
    firstOfficialPublicationAt,
    latestOfficialPublicationAt,
    currentEngines,
    currentEnginePublicationWindows,
    longitudinalEvidence: mappedLongitudinal,
    controls: controlSummaries,
    pilot,
  });

  const evidenceManifest = {
    policyVersion: scorecard.policyVersion,
    releaseSha,
    firstPublication: firstOfficialPublicationAt,
    latestPublication: latestOfficialPublicationAt,
    currentEnginePublicationWindows,
    longitudinalEvaluationHashes: longitudinalRows.map((row) => row.evaluation_hash).filter(Boolean),
    controlEvidenceHashes: explicitControlRows.map((row) => row.evidence_hash),
    backupRunIds: ((backups.data || []) as BackupRow[]).map((row) => String(row.id)),
    pilotLinkIds: allLinks.map((row) => row.id),
    scoredPilotLinkIds: links.map((row) => row.id),
    overdueUnresolvedPilotLinkIds: links
      .filter((_, index) => pilotRows[index]?.overdueUnresolved === true)
      .map((link) => link.id),
    pilotOutcomeIds: outcomes.map((row) => row.id),
    brokerEvidenceReviewIds: outcomes.map((row) => row.broker_evidence_review_id).filter(Boolean),
  };
  if (input.persistSnapshot !== false) {
    const snapshot = assuranceSnapshotInsertRow(scorecard, evidenceManifest);
    const { error } = await input.client
      .from('assurance_score_snapshots')
      .upsert(snapshot, { onConflict: 'snapshot_hash', ignoreDuplicates: true });
    if (error) throw getError(error, 'assurance score snapshot');
  }
  return scorecard;
}
