import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});

const {
  CONDITIONAL_90_IMPLEMENTATION_BASELINE_AS_OF,
  CONDITIONAL_90_REQUIRED_CATEGORIES,
  CONDITIONAL_90_REQUIRED_HORIZONS,
  evaluateConditional90Assurance,
  summarizePilotEvidence,
} = jiti('../lib/assurance/conditional-90.ts');
const {
  LONGITUDINAL_ASSURANCE_POLICY_VERSION,
} = jiti('../lib/assurance/longitudinal-evidence.ts');
const { buildAssuranceControlEvidenceRow } = jiti('../lib/assurance/control-evidence.ts');
const {
  RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
} = jiti('../lib/recommendations/evidence-performance.ts');

const NOW = '2026-08-03T12:00:00.000Z';
const RELEASE_SHA = 'a'.repeat(40);
const DAY_MS = 86_400_000;

function isoDaysAgo(days) {
  return new Date(Date.parse(NOW) - (days * DAY_MS)).toISOString();
}

function dateDaysAgo(days) {
  return isoDaysAgo(days).slice(0, 10);
}

function subtractMonthsInclusive(date, months) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() - months);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function currentEngines() {
  return Object.fromEntries(
    CONDITIONAL_90_REQUIRED_CATEGORIES.map((category) => [category, `${category}-engine-v1`]),
  );
}

function assuranceContractHash(category) {
  return String(CONDITIONAL_90_REQUIRED_CATEGORIES.indexOf(category) + 1).repeat(64);
}

function currentEnginePublicationWindows(spanDays) {
  return Object.fromEntries(CONDITIONAL_90_REQUIRED_CATEGORIES.map((category) => [category, {
    engineVersion: `${category}-engine-v1`,
    assuranceContractHash: assuranceContractHash(category),
    firstPublicationAt: isoDaysAgo(spanDays),
    latestPublicationAt: NOW,
  }]));
}

function longitudinalRows(windowMonths) {
  return CONDITIONAL_90_REQUIRED_CATEGORIES.flatMap((category) => (
    CONDITIONAL_90_REQUIRED_HORIZONS.map((horizon) => {
      const maturityLagDays = { D5: 5, D20: 20, D60: 60 }[horizon];
      const cohortCount = windowMonths === 12
        ? { D5: 60, D20: 40, D60: 20 }[horizon]
        : { D5: 120, D20: 80, D60: 40 }[horizon];
      const windowEnd = dateDaysAgo(maturityLagDays);
      const firstRegimeCount = Math.ceil(cohortCount / 2);
      return {
        category,
        engineVersion: `${category}-engine-v1`,
        assuranceContractHash: assuranceContractHash(category),
        horizon,
        windowMonths,
        gateStatus: 'PASS',
        evidenceStatus: 'READY',
        sampleSize: windowMonths === 12 ? 120 : 240,
        cohortCount,
        coveredMonthCount: windowMonths,
        marketRegimeCount: 2,
        regimeCohortCounts: {
          BULL: firstRegimeCount,
          BEAR: cohortCount - firstRegimeCount,
        },
        excessCi95Lower: 0.2,
        lowerDecileNetExcessReturnPct: 0.05,
        tailBreachRate: 0.01,
        windowStart: subtractMonthsInclusive(windowEnd, windowMonths),
        windowEnd,
        statisticsVersion: RECOMMENDATION_EVIDENCE_STATISTICS_VERSION,
        policyVersion: LONGITUDINAL_ASSURANCE_POLICY_VERSION,
        evaluatedAt: NOW,
        reasons: [],
      };
    })
  ));
}

function compensatingControls() {
  return [
    passingControl('BRANCH_PROTECTION', {
      payload: {
        artifact_hash: 'c'.repeat(64),
        reviewer_subject_hash: 'd'.repeat(64),
        branch: 'main',
        protected_ref: 'refs/heads/main',
        protected_ref_head_sha: RELEASE_SHA,
        release_relation: 'MAIN_HEAD',
        release_ancestor_verified: true,
        protection_snapshot_hash: 'e'.repeat(64),
        checks: {
          strict_status_checks: true,
          required_test_check: true,
          enforce_admins: true,
          force_pushes_disabled: true,
          deletions_disabled: true,
        },
      },
    }),
    passingControl('SECRETS_LEAST_PRIVILEGE', {
      payload: {
        api_auth_audit_passed: true,
        service_role_server_only_tested: true,
        rls_anon_write_denied_tested: true,
        deployed_rls_verified: true,
        result: 'PASS',
      },
    }),
  ];
}

