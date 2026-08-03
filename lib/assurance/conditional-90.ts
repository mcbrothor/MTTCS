import { RECOMMENDATION_EVIDENCE_STATISTICS_VERSION } from '@/lib/recommendations/evidence-performance';
import { LONGITUDINAL_ASSURANCE_POLICY_VERSION } from './longitudinal-evidence';

export const CONDITIONAL_90_SCHEMA_VERSION = 'mtn-conditional-90-scorecard-v1' as const;
export const CONDITIONAL_90_POLICY_VERSION = 'mtn-conditional-90-policy-2026.08-v1' as const;
export const CONDITIONAL_90_IMPLEMENTATION_BASELINE_AS_OF = '2026-08-03T00:00:00.000Z' as const;
export const CONDITIONAL_90_MANUAL_ACCESSIBILITY_SCHEMA_VERSION = 'mtn-a11y-manual-review-v1' as const;

export const CONDITIONAL_90_CORE_ACCESSIBILITY_PATHS = [
  '/',
  '/portfolio',
  '/recommendations?view=metrics',
  '/scanner',
] as const;

export const CONDITIONAL_90_MANUAL_ACCESSIBILITY_CHECKS = [
  'screenReader',
  'keyboardOnly',
  'focusOrder',
  'colorIndependence',
  'zoom200',
  'mobile360',
] as const;

export const CONDITIONAL_90_REQUIRED_CATEGORIES = [
  'NASDAQ100',
  'SP500',
  'KOSPI200',
  'KOSDAQ150',
] as const;

export const CONDITIONAL_90_REQUIRED_HORIZONS = ['D5', 'D20', 'D60'] as const;

export type AssuranceRequirementStatus = 'PASS' | 'BLOCKED' | 'WAITING';
export type AssuranceDisposition =
  | 'RESEARCH_ONLY'
  | 'SMALL_PILOT_REVIEW'
  | 'ELIGIBLE_FOR_HUMAN_REVIEW';

export interface LongitudinalEvidenceInput {
  category: string;
  engineVersion: string;
  assuranceContractHash: string;
  horizon: string;
  windowMonths: number;
  gateStatus: 'PASS' | 'BLOCKED';
  evidenceStatus: 'READY' | 'INSUFFICIENT' | 'INCOMPLETE';
  sampleSize: number;
  cohortCount: number;
  coveredMonthCount: number;
  marketRegimeCount: number;
  excessCi95Lower: number | null;
  lowerDecileNetExcessReturnPct: number | null;
  tailBreachRate: number | null;
  regimeCohortCounts?: Record<string, number>;
  windowStart?: string;
  windowEnd?: string;
  statisticsVersion?: string;
  policyVersion?: string;
  evaluatedAt: string;
  reasons: string[];
}

export interface CurrentEnginePublicationWindow {
  engineVersion: string | null;
  assuranceContractHash: string | null;
  firstPublicationAt: string | null;
  latestPublicationAt: string | null;
}

