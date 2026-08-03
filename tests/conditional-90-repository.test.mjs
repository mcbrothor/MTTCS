import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, {
  interopDefault: true,
  alias: { '@': path.resolve('.') },
});

const {
  CONDITIONAL_90_REQUIRED_CATEGORIES,
  evaluateConditional90Assurance,
} = jiti('../lib/assurance/conditional-90.ts');
const {
  assuranceSnapshotInsertRow,
  backupControlRows,
  readConditional90Assurance,
} = jiti('../lib/assurance/repository.ts');

const RELEASE_SHA = 'a'.repeat(40);

function emptyPilot() {
  return {
    completedCount: 0,
    verifiedAccountCount: 0,
    spanDays: 0,
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

function scorecard(now, controls = []) {
  const currentEngines = Object.fromEntries(
    CONDITIONAL_90_REQUIRED_CATEGORIES.map((category) => [category, `${category}-v1`]),
  );
  const currentEnginePublicationWindows = Object.fromEntries(
    CONDITIONAL_90_REQUIRED_CATEGORIES.map((category) => [category, {
      engineVersion: `${category}-v1`,
      assuranceContractHash: String(CONDITIONAL_90_REQUIRED_CATEGORIES.indexOf(category) + 1).repeat(64),
      firstPublicationAt: now,
      latestPublicationAt: now,
    }]),
  );
  return evaluateConditional90Assurance({
    now,
    currentReleaseSha: RELEASE_SHA,
    firstOfficialPublicationAt: null,
    latestOfficialPublicationAt: null,
    currentEngines,
    currentEnginePublicationWindows,
    longitudinalEvidence: [],
    controls,
    pilot: emptyPilot(),
  });
}

function passingControl(controlKey, now) {
  const payload = controlKey === 'BRANCH_PROTECTION'
    ? {
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
      }
    : controlKey === 'SECRETS_LEAST_PRIVILEGE'
      ? {
          api_auth_audit_passed: true,
          service_role_server_only_tested: true,
          rls_anon_write_denied_tested: true,
          deployed_rls_verified: true,
          result: 'PASS',
        }
      : null;
  return {
    controlKey,
    latestStatus: 'PASS',
    latestObservedAt: now,
    latestValidUntil: '2026-12-31T00:00:00.000Z',
    firstPassingObservedAt: now,
    passingObservationDays: 1,
    failedObservationCount: 0,
    releaseSha: RELEASE_SHA,
    payload,
  };
}

test('same evidence is deduplicated per UTC evaluation day while changed evidence is retained', () => {
  const morning = scorecard('2026-08-03T01:00:00.000Z');
  const evening = scorecard('2026-08-03T23:59:59.000Z');
  const sameUtcDayInSeoul = scorecard('2026-08-04T08:59:59.000+09:00');
  const nextDay = scorecard('2026-08-04T00:00:00.000Z');
  const manifest = { publications: ['p1'], controls: ['c1'] };

  const morningRow = assuranceSnapshotInsertRow(morning, manifest);
  const eveningRow = assuranceSnapshotInsertRow(evening, manifest);
  const sameUtcDayInSeoulRow = assuranceSnapshotInsertRow(sameUtcDayInSeoul, manifest);
  const nextDayRow = assuranceSnapshotInsertRow(nextDay, manifest);
  const changedEvidenceRow = assuranceSnapshotInsertRow(evening, {
    publications: ['p1', 'p2'],
    controls: ['c1'],
  });

  assert.equal(morningRow.snapshot_hash, eveningRow.snapshot_hash);
  assert.equal(eveningRow.snapshot_hash, sameUtcDayInSeoulRow.snapshot_hash);
  assert.notEqual(morningRow.snapshot_hash, nextDayRow.snapshot_hash);
  assert.notEqual(eveningRow.snapshot_hash, changedEvidenceRow.snapshot_hash);
  assert.equal(morningRow.evidence_manifest_hash.length, 64);
});

test('snapshot technical gate and domain total reflect the 72-to-73 compensating-control gate', () => {
  const now = '2026-08-03T12:00:00.000Z';
  const fallback = assuranceSnapshotInsertRow(scorecard(now), {});
  const gated = assuranceSnapshotInsertRow(scorecard(now, [
    passingControl('BRANCH_PROTECTION', now),
    passingControl('SECRETS_LEAST_PRIVILEGE', now),
  ]), {});

  const scoreColumns = [
    'investment_score',
    'data_score',
    'strategy_score',
    'risk_score',
    'software_score',
    'operations_score',
    'security_score',
    'system_ui_score',
  ];
  assert.equal(fallback.technical_gate_passed, false);
  assert.equal(gated.technical_gate_passed, true);
  for (const gate of [
    'duration_24m_gate_passed',
    'longitudinal_24m_gate_passed',
    'recovery_gate_passed',
    'operations_90d_gate_passed',
  ]) {
    assert.equal(fallback[gate], false, `${gate} must be captured fail-closed`);
  }
  assert.equal(scoreColumns.reduce((sum, key) => sum + fallback[key], 0), 72);
  assert.equal(scoreColumns.reduce((sum, key) => sum + gated[key], 0), 73);
});

test('repository resolves each current engine window from official published rows only', async () => {
  const queries = [];
  const publicationRows = Object.fromEntries(CONDITIONAL_90_REQUIRED_CATEGORIES.map((category) => [category, {
    first: {
      run_date: '2025-08-03',
      category,
      engine_version: `${category}-v1`,
      assurance_contract_hash: String(CONDITIONAL_90_REQUIRED_CATEGORIES.indexOf(category) + 1).repeat(64),
    },
    latest: {
      run_date: '2026-08-03',
      category,
      engine_version: `${category}-v1`,
      assurance_contract_hash: String(CONDITIONAL_90_REQUIRED_CATEGORIES.indexOf(category) + 1).repeat(64),
    },
  }]));

  function resolveQuery(query) {
    if (query.table === 'recommendation_publications') {
      const category = query.filters.find((filter) => filter.column === 'category')?.value;
      const contractHash = query.filters.find((filter) => filter.column === 'assurance_contract_hash')?.value;
      return { data: contractHash ? publicationRows[category].first : publicationRows[category].latest, error: null };
    }
    return {
      data: [],
      error: null,
      count: query.table === 'recommendation_pilot_links'
        || query.table === 'recommendation_pilot_outcomes' ? 0 : null,
    };
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      queries.push(this);
    }

    select() { return this; }
    eq(column, value) { this.filters.push({ column, value }); return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { return Promise.resolve(resolveQuery(this)); }
    then(resolve, reject) { return Promise.resolve(resolveQuery(this)).then(resolve, reject); }
  }

  const result = await readConditional90Assurance({
    client: { from: (table) => new Query(table) },
    now: '2026-08-03T12:00:00.000Z',
    releaseSha: RELEASE_SHA,
    persistSnapshot: false,
  });

  const publicationQueries = queries.filter((query) => query.table === 'recommendation_publications');
  assert.equal(publicationQueries.length, 8);
  assert.ok(publicationQueries.every((query) => query.filters.some((filter) => (
    filter.column === 'is_official' && filter.value === true
  ))));
  assert.ok(publicationQueries.every((query) => query.filters.some((filter) => (
    filter.column === 'status' && filter.value === 'PUBLISHED'
  ))));
  assert.equal(publicationQueries.filter((query) => query.filters.some((filter) => (
    filter.column === 'assurance_contract_hash'
  ))).length, 4);
  assert.equal(publicationQueries.filter((query) => query.filters.some((filter) => (
    filter.column === 'engine_version'
  ))).length, 0);
  assert.equal(result.evidence.publicationSpanDays, 365);
});

test('backup derivation preserves every run and only complete successful evidence passes', () => {
  const completeMetadata = {
    restore_drill: true,
    row_count_reconciliation: true,
    release_sha: RELEASE_SHA,
  };
  const rows = backupControlRows([
    {
      id: 1,
      status: 'SUCCESS',
      completed_at: '2026-08-01T00:00:00.000Z',
      encrypted: true,
      checksum_sha256: 'b'.repeat(64),
      metadata: completeMetadata,
    },
    {
      id: 2,
      status: 'SUCCESS',
      completed_at: '2026-08-02T00:00:00.000Z',
      encrypted: false,
      checksum_sha256: 'not-a-sha256',
      metadata: completeMetadata,
    },
    {
      id: 3,
      status: 'FAILED',
      completed_at: '2026-08-03T00:00:00.000Z',
      encrypted: true,
      checksum_sha256: 'c'.repeat(64),
      metadata: completeMetadata,
    },
  ]);

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.status), ['PASS', 'INCONCLUSIVE', 'FAIL']);
  assert.ok(rows[1].payload.qualification_reasons.includes('CHECKSUM_INVALID'));
  assert.ok(rows[1].payload.qualification_reasons.includes('BACKUP_NOT_ENCRYPTED'));
  assert.notEqual(rows[0].evidence_hash, rows[2].evidence_hash);
});