function passingControl(controlKey, overrides = {}) {
  return {
    controlKey,
    latestStatus: 'PASS',
    latestObservedAt: NOW,
    latestValidUntil: isoDaysAgo(-30),
    firstPassingObservedAt: isoDaysAgo(30),
    passingObservationDays: 20,
    failedObservationCount: 0,
    releaseSha: RELEASE_SHA,
    payload: null,
    ...overrides,
  };
}

function controlsFor85() {
  return [
    ...compensatingControls(),
    passingControl('EXTERNAL_HEALTH'),
    passingControl('BACKUP_RESTORE', {
      payload: {
        encrypted: true,
        restore_drill: true,
        row_count_reconciliation: true,
        checksum_sha256: 'b'.repeat(64),
      },
    }),
    passingControl('RELEASE_CI'),
  ];
}

function controlsFor90() {
  return [
    ...compensatingControls(),
    passingControl('EXTERNAL_HEALTH', {
      firstPassingObservedAt: isoDaysAgo(90),
      passingObservationDays: 60,
    }),
    passingControl('BACKUP_RESTORE', {
      payload: {
        encrypted: true,
        restore_drill: true,
        row_count_reconciliation: true,
        checksum_sha256: 'b'.repeat(64),
      },
    }),
    passingControl('RELEASE_CI'),
    passingControl('RECOVERY_DRILL', {
      passingObservationDays: 3,
      payload: {
        encrypted: true,
        restore_drill: true,
        row_count_reconciliation: true,
        critical_query_smoke: true,
        critical_query_count: 3,
        offsite: true,
        offsite_provider: 'GITHUB_ARTIFACT',
        artifact_id: '123456',
        artifact_digest: `sha256:${'9'.repeat(64)}`,
        rto_seconds: 900,
        rto_target_seconds: 3600,
        rpo_measured: true,
        rpo_seconds: 86400,
        rpo_target_seconds: 86400,
      },
    }),
    passingControl('ACCESSIBILITY_AUTOMATED', {
      payload: {
        schema_version: 'mtn-a11y-core-matrix-v2',
        keyboard_audit_mode: 'FULL_VISIBLE_MAIN_TAB_SEQUENCE_WITH_RENDERED_INDICATOR',
        zoom_audit_mode: 'BROWSER_ZOOM_EQUIVALENT_REFLOW_AND_FIXED_PX_SCOPE',
        mobile_audit_mode: 'DOCUMENT_AND_DESCENDANT_CLIPPING',
        fixed_pixel_text_scopes_enforced: true,
        result: 'PASS',
        test_exit_code: 0,
        report_error: null,
        expected_route_count: 4,
        covered_route_count: 4,
        passed_route_count: 4,
        core_route_coverage_pct: 100,
        covered_routes: ['recommendations', 'portfolio', 'scanner', 'dashboard'],
        passed_routes: ['recommendations', 'portfolio', 'scanner', 'dashboard'],
        checks_expected: 16,
        checks_executed: 16,
        checks_passed: 16,
        axe_checks_total: 4,
        axe_checks_passed: 4,
        axe_failed_routes: [],
        keyboard_failures: 0,
        keyboard_failed_routes: [],
        zoom_200_failures: 0,
        zoom_200_failed_routes: [],
        mobile_360_overflow_failures: 0,
        mobile_360_failed_routes: [],
      },
    }),
    passingControl('ACCESSIBILITY_MANUAL', {
      sourceKind: 'MANUAL_REVIEW',
      sourceRecordId: 'e'.repeat(64),
      payload: {
        schema_version: 'mtn-a11y-manual-review-v1',
        policy_version: 'mtn-conditional-90-policy-2026.08-v1',
        result: 'PASS',
        artifact_kind: 'ACCESSIBILITY_REVIEW_REPORT',
        artifact_hash: 'e'.repeat(64),
        reviewer_subject_hash: 'f'.repeat(64),
        reviewer_authentication: 'INDEPENDENT_ASSURANCE_CREDENTIAL',
        assistive_technology: {
          name: 'VoiceOver',
          version: '15.0',
          platform: 'macOS',
        },
        routes_reviewed: ['/', '/portfolio', '/recommendations?view=metrics', '/scanner'],
        checks: {
          screenReader: true,
          keyboardOnly: true,
          focusOrder: true,
          colorIndependence: true,
          zoom200: true,
          mobile360: true,
        },
        reviewer_attestation: 'Independent reviewer completed every required accessibility route and check.',
        notes: 'No blocking accessibility defect was observed in the release.',
      },
    }),
  ];
}