export interface AssuranceControlSummaryInput {
  controlKey: string;
  latestStatus: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'MISSING';
  latestObservedAt: string | null;
  latestValidUntil: string | null;
  firstPassingObservedAt: string | null;
  passingObservationDays: number;
  failedObservationCount: number;
  releaseSha: string | null;
  sourceKind?: string | null;
  sourceRecordId?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface PilotEvidenceInput {
  completedCount: number;
  verifiedAccountCount: number;
  spanDays: number;
  distinctCompletionDays?: number;
  coveredCompletionMonths?: number;
  overdueUnresolvedCount?: number;
  maxAuthorizedRiskR: number | null;
  meanRMultiple: number | null;
  lowerDecileRMultiple: number | null;
  severeLossCount: number;
  riskBreachCount: number;
  averageAdverseSlippagePct: number | null;
  p90AdverseSlippagePct: number | null;
  firstLinkedAt: string | null;
  latestOutcomeAt: string | null;
}

export interface Conditional90AssuranceInput {
  now?: string;
  currentReleaseSha?: string | null;
  firstOfficialPublicationAt: string | null;
  latestOfficialPublicationAt: string | null;
  currentEngines: Record<string, string | null | undefined>;
  currentEnginePublicationWindows?: Record<string, CurrentEnginePublicationWindow | null | undefined>;
  longitudinalEvidence: LongitudinalEvidenceInput[];
  controls: AssuranceControlSummaryInput[];
  pilot: PilotEvidenceInput;
}

export interface AssuranceRequirement {
  code: string;
  label: string;
  status: AssuranceRequirementStatus;
  measured: string;
  target: string;
  unit: string;
  nextAction: string;
  evidenceAsOf: string | null;
}

export interface Conditional90Scorecard {
  schemaVersion: typeof CONDITIONAL_90_SCHEMA_VERSION;
  policyVersion: typeof CONDITIONAL_90_POLICY_VERSION;
  evaluatedAt: string;
  score: {
    verifiedScore: 72 | 73 | 85 | 90;
    scaleMax: 100;
    conditionalMaximum: 90;
    nextMilestone: 73 | 85 | 90 | null;
  };
  disposition: AssuranceDisposition;
  capitalApproval: 'NOT_GRANTED';
  policy: {
    implementationBaseline: {
      score: 72;
      kind: 'IMPLEMENTATION_VERIFICATION_BASELINE';
      fixedAsOf: typeof CONDITIONAL_90_IMPLEMENTATION_BASELINE_AS_OF;
      scope: string;
      evidenceBoundary: string;
    };
    mfa: {
      required: false;
      status: 'OWNER_WAIVED';
      rationale: string;
    };
    compensatingControls: string[];
    assessmentOnly: true;
  };
  milestones: Array<{
    score: 73 | 85 | 90;
    status: AssuranceRequirementStatus;
    label: string;
    passedRequirements: number;
    totalRequirements: number;
    evidenceAsOf: string | null;
    requirements: AssuranceRequirement[];
  }>;
  domains: Array<{
    code: string;
    label: string;
    verified: number;
    max: number;
    status: AssuranceRequirementStatus;
  }>;
  blockers: Array<{
    code: string;
    scope: '73' | '85' | '90';
    severity: 'TIME_BOUND' | 'ACTION_REQUIRED' | 'STATISTICAL_FAILURE';
    label: string;
    detail: string;
    current: string;
    target: string;
    unit: string;
    nextAction: string;
    evidenceAsOf: string | null;
  }>;
  priorityActions: Array<{
    code: string;
    label: string;
    expectedPointGain: number;
    effort: 'LOW' | 'MEDIUM' | 'HIGH' | 'TIME_BOUND';
    minimumElapsedDays: number;
    costTier: 'FREE';
    nextAction: string;
  }>;
  evidence: {
    oldestRequiredEvidenceAt: string | null;
    currentReleaseSha: string | null;
    publicationSpanDays: number;
  };
}

const DAY_MS = 86_400_000;
const LONGITUDINAL_EVALUATION_MAX_AGE_DAYS = 7;
const LONGITUDINAL_MAX_MATURITY_LAG_DAYS = {
  D5: 10,
  D20: 35,
  D60: 95,
} as const;
const LONGITUDINAL_REVALIDATION_POLICY = {
  12: {
    minimumCoveredMonths: 10,
    minimumSampleSize: 100,
    minimumCohorts: { D5: 60, D20: 40, D60: 20 },
    minimumRegimeCohorts: 10,
  },
  24: {
    minimumCoveredMonths: 20,
    minimumSampleSize: 200,
    minimumCohorts: { D5: 120, D20: 80, D60: 40 },
    minimumRegimeCohorts: 20,
  },
} as const;
const CORE_ACCESSIBILITY_ROUTES = [
  'recommendations',
  'portfolio',
  'scanner',
  'dashboard',
] as const;

function parsedTime(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function elapsedDays(from: string | null | undefined, to: string) {
  const start = parsedTime(from);
  const end = parsedTime(to);
  if (start === null || end === null || end < start) return 0;
  return Math.floor((end - start) / DAY_MS);
}

function isoDate(value: string | null | undefined) {
  const timestamp = parsedTime(value);
  return timestamp === null ? null : new Date(timestamp).toISOString().slice(0, 10);
}

function expectedWindowStart(windowEnd: string | null | undefined, months: 12 | 24) {
  if (!windowEnd) return null;
  const end = new Date(`${windowEnd}T00:00:00.000Z`);
  if (!Number.isFinite(end.getTime())) return null;
  end.setUTCMonth(end.getUTCMonth() - months);
  end.setUTCDate(end.getUTCDate() + 1);
  return end.toISOString().slice(0, 10);
}

function latestIso(values: Array<string | null | undefined>) {
  const measured = values
    .filter((value): value is string => parsedTime(value) !== null)
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return measured[0] || null;
}

function oldestIso(values: Array<string | null | undefined>) {
  const measured = values
    .filter((value): value is string => parsedTime(value) !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return measured[0] || null;
}

function requirement(input: AssuranceRequirement): AssuranceRequirement {
  return input;
}

function controlByKey(input: Conditional90AssuranceInput, key: string) {
  return input.controls.find((control) => control.controlKey === key) || null;
}

function isFreshPassingControl(
  control: AssuranceControlSummaryInput | null,
  now: string,
  maximumAgeDays: number,
) {
  if (!control || control.latestStatus !== 'PASS' || !control.latestObservedAt) return false;
  const observedAt = parsedTime(control.latestObservedAt);
  const validUntil = parsedTime(control.latestValidUntil);
  const nowTime = parsedTime(now);
  if (observedAt === null || validUntil === null || nowTime === null) return false;
  if (observedAt > nowTime || nowTime - observedAt > maximumAgeDays * DAY_MS) return false;
  return validUntil >= nowTime;
}

function currentEnginePublicationSpans(input: Conditional90AssuranceInput) {
  return CONDITIONAL_90_REQUIRED_CATEGORIES.map((category) => {
    const engineVersion = input.currentEngines[category] || null;
    const window = input.currentEnginePublicationWindows?.[category] || null;
    const matchesCurrentEngine = Boolean(engineVersion)
      && window?.engineVersion === engineVersion
      && typeof window.assuranceContractHash === 'string'
      && /^[a-f0-9]{64}$/.test(window.assuranceContractHash);
    const first = matchesCurrentEngine ? window?.firstPublicationAt || null : null;
    const latest = matchesCurrentEngine ? window?.latestPublicationAt || null : null;
    return {
      category,
      engineVersion,
      assuranceContractHash: matchesCurrentEngine ? window?.assuranceContractHash || null : null,
      first,
      latest,
      spanDays: elapsedDays(first, latest || ''),
    };
  });
}

function validateLongitudinalEvidence(
  row: LongitudinalEvidenceInput,
  input: Conditional90AssuranceInput,
  windowMonths: 12 | 24,
  now: string,
) {
  const reasons: string[] = [];
  const policy = LONGITUDINAL_REVALIDATION_POLICY[windowMonths];
  const horizon = row.horizon as keyof typeof policy.minimumCohorts;
  const publicationWindow = input.currentEnginePublicationWindows?.[row.category] || null;
  const expectedLatestDate = isoDate(publicationWindow?.latestPublicationAt);
  const windowEndTime = parsedTime(row.windowEnd);
  const latestPublicationTime = parsedTime(expectedLatestDate);
  const evaluatedAt = parsedTime(row.evaluatedAt);
  const nowTime = parsedTime(now);

  if (!publicationWindow?.assuranceContractHash
    || row.assuranceContractHash !== publicationWindow.assuranceContractHash) {
    reasons.push('ASSURANCE_CONTRACT_MISMATCH');
  }
  if (row.policyVersion !== LONGITUDINAL_ASSURANCE_POLICY_VERSION) reasons.push('POLICY_VERSION_MISMATCH');
  if (row.statisticsVersion !== RECOMMENDATION_EVIDENCE_STATISTICS_VERSION) reasons.push('STATISTICS_VERSION_MISMATCH');
  if (row.evidenceStatus !== 'READY') reasons.push('EVIDENCE_NOT_READY');
  if (row.gateStatus !== 'PASS') reasons.push('UPSTREAM_GATE_BLOCKED');
  if (row.reasons.length > 0) reasons.push('UPSTREAM_REASONS_PRESENT');
  if (!CONDITIONAL_90_REQUIRED_HORIZONS.includes(row.horizon as (typeof CONDITIONAL_90_REQUIRED_HORIZONS)[number])) {
    reasons.push('UNSUPPORTED_HORIZON');
  }
  if (evaluatedAt === null || nowTime === null || evaluatedAt > nowTime
    || nowTime - evaluatedAt > LONGITUDINAL_EVALUATION_MAX_AGE_DAYS * DAY_MS) {
    reasons.push('STALE_EVALUATION');
  }
  if (windowEndTime === null || latestPublicationTime === null) {
    reasons.push('WINDOW_END_INVALID');
  } else if (windowEndTime > latestPublicationTime) {
    reasons.push('WINDOW_END_AFTER_LATEST_PUBLICATION');
  } else {
    const maximumLagDays = LONGITUDINAL_MAX_MATURITY_LAG_DAYS[horizon];
    if (!maximumLagDays || elapsedDays(row.windowEnd, expectedLatestDate || '') > maximumLagDays) {
      reasons.push('WINDOW_END_MATURITY_LAG_EXCEEDED');
    }
  }
  if (expectedWindowStart(row.windowEnd, windowMonths) !== row.windowStart) reasons.push('WINDOW_START_MISMATCH');
  if (!Number.isInteger(row.coveredMonthCount)
    || row.coveredMonthCount < policy.minimumCoveredMonths
    || row.coveredMonthCount > windowMonths) reasons.push('INSUFFICIENT_MONTH_COVERAGE');
  if (!Number.isInteger(row.sampleSize) || row.sampleSize < policy.minimumSampleSize) {
    reasons.push('INSUFFICIENT_SAMPLE_SIZE');
  }
  const minimumCohorts = policy.minimumCohorts[horizon];
  if (!Number.isInteger(row.cohortCount) || !minimumCohorts || row.cohortCount < minimumCohorts) {
    reasons.push('INSUFFICIENT_COHORT_COUNT');
  }
  if (row.sampleSize < row.cohortCount) reasons.push('SAMPLE_COHORT_INCONSISTENCY');
  if (!Number.isInteger(row.marketRegimeCount) || row.marketRegimeCount < 2) {
    reasons.push('INSUFFICIENT_MARKET_REGIMES');
  }

  const regimeCounts = Object.values(row.regimeCohortCounts || {})
    .filter((value) => Number.isInteger(value) && value >= 0);
  if (regimeCounts.length !== row.marketRegimeCount
    || regimeCounts.reduce((sum, value) => sum + value, 0) !== row.cohortCount) {
    reasons.push('REGIME_COHORT_COUNT_MISMATCH');
  } else {
    const requiredRegimeShare = Math.ceil(row.cohortCount * 0.1);
    if (regimeCounts.some((count) => count < policy.minimumRegimeCohorts || count < requiredRegimeShare)) {
      reasons.push('UNBALANCED_MARKET_REGIME_COHORTS');
    }
  }
  if (row.excessCi95Lower === null
    || !Number.isFinite(row.excessCi95Lower)
    || row.excessCi95Lower <= 0) reasons.push('NON_POSITIVE_EXCESS_CI_LOWER_BOUND');
  if (row.lowerDecileNetExcessReturnPct === null
    || !Number.isFinite(row.lowerDecileNetExcessReturnPct)
    || row.lowerDecileNetExcessReturnPct < 0) {
    reasons.push('LOWER_DECILE_EXCESS_BELOW_ZERO');
  }
  if (row.tailBreachRate === null
    || !Number.isFinite(row.tailBreachRate)
    || row.tailBreachRate < 0
    || row.tailBreachRate > 0.05) {
    reasons.push('TAIL_BREACH_RATE_EXCEEDED');
  }
  return { row, reasons, passed: reasons.length === 0 };
}

function requiredWindowEvidence(
  input: Conditional90AssuranceInput,
  windowMonths: 12 | 24,
  now: string,
) {
  const evaluations: Array<ReturnType<typeof validateLongitudinalEvidence>> = [];
  const missing: string[] = [];
  for (const category of CONDITIONAL_90_REQUIRED_CATEGORIES) {
    const engineVersion = input.currentEngines[category];
    const assuranceContractHash = input.currentEnginePublicationWindows?.[category]?.assuranceContractHash;
    if (!engineVersion || !assuranceContractHash || !/^[a-f0-9]{64}$/.test(assuranceContractHash)) {
      missing.push(`${category}:CURRENT_CONTRACT`);
      continue;
    }
    for (const horizon of CONDITIONAL_90_REQUIRED_HORIZONS) {
      const candidates = input.longitudinalEvidence
        .filter((row) => row.category === category
          && row.engineVersion === engineVersion
          && row.assuranceContractHash === assuranceContractHash
          && row.horizon === horizon
          && row.windowMonths === windowMonths)
        .sort((left, right) => (
          (parsedTime(right.evaluatedAt) ?? Number.NEGATIVE_INFINITY)
          - (parsedTime(left.evaluatedAt) ?? Number.NEGATIVE_INFINITY)
        ));
      if (!candidates[0]) missing.push(`${category}:${horizon}`);
      else evaluations.push(validateLongitudinalEvidence(candidates[0], input, windowMonths, now));
    }
  }
  return {
    evaluations,
    rows: evaluations.map((evaluation) => evaluation.row),
    passedCount: evaluations.filter((evaluation) => evaluation.passed).length,
    missing,
  };
}

function milestoneStatus(requirements: AssuranceRequirement[]): AssuranceRequirementStatus {
  if (requirements.every((item) => item.status === 'PASS')) return 'PASS';
  if (requirements.some((item) => item.status === 'BLOCKED')) return 'BLOCKED';
  return 'WAITING';
}

function evidenceDate(requirements: AssuranceRequirement[]) {
  return oldestIso(requirements.map((item) => item.evidenceAsOf));
}

function hasExactStringSet(value: unknown, expected: readonly string[]) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item) => typeof item === 'string')
    && new Set(value).size === expected.length
    && expected.every((item) => value.includes(item));
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isSha256(value: unknown) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function isBoundedText(value: unknown, minimum: number, maximum: number) {
  return typeof value === 'string' && value.trim().length >= minimum && value.trim().length <= maximum;
}

function isEmptyStringArray(value: unknown) {
  return Array.isArray(value) && value.length === 0;
}

function percentile(values: number[], probability: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(probability * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function summarizePilotEvidence(rows: Array<{
  authorizedRiskR: number | null;
  rMultiple: number | null;
  adverseSlippagePct: number | null;
  riskBreach: boolean;
  linkedAt: string;
  exitAt: string | null;
  verifiedAccountActual: boolean;
  overdueUnresolved?: boolean;
}>): PilotEvidenceInput {
  const rMultiples = rows.map((row) => row.rMultiple)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const slippage = rows.map((row) => row.adverseSlippagePct)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const authorizedRisks = rows.map((row) => row.authorizedRiskR)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const tailCount = rMultiples.length === 0 ? 0 : Math.max(1, Math.ceil(rMultiples.length * 0.1));
  const sortedR = [...rMultiples].sort((left, right) => left - right);
  const linked = rows.map((row) => row.linkedAt).filter((value) => parsedTime(value) !== null).sort();
  const outcomes = rows.map((row) => row.exitAt)
    .filter((value): value is string => parsedTime(value) !== null)
    .sort();
  const firstLinkedAt = linked[0] || null;
  const latestOutcomeAt = outcomes.at(-1) || null;
  const distinctCompletionDays = new Set(outcomes.map((value) => value.slice(0, 10))).size;
  const coveredCompletionMonths = new Set(outcomes.map((value) => value.slice(0, 7))).size;
  return {
    completedCount: rows.length,
    verifiedAccountCount: rows.filter((row) => row.verifiedAccountActual).length,
    spanDays: firstLinkedAt && latestOutcomeAt ? elapsedDays(firstLinkedAt, latestOutcomeAt) : 0,
    distinctCompletionDays,
    coveredCompletionMonths,
    overdueUnresolvedCount: rows.filter((row) => row.overdueUnresolved === true).length,
    maxAuthorizedRiskR: rows.length > 0 && authorizedRisks.length === rows.length
      ? Math.max(...authorizedRisks)
      : null,
    meanRMultiple: rMultiples.length === rows.length && rows.length > 0
      ? rMultiples.reduce((sum, value) => sum + value, 0) / rMultiples.length
      : null,
    lowerDecileRMultiple: rMultiples.length === rows.length && tailCount
      ? sortedR.slice(0, tailCount).reduce((sum, value) => sum + value, 0) / tailCount
      : null,
    severeLossCount: rMultiples.filter((value) => value <= -2).length,
    riskBreachCount: rows.filter((row) => row.riskBreach).length,
    averageAdverseSlippagePct: slippage.length === rows.length && rows.length > 0
      ? slippage.reduce((sum, value) => sum + value, 0) / slippage.length
      : null,
    p90AdverseSlippagePct: slippage.length === rows.length ? percentile(slippage, 0.9) : null,
    firstLinkedAt,
    latestOutcomeAt,
  };
}

export function evaluateConditional90Assurance(
  input: Conditional90AssuranceInput,
): Conditional90Scorecard {
  const now = input.now && parsedTime(input.now) !== null ? input.now : new Date().toISOString();
  const enginePublicationSpans = currentEnginePublicationSpans(input);
  const publicationSpanDays = enginePublicationSpans.length === CONDITIONAL_90_REQUIRED_CATEGORIES.length
    ? Math.min(...enginePublicationSpans.map((window) => window.spanDays))
    : 0;
  const twelveMonthDurationPass = enginePublicationSpans.every((window) => window.spanDays >= 365);
  const twentyFourMonthDurationPass = enginePublicationSpans.every((window) => window.spanDays >= 730);
  const twelveMonth = requiredWindowEvidence(input, 12, now);
  const twentyFourMonth = requiredWindowEvidence(input, 24, now);
  const branchProtection = controlByKey(input, 'BRANCH_PROTECTION');
  const secretsLeastPrivilege = controlByKey(input, 'SECRETS_LEAST_PRIVILEGE');
  const operations = controlByKey(input, 'EXTERNAL_HEALTH');
  const backup = controlByKey(input, 'BACKUP_RESTORE');
  const ci = controlByKey(input, 'RELEASE_CI');
  const accessibility = controlByKey(input, 'ACCESSIBILITY_AUTOMATED');
  const manualAccessibility = controlByKey(input, 'ACCESSIBILITY_MANUAL');
  const recoveryDrill = controlByKey(input, 'RECOVERY_DRILL');
  const branchPayload = branchProtection?.payload || {};
  const branchChecks = branchPayload.checks && typeof branchPayload.checks === 'object'
    ? branchPayload.checks as Record<string, unknown>
    : {};
  const secretsPayload = secretsLeastPrivilege?.payload || {};

  const twelveMonthPass = twelveMonth.missing.length === 0
    && twelveMonth.evaluations.length === CONDITIONAL_90_REQUIRED_CATEGORIES.length * CONDITIONAL_90_REQUIRED_HORIZONS.length
    && twelveMonth.evaluations.every((evaluation) => evaluation.passed);
  const twentyFourMonthPass = twentyFourMonth.missing.length === 0
    && twentyFourMonth.evaluations.length === CONDITIONAL_90_REQUIRED_CATEGORIES.length * CONDITIONAL_90_REQUIRED_HORIZONS.length
    && twentyFourMonth.evaluations.every((evaluation) => evaluation.passed);
  const branchProtectionPass = isFreshPassingControl(branchProtection, now, 90)
    && Boolean(input.currentReleaseSha)
    && branchProtection?.releaseSha === input.currentReleaseSha
    && typeof branchPayload.artifact_hash === 'string'
    && /^[a-f0-9]{64}$/.test(branchPayload.artifact_hash)
    && typeof branchPayload.reviewer_subject_hash === 'string'
    && /^[a-f0-9]{64}$/.test(branchPayload.reviewer_subject_hash)
    && branchPayload.branch === 'main'
    && branchPayload.protected_ref === 'refs/heads/main'
    && typeof branchPayload.protected_ref_head_sha === 'string'
    && /^[a-f0-9]{40}$/.test(branchPayload.protected_ref_head_sha)
    && (branchPayload.release_relation === 'MAIN_HEAD'
      || branchPayload.release_relation === 'MAIN_ANCESTOR')
    && branchPayload.release_ancestor_verified === true
    && (branchPayload.release_relation !== 'MAIN_HEAD'
      || branchPayload.protected_ref_head_sha === input.currentReleaseSha)
    && typeof branchPayload.protection_snapshot_hash === 'string'
    && /^[a-f0-9]{64}$/.test(branchPayload.protection_snapshot_hash)
    && branchChecks.strict_status_checks === true
    && branchChecks.required_test_check === true
    && branchChecks.enforce_admins === true
    && branchChecks.force_pushes_disabled === true
    && branchChecks.deletions_disabled === true;
  const secretsLeastPrivilegePass = isFreshPassingControl(secretsLeastPrivilege, now, 90)
    && Boolean(input.currentReleaseSha)
    && secretsLeastPrivilege?.releaseSha === input.currentReleaseSha
    && secretsPayload.api_auth_audit_passed === true
    && secretsPayload.service_role_server_only_tested === true
    && secretsPayload.rls_anon_write_denied_tested === true
    && secretsPayload.deployed_rls_verified === true
    && secretsPayload.result === 'PASS';
  const health30Pass = isFreshPassingControl(operations, now, 1)
    && elapsedDays(operations?.firstPassingObservedAt, now) >= 30
    && (operations?.passingObservationDays || 0) >= 20
    && (operations?.failedObservationCount || 0) === 0;
  const releaseCiPass = isFreshPassingControl(ci, now, 30)
    && Boolean(input.currentReleaseSha)
    && ci?.releaseSha === input.currentReleaseSha;
  const backupPayload = backup?.payload || {};
  const backupPass = isFreshPassingControl(backup, now, 2)
    && backupPayload.encrypted === true
    && backupPayload.restore_drill === true
    && backupPayload.row_count_reconciliation === true
    && typeof backupPayload.checksum_sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(backupPayload.checksum_sha256);

  const requirements73 = [
    requirement({
      code: 'TECHNICAL_BASELINE',
      label: '구현 검증 기준선(고정 기준일)',
      status: 'PASS',
      measured: '72',
      target: '72',
      unit: '점',
      nextAction: '고정 기준일의 구현·테스트 범위를 유지하고, 이후 점수는 별도 최신 운영·성과 증거로만 올리세요.',
      evidenceAsOf: CONDITIONAL_90_IMPLEMENTATION_BASELINE_AS_OF,
    }),
    requirement({
      code: 'BRANCH_PROTECTION',
      label: '보호된 main 브랜치',
      status: branchProtectionPass ? 'PASS' : branchProtection?.latestStatus === 'FAIL' ? 'BLOCKED' : 'WAITING',
      measured: branchProtection?.latestStatus || 'MISSING',
      target: '90일 이내 PASS',
      unit: '보상통제',
      nextAction: '필수 CI·강제 푸시 차단·삭제 차단이 유지된 보호 브랜치 증거를 갱신하세요.',
      evidenceAsOf: branchProtection?.latestObservedAt || null,
    }),
    requirement({
      code: 'SECRETS_LEAST_PRIVILEGE',
      label: '서버 전용 비밀·RLS·최소권한',
      status: secretsLeastPrivilegePass ? 'PASS' : secretsLeastPrivilege?.latestStatus === 'FAIL' ? 'BLOCKED' : 'WAITING',
      measured: secretsLeastPrivilege?.latestStatus || 'MISSING',
      target: '90일 이내 PASS',
      unit: '보상통제',
      nextAction: '서비스 역할이 브라우저에 노출되지 않고 anon·authenticated 쓰기가 RLS로 차단되는지 현재 배포에서 재검증하세요.',
      evidenceAsOf: secretsLeastPrivilege?.latestObservedAt || null,
    }),
    requirement({
      code: 'MFA_POLICY',
      label: 'MFA 정책과 보상통제',
      status: 'PASS',
      measured: '정책상 비필수·소유자 승인',
      target: '보상통제 유지',
      unit: '정책',
      nextAction: '현재 배포 SHA에서 API 인증·서버 전용 service_role·RLS와 main 브랜치 보호 증거를 갱신하세요.',
      evidenceAsOf: now,
    }),
  ];

  const requirements85 = [
    requirement({
      code: 'SHADOW_DURATION_12M',
      label: '현재 엔진별 동일 계약 전진검증 기간',
      status: twelveMonthDurationPass ? 'PASS' : 'WAITING',
      measured: String(publicationSpanDays),
      target: '365',
      unit: '일',
      nextAction: '엔진·프롬프트·데이터 계약을 고정하고 공식 추천 성과를 계속 축적하세요.',
      evidenceAsOf: latestIso(enginePublicationSpans.map((window) => window.latest)),
    }),
    requirement({
      code: 'LONGITUDINAL_12M',
      label: '12개월 다국면 비용 후 통계 게이트',
      status: twelveMonthPass
        ? 'PASS'
        : twelveMonth.missing.length > 0 ? 'WAITING' : 'BLOCKED',
      measured: `${twelveMonth.passedCount}/${CONDITIONAL_90_REQUIRED_CATEGORIES.length * CONDITIONAL_90_REQUIRED_HORIZONS.length}`,
      target: '12/12',
      unit: '카테고리×기간',
      nextAction: '공식 데이터 표본·독립 추천일·2개 이상 국면을 채우고 비용 후 초과수익 95% CI 하한과 tail 기준을 통과하세요.',
      evidenceAsOf: latestIso(twelveMonth.rows.map((row) => row.evaluatedAt)),
    }),
    requirement({
      code: 'OPERATIONS_30D',
      label: '30일 연속 운영 관측',
      status: health30Pass ? 'PASS' : operations?.latestStatus === 'FAIL' ? 'BLOCKED' : 'WAITING',
      measured: `${elapsedDays(operations?.firstPassingObservedAt, now)}일·${operations?.passingObservationDays || 0}일 관측`,
      target: '30일·20일 이상 관측·실패 0',
      unit: '운영일',
      nextAction: '외부 deadman을 계속 실행하고 실패·누락 원인을 해소한 뒤 30일 무실패 창을 다시 시작하세요.',
      evidenceAsOf: operations?.latestObservedAt || null,
    }),
    requirement({
      code: 'BACKUP_RESTORE_CURRENT',
      label: '암호화 백업·복원 검증 신선도',
      status: backupPass ? 'PASS' : backup?.latestStatus === 'FAIL' ? 'BLOCKED' : 'WAITING',
      measured: backup?.latestStatus || 'MISSING',
      target: '48시간 이내 PASS',
      unit: '복원훈련',
      nextAction: 'PG17 복원과 row-count reconciliation이 포함된 암호화 백업을 성공시키세요.',
      evidenceAsOf: backup?.latestObservedAt || null,
    }),
    requirement({
      code: 'RELEASE_CI_CURRENT',
      label: '현재 배포 SHA의 전체 CI',
      status: releaseCiPass ? 'PASS' : ci?.latestStatus === 'FAIL' ? 'BLOCKED' : 'WAITING',
      measured: ci?.releaseSha || 'MISSING',
      target: input.currentReleaseSha || '현재 배포 SHA',
      unit: 'SHA',
      nextAction: '현재 배포 커밋에서 lint·typecheck·unit·auth·build·E2E 전체를 통과하세요.',
      evidenceAsOf: ci?.latestObservedAt || null,
    }),
  ];

  const pilot = input.pilot;
  const pilotPass = pilot.completedCount >= 20
    && pilot.verifiedAccountCount === pilot.completedCount
    && pilot.spanDays >= 180
    && Number.isInteger(pilot.distinctCompletionDays)
    && (pilot.distinctCompletionDays || 0) >= 15
    && Number.isInteger(pilot.coveredCompletionMonths)
    && (pilot.coveredCompletionMonths || 0) >= 6
    && (pilot.overdueUnresolvedCount || 0) === 0
    && pilot.maxAuthorizedRiskR !== null
    && pilot.maxAuthorizedRiskR <= 0.5
    && pilot.meanRMultiple !== null
    && pilot.meanRMultiple > 0
    && pilot.lowerDecileRMultiple !== null
    && pilot.lowerDecileRMultiple >= -1.2
    && pilot.severeLossCount === 0
    && pilot.riskBreachCount === 0
    && pilot.averageAdverseSlippagePct !== null
    && pilot.averageAdverseSlippagePct <= 0.25
    && pilot.p90AdverseSlippagePct !== null
    && pilot.p90AdverseSlippagePct <= 1;
  const recoveryPayload = recoveryDrill?.payload || {};
  const recoveryPass = isFreshPassingControl(recoveryDrill, now, 30)
    && (recoveryDrill?.passingObservationDays || 0) >= 3
    && (recoveryDrill?.failedObservationCount || 0) === 0
    && recoveryPayload.encrypted === true
    && recoveryPayload.restore_drill === true
    && recoveryPayload.row_count_reconciliation === true
    && recoveryPayload.critical_query_smoke === true
    && typeof recoveryPayload.critical_query_count === 'number'
    && recoveryPayload.critical_query_count >= 3
    && recoveryPayload.offsite === true
    && recoveryPayload.offsite_provider === 'GITHUB_ARTIFACT'
    && typeof recoveryPayload.artifact_id === 'string'
    && recoveryPayload.artifact_id.length > 0
    && typeof recoveryPayload.artifact_digest === 'string'
    && /^(?:sha256:)?[a-f0-9]{64}$/.test(recoveryPayload.artifact_digest)
    && recoveryPayload.rto_target_seconds === 3_600
    && typeof recoveryPayload.rto_seconds === 'number'
    && recoveryPayload.rto_seconds >= 0
    && recoveryPayload.rto_seconds <= recoveryPayload.rto_target_seconds
    && recoveryPayload.rpo_measured === true
    && recoveryPayload.rpo_target_seconds === 86_400
    && typeof recoveryPayload.rpo_seconds === 'number'
    && recoveryPayload.rpo_seconds >= 0
    && recoveryPayload.rpo_seconds <= recoveryPayload.rpo_target_seconds;
  const accessibilityPayload = accessibility?.payload || {};
  const automatedAccessibilityPass = isFreshPassingControl(accessibility, now, 30)
    && Boolean(input.currentReleaseSha)
    && accessibility?.releaseSha === input.currentReleaseSha
    && accessibilityPayload.schema_version === 'mtn-a11y-core-matrix-v2'
    && accessibilityPayload.keyboard_audit_mode === 'FULL_VISIBLE_MAIN_TAB_SEQUENCE_WITH_RENDERED_INDICATOR'
    && accessibilityPayload.zoom_audit_mode === 'BROWSER_ZOOM_EQUIVALENT_REFLOW_AND_FIXED_PX_SCOPE'
    && accessibilityPayload.mobile_audit_mode === 'DOCUMENT_AND_DESCENDANT_CLIPPING'
    && accessibilityPayload.fixed_pixel_text_scopes_enforced === true
    && accessibilityPayload.result === 'PASS'
    && accessibilityPayload.test_exit_code === 0
    && accessibilityPayload.report_error === null
    && accessibilityPayload.expected_route_count === 4
    && accessibilityPayload.covered_route_count === 4
    && accessibilityPayload.passed_route_count === 4
    && accessibilityPayload.core_route_coverage_pct === 100
    && hasExactStringSet(accessibilityPayload.covered_routes, CORE_ACCESSIBILITY_ROUTES)
    && hasExactStringSet(accessibilityPayload.passed_routes, CORE_ACCESSIBILITY_ROUTES)
    && accessibilityPayload.checks_expected === 16
    && accessibilityPayload.checks_executed === 16
    && accessibilityPayload.checks_passed === 16
    && accessibilityPayload.axe_checks_total === 4
    && accessibilityPayload.axe_checks_passed === 4
    && isEmptyStringArray(accessibilityPayload.axe_failed_routes)
    && accessibilityPayload.keyboard_failures === 0
    && isEmptyStringArray(accessibilityPayload.keyboard_failed_routes)
    && accessibilityPayload.zoom_200_failures === 0
    && isEmptyStringArray(accessibilityPayload.zoom_200_failed_routes)
    && accessibilityPayload.mobile_360_overflow_failures === 0
    && isEmptyStringArray(accessibilityPayload.mobile_360_failed_routes);
  const manualAccessibilityPayload = manualAccessibility?.payload || {};
  const manualAccessibilityChecks = recordValue(manualAccessibilityPayload.checks);
  const assistiveTechnology = recordValue(manualAccessibilityPayload.assistive_technology);
  const manualAccessibilityPass = isFreshPassingControl(manualAccessibility, now, 90)
    && Boolean(input.currentReleaseSha)
    && manualAccessibility?.releaseSha === input.currentReleaseSha
    && manualAccessibility?.sourceKind === 'MANUAL_REVIEW'
    && manualAccessibilityPayload.schema_version === CONDITIONAL_90_MANUAL_ACCESSIBILITY_SCHEMA_VERSION
    && manualAccessibilityPayload.policy_version === CONDITIONAL_90_POLICY_VERSION
    && manualAccessibilityPayload.result === 'PASS'
    && manualAccessibilityPayload.artifact_kind === 'ACCESSIBILITY_REVIEW_REPORT'
    && isSha256(manualAccessibilityPayload.artifact_hash)
    && manualAccessibility?.sourceRecordId === manualAccessibilityPayload.artifact_hash
    && isSha256(manualAccessibilityPayload.reviewer_subject_hash)
    && manualAccessibilityPayload.reviewer_authentication === 'INDEPENDENT_ASSURANCE_CREDENTIAL'
    && isBoundedText(assistiveTechnology.name, 2, 80)
    && isBoundedText(assistiveTechnology.version, 1, 40)
    && isBoundedText(assistiveTechnology.platform, 2, 80)
    && hasExactStringSet(manualAccessibilityPayload.routes_reviewed, CONDITIONAL_90_CORE_ACCESSIBILITY_PATHS)
    && CONDITIONAL_90_MANUAL_ACCESSIBILITY_CHECKS.every((key) => manualAccessibilityChecks[key] === true)
    && isBoundedText(manualAccessibilityPayload.reviewer_attestation, 40, 4_000)
    && isBoundedText(manualAccessibilityPayload.notes, 20, 4_000);
  const health90Pass = isFreshPassingControl(operations, now, 1)
    && elapsedDays(operations?.firstPassingObservedAt, now) >= 90
    && (operations?.passingObservationDays || 0) >= 60
    && (operations?.failedObservationCount || 0) === 0;

  const requirements90 = [
    requirement({
      code: 'SHADOW_DURATION_24M',
      label: '현재 엔진별 24개월 동일 계약 전진검증 기간',
      status: twentyFourMonthDurationPass ? 'PASS' : 'WAITING',
      measured: String(publicationSpanDays),
      target: '730',
      unit: '일',
      nextAction: '네 카테고리의 현재 엔진 계약을 각각 730일 이상 변경 없이 전진검증하세요.',
      evidenceAsOf: latestIso(enginePublicationSpans.map((window) => window.latest)),
    }),
    requirement({
      code: 'LONGITUDINAL_24M',
      label: '24개월 다국면 비용 후 통계 게이트',
      status: twentyFourMonthPass
        ? 'PASS'
        : twentyFourMonth.missing.length > 0 ? 'WAITING' : 'BLOCKED',
      measured: `${twentyFourMonth.passedCount}/${CONDITIONAL_90_REQUIRED_CATEGORIES.length * CONDITIONAL_90_REQUIRED_HORIZONS.length}`,
      target: '12/12',
      unit: '카테고리×기간',
      nextAction: '총 24개월 동안 동일 계약의 공식·비용 후 성과와 국면별 tail 안정성을 유지하세요.',
      evidenceAsOf: latestIso(twentyFourMonth.rows.map((row) => row.evaluatedAt)),
    }),
    requirement({
      code: 'LIVE_PILOT',
      label: '0.5R 이하 검증 실계좌 파일럿',
      status: pilotPass
        ? 'PASS'
        : pilot.completedCount >= 20 && (pilot.meanRMultiple ?? 0) <= 0
          ? 'BLOCKED'
          : 'WAITING',
      measured: `${pilot.verifiedAccountCount}/${pilot.completedCount}건·${pilot.spanDays}일·${pilot.distinctCompletionDays || 0}거래일·${pilot.coveredCompletionMonths || 0}개월·연체미정산 ${pilot.overdueUnresolvedCount || 0}건·최대 ${pilot.maxAuthorizedRiskR ?? '미측정'}R`,
      target: '20건·180일·15거래일·6개월·모두 실제계좌·95일 초과 미정산 0·최대 0.5R',
      unit: '완료거래',
      nextAction: '85점 통과 후에만 0.25R로 시작해 최대 0.5R 이내에서 추천→결정→거래→브로커 근거를 연결하세요.',
      evidenceAsOf: pilot.latestOutcomeAt,
    }),
    requirement({
      code: 'RECOVERY_DRILLS',
      label: '반복 복구·장애주입 증거',
      status: recoveryPass ? 'PASS' : recoveryDrill?.latestStatus === 'FAIL' ? 'BLOCKED' : 'WAITING',
      measured: `${recoveryDrill?.passingObservationDays || 0}회·${recoveryDrill?.latestStatus || 'MISSING'}`,
      target: '90일 내 3회·최근 30일 PASS',
      unit: '검증훈련',
      nextAction: 'RTO≤60분·RPO≤24시간·critical query·행수대조를 포함한 실제 복원훈련을 반복하세요.',
      evidenceAsOf: recoveryDrill?.latestObservedAt || null,
    }),
    requirement({
      code: 'ACCESSIBILITY_AUTOMATED',
      label: '현재 배포 자동 접근성 검증',
      status: automatedAccessibilityPass ? 'PASS' : accessibility?.latestStatus === 'FAIL' ? 'BLOCKED' : 'WAITING',
      measured: accessibility?.releaseSha || 'MISSING',
      target: input.currentReleaseSha || '현재 배포 SHA',
      unit: 'SHA',
      nextAction: '핵심 경로 axe serious/critical 0, 키보드·200% zoom·360px 가로넘침 0을 CI에서 확인하세요.',
      evidenceAsOf: accessibility?.latestObservedAt || null,
    }),
    requirement({
      code: 'ACCESSIBILITY_MANUAL',
      label: '수동 보조기술 접근성 검토',
      status: manualAccessibilityPass ? 'PASS' : manualAccessibility?.latestStatus === 'FAIL' ? 'BLOCKED' : 'WAITING',
      measured: manualAccessibility?.latestStatus || 'MISSING',
      target: input.currentReleaseSha || '현재 배포 SHA',
      unit: '수동점검',
      nextAction: '스크린리더·focus 순서·색각 비의존을 실제 보조기술로 점검하고 근거 해시를 기록하세요.',
      evidenceAsOf: manualAccessibility?.latestObservedAt || null,
    }),
    requirement({
      code: 'OPERATIONS_90D',
      label: '90일 연속 운영 관측',
      status: health90Pass ? 'PASS' : operations?.latestStatus === 'FAIL' ? 'BLOCKED' : 'WAITING',
      measured: `${elapsedDays(operations?.firstPassingObservedAt, now)}일·${operations?.passingObservationDays || 0}일 관측`,
      target: '90일·60일 이상 관측·실패 0',
      unit: '운영일',
      nextAction: '외부 관측을 유지하고 FAIL 발생 시 원인 해소 후 무실패 창을 다시 축적하세요.',
      evidenceAsOf: operations?.latestObservedAt || null,
    }),
  ];

  const status73 = milestoneStatus(requirements73);
  const status85 = status73 === 'PASS' ? milestoneStatus(requirements85) : 'WAITING';
  const status90 = status85 === 'PASS' ? milestoneStatus(requirements90) : 'WAITING';
  const verifiedScore: 72 | 73 | 85 | 90 = status90 === 'PASS'
    ? 90
    : status85 === 'PASS' ? 85 : status73 === 'PASS' ? 73 : 72;
  const scoreByDomain = verifiedScore === 90
    ? { investment: 17, data: 13, strategy: 13, risk: 14, software: 10, operations: 8, security: 5, system_ui: 10 }
    : verifiedScore === 85
      ? { investment: 15, data: 12, strategy: 12, risk: 14, software: 10, operations: 8, security: 5, system_ui: 9 }
      : verifiedScore === 73
        ? { investment: 6, data: 12, strategy: 10, risk: 14, software: 10, operations: 7, security: 5, system_ui: 9 }
        : { investment: 6, data: 12, strategy: 10, risk: 14, software: 10, operations: 7, security: 4, system_ui: 9 };
  const domainMax = { investment: 17, data: 13, strategy: 13, risk: 14, software: 10, operations: 8, security: 5, system_ui: 10 };
  const domainLabels = {
    investment: '투자효용·성과증거',
    data: '데이터 품질·계보',
    strategy: '전략·검증방법',
    risk: '위험통제',
    software: '소프트웨어 품질',
    operations: '운영·복구',
    security: '보안·비밀관리',
    system_ui: 'System UI',
  };

  const blockers = [
    ...(status73 === 'PASS'
      ? []
      : requirements73.filter((item) => item.status !== 'PASS').map((item) => ({ item, scope: '73' as const }))),
    ...(status73 === 'PASS' && status85 !== 'PASS'
      ? requirements85.filter((item) => item.status !== 'PASS').map((item) => ({ item, scope: '85' as const }))
      : []),
    ...(status85 === 'PASS' && status90 !== 'PASS'
      ? requirements90.filter((item) => item.status !== 'PASS').map((item) => ({ item, scope: '90' as const }))
      : []),
  ].map(({ item, scope }) => ({
    code: item.code,
    scope,
    severity: item.status === 'BLOCKED'
      ? 'STATISTICAL_FAILURE' as const
      : item.code.includes('DURATION') || item.code.includes('LONGITUDINAL') || item.code.includes('PILOT') || item.code.includes('OPERATIONS')
        ? 'TIME_BOUND' as const
        : 'ACTION_REQUIRED' as const,
    label: item.label,
    detail: item.status === 'BLOCKED' ? '관측된 실패를 해소하기 전에는 점수를 올리지 않습니다.' : '필수 증거가 아직 충분하지 않아 닫힘 처리했습니다.',
    current: item.measured,
    target: item.target,
    unit: item.unit,
    nextAction: item.nextAction,
    evidenceAsOf: item.evidenceAsOf,
  }));

  const priorityActions = verifiedScore === 72
    ? [{
        code: 'RESTORE_COMPENSATING_CONTROLS',
        label: '보호 브랜치·최소권한 보상통제 증거 복구',
        expectedPointGain: 1,
        effort: 'LOW' as const,
        minimumElapsedDays: 0,
        costTier: 'FREE' as const,
        nextAction: 'BRANCH_PROTECTION과 SECRETS_LEAST_PRIVILEGE의 최신 PASS 증거를 모두 기록하세요.',
      }]
    : verifiedScore === 73
      ? [
        {
          code: 'ACCUMULATE_12M_EVIDENCE',
          label: '12개월 shadow/OOS 근거 축적',
          expectedPointGain: 9,
          effort: 'TIME_BOUND' as const,
          minimumElapsedDays: Math.max(0, 365 - publicationSpanDays),
          costTier: 'FREE' as const,
          nextAction: '새 전략 추가보다 현재 엔진의 비용 후 성과·거부 결정·국면을 매일 누적하세요.',
        },
        {
          code: 'MAINTAIN_OPERATIONS_WINDOW',
          label: '외부 운영관측·복원 증거 유지',
          expectedPointGain: 1,
          effort: 'LOW' as const,
          minimumElapsedDays: Math.max(0, 30 - elapsedDays(operations?.firstPassingObservedAt, now)),
          costTier: 'FREE' as const,
          nextAction: '외부 deadman과 일일 PG17 복원훈련의 실패를 매일 확인하세요.',
        },
        {
          code: 'CAPTURE_DECISIONS',
          label: '추천 채택·거부와 거래 연결',
          expectedPointGain: 2,
          effort: 'MEDIUM' as const,
          minimumElapsedDays: 0,
          costTier: 'FREE' as const,
          nextAction: '모든 추천에 당시 결정을 남겨 선택편향과 사후 연결을 막으세요.',
        },
        ]
      : verifiedScore === 85
        ? [
          {
            code: 'RUN_SMALL_LIVE_PILOT',
            label: '0.25R→최대 0.5R 실계좌 파일럿',
            expectedPointGain: 3,
            effort: 'TIME_BOUND' as const,
            minimumElapsedDays: Math.max(0, 180 - pilot.spanDays),
            costTier: 'FREE' as const,
            nextAction: '사람의 별도 자본 승인 후에만 작게 실행하고 브로커 근거를 불변 원장에 연결하세요.',
          },
          {
            code: 'COMPLETE_RECOVERY_ACCESSIBILITY',
            label: '복구·접근성 반복증거 완성',
            expectedPointGain: 2,
            effort: 'MEDIUM' as const,
            minimumElapsedDays: 90,
            costTier: 'FREE' as const,
            nextAction: '반복 복원훈련과 자동·수동 접근성 점검을 현재 release SHA 기준으로 유지하세요.',
          },
          ]
        : [];

  return {
    schemaVersion: CONDITIONAL_90_SCHEMA_VERSION,
    policyVersion: CONDITIONAL_90_POLICY_VERSION,
    evaluatedAt: now,
    score: {
      verifiedScore,
      scaleMax: 100,
      conditionalMaximum: 90,
      nextMilestone: verifiedScore === 72 ? 73 : verifiedScore === 73 ? 85 : verifiedScore === 85 ? 90 : null,
    },
    disposition: verifiedScore === 90
      ? 'ELIGIBLE_FOR_HUMAN_REVIEW'
      : verifiedScore === 85 ? 'SMALL_PILOT_REVIEW' : 'RESEARCH_ONLY',
    capitalApproval: 'NOT_GRANTED',
    policy: {
      implementationBaseline: {
        score: 72,
        kind: 'IMPLEMENTATION_VERIFICATION_BASELINE',
        fixedAsOf: CONDITIONAL_90_IMPLEMENTATION_BASELINE_AS_OF,
        scope: '무료 인프라의 코드·테스트·위험통제·System UI 구현 기준선',
        evidenceBoundary: '실계좌 성과·장기 운영·현재 배포의 외부 증거는 포함하지 않으며 각 상위 게이트에서 별도로 검증합니다.',
      },
      mfa: {
        required: false,
        status: 'OWNER_WAIVED',
        rationale: '소유자 결정에 따라 MFA는 점수 필수조건이 아니며 승인된 보상통제로 대체합니다.',
      },
      compensatingControls: [
        '현재 SHA의 API 인증·서버 전용 service_role 검증',
        'anon·authenticated 운영 DB 쓰기 권한 차단 실측',
        '필수 test CI와 보호된 main 브랜치',
        '관리자 예외·강제 푸시·브랜치 삭제 차단',
      ],
      assessmentOnly: true,
    },
    milestones: [
      {
        score: 73,
        status: status73,
        label: '무료 기술 기준선·보상통제',
        passedRequirements: requirements73.filter((item) => item.status === 'PASS').length,
        totalRequirements: requirements73.length,
        evidenceAsOf: evidenceDate(requirements73),
        requirements: requirements73,
      },
      {
        score: 85,
        status: status85,
        label: '장기 성과·운영 검증',
        passedRequirements: requirements85.filter((item) => item.status === 'PASS').length,
        totalRequirements: requirements85.length,
        evidenceAsOf: evidenceDate(requirements85),
        requirements: requirements85,
      },
      {
        score: 90,
        status: status90,
        label: '조건부 이론상 최대',
        passedRequirements: requirements90.filter((item) => item.status === 'PASS').length,
        totalRequirements: requirements90.length,
        evidenceAsOf: evidenceDate(requirements90),
        requirements: requirements90,
      },
    ],
    domains: Object.entries(scoreByDomain).map(([code, verified]) => ({
      code,
      label: domainLabels[code as keyof typeof domainLabels],
      verified,
      max: domainMax[code as keyof typeof domainMax],
      status: verified === domainMax[code as keyof typeof domainMax] ? 'PASS' : 'WAITING',
    })),
    blockers,
    priorityActions,
    evidence: {
      oldestRequiredEvidenceAt: oldestIso([
        input.firstOfficialPublicationAt,
        ...input.controls.map((control) => control.firstPassingObservedAt),
        pilot.firstLinkedAt,
      ]),
      currentReleaseSha: input.currentReleaseSha || null,
      publicationSpanDays,
    },
  };
}