function repositoryClient(resolver) {
  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
    }

    select() { return this; }
    eq(column, value) { this.filters.push({ column, value }); return this; }
    order() { return this; }
    limit() { return this; }
    maybeSingle() { return Promise.resolve(resolver(this)); }
    then(resolve, reject) { return Promise.resolve(resolver(this)).then(resolve, reject); }
  }
  return { from: (table) => new Query(table) };
}

function emptyRepositoryResult(table) {
  return {
    data: [],
    error: null,
    count: table === 'recommendation_pilot_links' || table === 'recommendation_pilot_outcomes' ? 0 : null,
  };
}

test('completed or 95-day-overdue pilot links stay in the denominator while recent open links do not', async () => {
  const client = repositoryClient((query) => {
    if (query.table === 'recommendation_publications') return { data: null, error: null };
    if (query.table === 'recommendation_pilot_links') {
      return {
        data: [
          { id: 'link-1', trade_id: 'trade-1', authorized_risk_r: 0.25, linked_at: '2026-01-01T00:00:00.000Z', trades: { status: 'COMPLETED' } },
          { id: 'link-2', trade_id: 'trade-2', authorized_risk_r: 0.25, linked_at: '2026-02-01T00:00:00.000Z', trades: { status: 'ACTIVE' } },
          { id: 'link-3', trade_id: 'trade-3', authorized_risk_r: 0.25, linked_at: '2026-07-15T00:00:00.000Z', trades: { status: 'ACTIVE' } },
        ],
        error: null,
        count: 3,
      };
    }
    if (query.table === 'recommendation_pilot_outcomes') {
      return {
        data: [{
          id: 'outcome-1',
          pilot_link_id: 'link-1',
          broker_evidence_review_id: 'review-1',
          evidence_status: 'VERIFIED',
          source_kind: 'BROKER_STATEMENT',
          r_multiple: 0.5,
          adverse_slippage_pct: 0.1,
          risk_breach: false,
          exit_at: '2026-03-01T00:00:00.000Z',
          observed_at: '2026-08-03T00:00:00.000Z',
          created_at: '2026-08-03T00:00:00.000Z',
        }],
        error: null,
        count: 1,
      };
    }
    return emptyRepositoryResult(query.table);
  });

  const result = await readConditional90Assurance({
    client,
    now: '2026-08-03T12:00:00.000Z',
    releaseSha: RELEASE_SHA,
    persistSnapshot: false,
  });
  const pilotRequirement = result.milestones
    .find((milestone) => milestone.score === 90).requirements
    .find((requirement) => requirement.code === 'LIVE_PILOT');

  assert.match(pilotRequirement.measured, /^1\/2건·59일/);
  assert.match(pilotRequirement.measured, /연체미정산 1건/);
  assert.equal(pilotRequirement.evidenceAsOf, '2026-03-01T00:00:00.000Z');
  assert.notEqual(pilotRequirement.status, 'PASS');
});

test('pilot ledgers fail closed when exact counts reveal a 1,000-row truncation', async () => {
  const client = repositoryClient((query) => {
    if (query.table === 'recommendation_publications') return { data: null, error: null };
    if (query.table === 'recommendation_pilot_links') {
      return { data: [], error: null, count: 1_001 };
    }
    return emptyRepositoryResult(query.table);
  });

  await assert.rejects(
    readConditional90Assurance({
      client,
      now: '2026-08-03T12:00:00.000Z',
      releaseSha: RELEASE_SHA,
      persistSnapshot: false,
    }),
    /exact count 1001 does not match 0 returned rows; refusing truncated evidence/,
  );
});