function emptyPilot() {
  return {
    completedCount: 0,
    verifiedAccountCount: 0,
    spanDays: 0,
    distinctCompletionDays: 0,
    coveredCompletionMonths: 0,
    maxAuthorizedRiskR: null,
    meanRMultiple: null,
    lowerDecileRMultiple: null,
    severeLossCount: 0,
    riskBreachCount: 0,
    averageAdverseSlippagePct: null,
    p90AdverseSlippagePct: null,
    firstLinkedAt: null,
    latestOutcomeAt: null,
  };
}

function passingPilot(overrides = {}) {
  return {
    completedCount: 20,
    verifiedAccountCount: 20,
    spanDays: 180,
    distinctCompletionDays: 15,
    coveredCompletionMonths: 6,
    maxAuthorizedRiskR: 0.5,
    meanRMultiple: 0.35,
    lowerDecileRMultiple: -1,
    severeLossCount: 0,
    riskBreachCount: 0,
    averageAdverseSlippagePct: 0.2,
    p90AdverseSlippagePct: 0.8,
    firstLinkedAt: isoDaysAgo(180),
    latestOutcomeAt: NOW,
    ...overrides,
  };
}

test('control evidence identity changes when its measured payload changes', () => {
  const input = {
    controlKey: 'EXTERNAL_HEALTH',
    status: 'PASS',
    sourceKind: 'OPERATIONS_MONITOR',
    sourceRecordId: 'health-fingerprint',
    observedAt: NOW,
    validForSeconds: 3_600,
    releaseSha: RELEASE_SHA,
    payload: { backupStatus: 'HEALTHY' },
  };
  const first = buildAssuranceControlEvidenceRow(input);
  const same = buildAssuranceControlEvidenceRow(structuredClone(input));
  const changed = buildAssuranceControlEvidenceRow({
    ...input,
    payload: { backupStatus: 'FAILED' },
  });

  assert.equal(first.evidence_hash, same.evidence_hash);
  assert.notEqual(first.evidence_hash, changed.evidence_hash);
});

function inputFor85(overrides = {}) {
  return {
    now: NOW,
    currentReleaseSha: RELEASE_SHA,
    firstOfficialPublicationAt: isoDaysAgo(365),
    latestOfficialPublicationAt: NOW,
    currentEngines: currentEngines(),
    currentEnginePublicationWindows: currentEnginePublicationWindows(365),
    longitudinalEvidence: longitudinalRows(12),
    controls: controlsFor85(),
    pilot: emptyPilot(),
    ...overrides,
  };
}

function inputFor90(overrides = {}) {
  return inputFor85({
    firstOfficialPublicationAt: isoDaysAgo(730),
    currentEnginePublicationWindows: currentEnginePublicationWindows(730),
    longitudinalEvidence: [
      ...longitudinalRows(12),
      ...longitudinalRows(24),
    ],
    controls: controlsFor90(),
    pilot: passingPilot(),
    ...overrides,
  });
}

function milestone(result, score) {
  const value = result.milestones.find((item) => item.score === score);
  assert.ok(value, `missing ${score}-point milestone`);
  return value;
}

function requirement(result, score, code) {
  const value = milestone(result, score).requirements.find((item) => item.code === code);
  assert.ok(value, `missing ${score}-point requirement ${code}`);
  return value;
}

test('missing compensating-control evidence falls back to 72 while MFA stays waived', () => {
  const result = evaluateConditional90Assurance({
    now: NOW,
    currentReleaseSha: RELEASE_SHA,
    firstOfficialPublicationAt: null,
    latestOfficialPublicationAt: null,
    currentEngines: currentEngines(),
    currentEnginePublicationWindows: currentEnginePublicationWindows(0),
    longitudinalEvidence: [],
    controls: [],
    pilot: emptyPilot(),
  });

  assert.equal(result.score.verifiedScore, 72);
  assert.equal(result.score.nextMilestone, 73);
  assert.equal(result.policy.mfa.required, false);
  assert.equal(result.policy.mfa.status, 'OWNER_WAIVED');
  assert.equal(requirement(result, 73, 'MFA_POLICY').status, 'PASS');
  assert.equal(result.blockers.some((blocker) => blocker.code.includes('MFA')), false);
  assert.deepEqual(
    result.blockers.map((blocker) => blocker.code).sort(),
    ['BRANCH_PROTECTION', 'SECRETS_LEAST_PRIVILEGE'],
  );
  assert.equal(result.domains.reduce((sum, domain) => sum + domain.verified, 0), 72);
  assert.equal(result.policy.implementationBaseline.fixedAsOf, CONDITIONAL_90_IMPLEMENTATION_BASELINE_AS_OF);
  assert.equal(requirement(result, 73, 'TECHNICAL_BASELINE').evidenceAsOf, CONDITIONAL_90_IMPLEMENTATION_BASELINE_AS_OF);
  assert.notEqual(requirement(result, 73, 'TECHNICAL_BASELINE').evidenceAsOf, result.evaluatedAt);
});

test('fresh branch protection and least-privilege evidence earn the 73-point gate', () => {
  const result = evaluateConditional90Assurance({
    ...inputFor85(),
    currentEnginePublicationWindows: currentEnginePublicationWindows(0),
    longitudinalEvidence: [],
    controls: compensatingControls(),
  });

  assert.equal(result.score.verifiedScore, 73);
  assert.equal(milestone(result, 73).status, 'PASS');
  assert.equal(result.domains.reduce((sum, domain) => sum + domain.verified, 0), 73);
});

test('73 stays closed when compensating-control payload claims are incomplete', () => {
  const controls = compensatingControls();
  controls.find((control) => control.controlKey === 'SECRETS_LEAST_PRIVILEGE')
    .payload.deployed_rls_verified = false;

  const result = evaluateConditional90Assurance({
    ...inputFor85(),
    currentEnginePublicationWindows: currentEnginePublicationWindows(0),
    longitudinalEvidence: [],
    controls,
  });

  assert.equal(result.score.verifiedScore, 72);
  assert.equal(requirement(result, 73, 'SECRETS_LEAST_PRIVILEGE').status, 'WAITING');
});

test('the 12-month duration gate stays closed at 364 days and opens at exactly 365 days', () => {
  const beforeBoundary = evaluateConditional90Assurance(inputFor85({
    firstOfficialPublicationAt: isoDaysAgo(364),
    currentEnginePublicationWindows: currentEnginePublicationWindows(364),
  }));
  const atBoundary = evaluateConditional90Assurance(inputFor85());

  assert.equal(beforeBoundary.score.verifiedScore, 73);
  assert.equal(requirement(beforeBoundary, 85, 'SHADOW_DURATION_12M').status, 'WAITING');
  assert.equal(beforeBoundary.evidence.publicationSpanDays, 364);
  assert.equal(atBoundary.score.verifiedScore, 85);
  assert.equal(requirement(atBoundary, 85, 'SHADOW_DURATION_12M').status, 'PASS');
  assert.equal(atBoundary.evidence.publicationSpanDays, 365);
});

test('duration is measured per current category engine and fails on one short window', () => {
  const windows = currentEnginePublicationWindows(365);
  windows.KOSDAQ150.firstPublicationAt = isoDaysAgo(364);

  const result = evaluateConditional90Assurance(inputFor85({
    currentEnginePublicationWindows: windows,
  }));

  assert.equal(result.score.verifiedScore, 73);
  assert.equal(result.evidence.publicationSpanDays, 364);
  assert.equal(requirement(result, 85, 'SHADOW_DURATION_12M').status, 'WAITING');
});

test('a same-engine publication contract change resets both duration and longitudinal admission', () => {
  const windows = currentEnginePublicationWindows(365);
  windows.KOSDAQ150.assuranceContractHash = 'f'.repeat(64);
  windows.KOSDAQ150.firstPublicationAt = NOW;

  const result = evaluateConditional90Assurance(inputFor85({
    currentEnginePublicationWindows: windows,
  }));

  assert.equal(result.score.verifiedScore, 73);
  assert.equal(result.evidence.publicationSpanDays, 0);
  assert.equal(requirement(result, 85, 'SHADOW_DURATION_12M').status, 'WAITING');
  assert.equal(requirement(result, 85, 'LONGITUDINAL_12M').status, 'WAITING');
});

test('matured longitudinal window lag is accepted through each horizon boundary and rejected after it', () => {
  for (const [horizon, maximumLagDays] of Object.entries({ D5: 10, D20: 35, D60: 95 })) {
    const atBoundary = longitudinalRows(12);
    const boundaryRow = atBoundary.find((row) => row.category === 'NASDAQ100' && row.horizon === horizon);
    boundaryRow.windowEnd = dateDaysAgo(maximumLagDays);
    boundaryRow.windowStart = subtractMonthsInclusive(boundaryRow.windowEnd, 12);
    assert.equal(
      evaluateConditional90Assurance(inputFor85({ longitudinalEvidence: atBoundary })).score.verifiedScore,
      85,
      `${horizon} should pass at ${maximumLagDays} days`,
    );

    const beyondBoundary = longitudinalRows(12);
    const staleRow = beyondBoundary.find((row) => row.category === 'NASDAQ100' && row.horizon === horizon);
    staleRow.windowEnd = dateDaysAgo(maximumLagDays + 1);
    staleRow.windowStart = subtractMonthsInclusive(staleRow.windowEnd, 12);
    const blocked = evaluateConditional90Assurance(inputFor85({ longitudinalEvidence: beyondBoundary }));
    assert.equal(blocked.score.verifiedScore, 73, `${horizon} should fail beyond its maturity lag`);
    assert.equal(requirement(blocked, 85, 'LONGITUDINAL_12M').status, 'BLOCKED');
  }
});

test('a longitudinal window end after the latest official publication fails closed', () => {
  const evidence = longitudinalRows(12);
  evidence[0].windowEnd = dateDaysAgo(-1);
  evidence[0].windowStart = subtractMonthsInclusive(evidence[0].windowEnd, 12);

  const result = evaluateConditional90Assurance(inputFor85({ longitudinalEvidence: evidence }));

  assert.equal(result.score.verifiedScore, 73);
  assert.equal(requirement(result, 85, 'LONGITUDINAL_12M').status, 'BLOCKED');
});

test('all 12 required category by horizon gates earn 85 when the other gates pass', () => {
  const evidence = longitudinalRows(12);
  const result = evaluateConditional90Assurance(inputFor85({ longitudinalEvidence: evidence }));

  assert.equal(evidence.length, 12);
  assert.deepEqual(
    new Set(evidence.map((row) => `${row.category}:${row.horizon}`)).size,
    12,
  );
  assert.equal(result.score.verifiedScore, 85);
  assert.equal(milestone(result, 85).status, 'PASS');
  assert.equal(requirement(result, 85, 'LONGITUDINAL_12M').measured, '12/12');
});

test('the evaluator independently revalidates longitudinal provenance, freshness, population, and tails', () => {
  const invalidCases = [
    ['policy version', (row) => { row.policyVersion = 'replayed-policy'; }],
    ['statistics version', (row) => { row.statisticsVersion = 'replayed-statistics'; }],
    ['evaluation freshness', (row) => { row.evaluatedAt = isoDaysAgo(8); }],
    ['window start', (row) => { row.windowStart = '2020-01-01'; }],
    ['covered months', (row) => { row.coveredMonthCount = 9; }],
    ['sample size', (row) => { row.sampleSize = 99; }],
    ['cohort count', (row) => { row.cohortCount = 59; }],
    ['market regimes', (row) => {
      row.marketRegimeCount = 1;
      row.regimeCohortCounts = { BULL: row.cohortCount };
    }],
    ['regime balance', (row) => { row.regimeCohortCounts = { BULL: 55, BEAR: 5 }; }],
    ['confidence interval', (row) => { row.excessCi95Lower = 0; }],
    ['lower decile', (row) => { row.lowerDecileNetExcessReturnPct = -0.0001; }],
    ['tail rate', (row) => { row.tailBreachRate = 0.0501; }],
  ];

  for (const [label, invalidate] of invalidCases) {
    const evidence = longitudinalRows(12);
    invalidate(evidence[0]);
    const result = evaluateConditional90Assurance(inputFor85({ longitudinalEvidence: evidence }));
    assert.equal(result.score.verifiedScore, 73, `${label} must fail closed`);
    assert.equal(requirement(result, 85, 'LONGITUDINAL_12M').status, 'BLOCKED', label);
    assert.equal(requirement(result, 85, 'LONGITUDINAL_12M').measured, '11/12', label);
  }
});

test('release-scoped CI and automated accessibility fail closed without a current release SHA', () => {
  const result85 = evaluateConditional90Assurance(inputFor85({ currentReleaseSha: null }));
  const result90 = evaluateConditional90Assurance(inputFor90({ currentReleaseSha: null }));

  assert.equal(result85.score.verifiedScore, 72);
  assert.equal(requirement(result85, 73, 'BRANCH_PROTECTION').status, 'WAITING');
  assert.equal(requirement(result85, 85, 'RELEASE_CI_CURRENT').status, 'WAITING');
  assert.equal(requirement(result90, 90, 'ACCESSIBILITY_AUTOMATED').status, 'WAITING');
});

test('one confidence-interval gate failure blocks the entire 85-point milestone at 73', () => {
  const evidence = longitudinalRows(12);
  evidence[0] = {
    ...evidence[0],
    gateStatus: 'BLOCKED',
    excessCi95Lower: 0,
    reasons: ['EXCESS_CI95_LOWER_NOT_POSITIVE'],
  };

  const result = evaluateConditional90Assurance(inputFor85({ longitudinalEvidence: evidence }));

  assert.equal(result.score.verifiedScore, 73);
  assert.equal(requirement(result, 85, 'LONGITUDINAL_12M').status, 'BLOCKED');
  assert.equal(result.blockers.find((item) => item.code === 'LONGITUDINAL_12M')?.severity, 'STATISTICAL_FAILURE');
});

test('one tail gate failure blocks the entire 85-point milestone at 73', () => {
  const evidence = longitudinalRows(12);
  evidence.at(-1).gateStatus = 'BLOCKED';
  evidence.at(-1).tailBreachRate = 0.2;
  evidence.at(-1).reasons = ['TAIL_BREACH_RATE_EXCEEDED'];

  const result = evaluateConditional90Assurance(inputFor85({ longitudinalEvidence: evidence }));

  assert.equal(result.score.verifiedScore, 73);
  assert.equal(requirement(result, 85, 'LONGITUDINAL_12M').status, 'BLOCKED');
});

test('24-month evidence, a boundary-safe pilot, recovery, accessibility, and 90-day operations earn 90', () => {
  const result = evaluateConditional90Assurance(inputFor90());

  assert.equal(result.score.verifiedScore, 90);
  assert.equal(result.score.nextMilestone, null);
  assert.equal(milestone(result, 85).status, 'PASS');
  assert.equal(milestone(result, 90).status, 'PASS');
  assert.equal(requirement(result, 90, 'LIVE_PILOT').status, 'PASS');
  assert.equal(requirement(result, 90, 'OPERATIONS_90D').status, 'PASS');
  assert.equal(result.disposition, 'ELIGIBLE_FOR_HUMAN_REVIEW');
  assert.equal(result.capitalApproval, 'NOT_GRANTED');
});

test('recovery cannot pass from target constants without measured RPO and offsite artifact evidence', () => {
  const controls = controlsFor90();
  const recovery = controls.find((control) => control.controlKey === 'RECOVERY_DRILL');
  delete recovery.payload.rpo_measured;
  delete recovery.payload.artifact_digest;

  const result = evaluateConditional90Assurance(inputFor90({ controls }));

  assert.equal(result.score.verifiedScore, 85);
  assert.notEqual(requirement(result, 90, 'RECOVERY_DRILLS').status, 'PASS');
});

test('recovery accepts only GitHub artifact digests and fixed measured RTO/RPO targets', () => {
  for (const artifactDigest of ['sha256:fixture', 'g'.repeat(64), `sha512:${'a'.repeat(64)}`]) {
    const controls = controlsFor90();
    controls.find((control) => control.controlKey === 'RECOVERY_DRILL')
      .payload.artifact_digest = artifactDigest;
    const result = evaluateConditional90Assurance(inputFor90({ controls }));
    assert.equal(result.score.verifiedScore, 85, artifactDigest);
  }

  const bareDigestControls = controlsFor90();
  bareDigestControls.find((control) => control.controlKey === 'RECOVERY_DRILL')
    .payload.artifact_digest = 'a'.repeat(64);
  assert.equal(evaluateConditional90Assurance(inputFor90({
    controls: bareDigestControls,
  })).score.verifiedScore, 90);

  const inflatedTargetControls = controlsFor90();
  inflatedTargetControls.find((control) => control.controlKey === 'RECOVERY_DRILL')
    .payload.rpo_target_seconds = 999_999;
  assert.equal(evaluateConditional90Assurance(inputFor90({
    controls: inflatedTargetControls,
  })).score.verifiedScore, 85);
});

test('the 24-month gate stays closed when one current category engine has only 729 days', () => {
  const windows = currentEnginePublicationWindows(730);
  windows.SP500.firstPublicationAt = isoDaysAgo(729);

  const result = evaluateConditional90Assurance(inputFor90({
    currentEnginePublicationWindows: windows,
  }));

  assert.equal(result.score.verifiedScore, 85);
  assert.equal(result.evidence.publicationSpanDays, 729);
  assert.equal(requirement(result, 90, 'SHADOW_DURATION_24M').status, 'WAITING');
});

test('automated accessibility independently validates the complete 4-route by 4-check matrix', () => {
  const invalidCases = [
    ['schema', (payload) => { payload.schema_version = 'legacy-summary'; }],
    ['result', (payload) => { payload.result = 'FAIL'; }],
    ['route coverage', (payload) => { payload.covered_route_count = 3; }],
    ['route identity', (payload) => { payload.passed_routes = ['recommendations', 'portfolio', 'scanner', 'other']; }],
    ['check execution', (payload) => { payload.checks_executed = 15; }],
    ['axe matrix', (payload) => { payload.axe_checks_passed = 3; }],
    ['failed route list', (payload) => { payload.keyboard_failed_routes = ['dashboard']; }],
  ];

  for (const [label, invalidate] of invalidCases) {
    const controls = controlsFor90();
    const accessibility = controls.find((control) => control.controlKey === 'ACCESSIBILITY_AUTOMATED');
    invalidate(accessibility.payload);
    const result = evaluateConditional90Assurance(inputFor90({ controls }));
    assert.equal(result.score.verifiedScore, 85, `${label} must fail closed`);
    assert.notEqual(requirement(result, 90, 'ACCESSIBILITY_AUTOMATED').status, 'PASS', label);
  }
});

test('pilot dispersion requires at least 15 completion days and six completion months', () => {
  const tooFewDays = evaluateConditional90Assurance(inputFor90({
    pilot: passingPilot({ distinctCompletionDays: 14 }),
  }));
  const tooFewMonths = evaluateConditional90Assurance(inputFor90({
    pilot: passingPilot({ coveredCompletionMonths: 5 }),
  }));

  assert.equal(tooFewDays.score.verifiedScore, 85);
  assert.equal(tooFewMonths.score.verifiedScore, 85);
  assert.notEqual(requirement(tooFewDays, 90, 'LIVE_PILOT').status, 'PASS');
  assert.notEqual(requirement(tooFewMonths, 90, 'LIVE_PILOT').status, 'PASS');
  assert.equal(evaluateConditional90Assurance(inputFor90({
    pilot: passingPilot({ distinctCompletionDays: 15, coveredCompletionMonths: 6 }),
  })).score.verifiedScore, 90);
});

test('one early pilot outcome plus 19 last-day outcomes cannot satisfy dispersion', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    authorizedRiskR: 0.25,
    rMultiple: 0.2,
    adverseSlippagePct: 0.1,
    riskBreach: false,
    linkedAt: index === 0 ? isoDaysAgo(180) : NOW,
    exitAt: index === 0 ? isoDaysAgo(180) : NOW,
    verifiedAccountActual: true,
  }));
  const pilot = summarizePilotEvidence(rows);
  const result = evaluateConditional90Assurance(inputFor90({ pilot }));

  assert.equal(pilot.completedCount, 20);
  assert.equal(pilot.spanDays, 180);
  assert.equal(pilot.distinctCompletionDays, 2);
  assert.equal(pilot.coveredCompletionMonths, 2);
  assert.equal(result.score.verifiedScore, 85);
});

test('a completed pilot with a missing outcome remains in the denominator and fails closed', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    authorizedRiskR: 0.25,
    rMultiple: index === 19 ? null : 0.2,
    adverseSlippagePct: index === 19 ? null : 0.1,
    riskBreach: false,
    linkedAt: isoDaysAgo(180 - index),
    exitAt: index === 19 ? null : isoDaysAgo(18 - index),
    verifiedAccountActual: index !== 19,
  }));

  const pilot = summarizePilotEvidence(rows);
  const result = evaluateConditional90Assurance(inputFor90({ pilot }));

  assert.equal(pilot.completedCount, 20);
  assert.equal(pilot.verifiedAccountCount, 19);
  assert.equal(pilot.meanRMultiple, null);
  assert.equal(pilot.p90AdverseSlippagePct, null);
  assert.equal(result.score.verifiedScore, 85);
});

test('backup evidence needs an actual SHA-256 checksum, not a truthy label', () => {
  const controls = controlsFor85();
  const backup = controls.find((control) => control.controlKey === 'BACKUP_RESTORE');
  backup.payload.checksum_sha256 = 'checksum-present';

  const result = evaluateConditional90Assurance(inputFor85({ controls }));

  assert.equal(result.score.verifiedScore, 73);
  assert.equal(requirement(result, 85, 'BACKUP_RESTORE_CURRENT').status, 'WAITING');
});

test('a pilot risk authorization of 0.5001R keeps the score below 90', () => {
  const result = evaluateConditional90Assurance(inputFor90({
    pilot: passingPilot({ maxAuthorizedRiskR: 0.5001 }),
  }));

  assert.equal(result.score.verifiedScore, 85);
  assert.notEqual(requirement(result, 90, 'LIVE_PILOT').status, 'PASS');
  assert.ok(result.blockers.some((item) => item.code === 'LIVE_PILOT'));
});

test('one loss at the severe-loss boundary of -2R keeps the score below 90', () => {
  const result = evaluateConditional90Assurance(inputFor90({
    pilot: passingPilot({ severeLossCount: 1 }),
  }));

  assert.equal(result.score.verifiedScore, 85);
  assert.notEqual(requirement(result, 90, 'LIVE_PILOT').status, 'PASS');
  assert.equal(result.capitalApproval, 'NOT_GRANTED');
});

test('missing manual accessibility evidence keeps the score below 90', () => {
  const result = evaluateConditional90Assurance(inputFor90({
    controls: controlsFor90().filter((control) => control.controlKey !== 'ACCESSIBILITY_MANUAL'),
  }));

  assert.equal(result.score.verifiedScore, 85);
  assert.equal(requirement(result, 90, 'ACCESSIBILITY_MANUAL').status, 'WAITING');
  assert.ok(result.blockers.some((item) => item.code === 'ACCESSIBILITY_MANUAL'));
});

test('manual accessibility PASS fails closed when reviewer, artifact, or exact core-route evidence is malformed', () => {
  const invalidCases = [
    ['ordinary source', (control) => { control.sourceKind = 'DEPLOYMENT'; }],
    ['wrong source record', (control) => { control.sourceRecordId = '0'.repeat(64); }],
    ['partial routes', (control) => { control.payload.routes_reviewed = ['/']; }],
    ['unstructured assistive technology', (control) => { control.payload.assistive_technology = 'screen reader'; }],
    ['missing independent reviewer marker', (control) => { delete control.payload.reviewer_authentication; }],
    ['short attestation', (control) => { control.payload.reviewer_attestation = 'reviewed'; }],
  ];
  for (const [label, mutate] of invalidCases) {
    const controls = controlsFor90();
    const manual = controls.find((control) => control.controlKey === 'ACCESSIBILITY_MANUAL');
    mutate(manual);
    const result = evaluateConditional90Assurance(inputFor90({ controls }));
    assert.equal(result.score.verifiedScore, 85, label);
    assert.notEqual(requirement(result, 90, 'ACCESSIBILITY_MANUAL').status, 'PASS', label);
  }
});

test('pilot summary uses nearest-rank p90 slippage and the mean of the lower decile', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({
    authorizedRiskR: 0.25,
    rMultiple: index === 0 ? -1.1 : index === 1 ? -0.9 : 0.2 + (index / 100),
    adverseSlippagePct: (index + 1) / 100,
    riskBreach: false,
    linkedAt: isoDaysAgo(180 - index),
    exitAt: isoDaysAgo(19 - index),
    verifiedAccountActual: true,
  }));

  const summary = summarizePilotEvidence(rows);

  assert.equal(summary.completedCount, 20);
  assert.equal(summary.verifiedAccountCount, 20);
  assert.equal(summary.distinctCompletionDays, 20);
  assert.equal(summary.coveredCompletionMonths, 2);
  assert.equal(summary.lowerDecileRMultiple, -1);
  assert.equal(summary.p90AdverseSlippagePct, 0.18);
  assert.equal(summary.severeLossCount, 0);
});
