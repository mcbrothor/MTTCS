import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ci = readFileSync(new URL('../.github/workflows/e2e-tests.yml', import.meta.url), 'utf8');
const backup = readFileSync(new URL('../.github/workflows/db-backup.yml', import.meta.url), 'utf8');
const a11y = readFileSync(new URL('./e2e/a11y.spec.ts', import.meta.url), 'utf8');
const supabaseServer = readFileSync(new URL('../lib/supabase/server.ts', import.meta.url), 'utf8');
const assuranceMigration = readFileSync(
  new URL('../supabase/migrations/20260803100000_conditional_90_assurance.sql', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(typeof packageJson.devDependencies['@axe-core/playwright'], 'string');
assert.match(a11y, /@axe-core\/playwright/);
const routeBlock = a11y.match(/const CORE_A11Y_ROUTES = \[([\s\S]*?)\] as const;/)?.[1] || '';
const coveredRouteKeys = [...routeBlock.matchAll(/key: '([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(coveredRouteKeys, ['recommendations', 'portfolio', 'scanner', 'dashboard']);
assert.match(a11y, /for \(const route of CORE_A11Y_ROUTES\)/);
assert.match(a11y, /A11Y-CORE::\$\{route\.key\}::axe/);
assert.match(a11y, /A11Y-CORE::\$\{route\.key\}::keyboard/);
assert.match(a11y, /A11Y-CORE::\$\{route\.key\}::zoom-200/);
assert.match(a11y, /A11Y-CORE::\$\{route\.key\}::mobile-360/);
assert.match(a11y, /violation\.impact === 'serious'.*violation\.impact === 'critical'/s);
assert.match(a11y, /auditMainKeyboardTraversal/);
assert.match(a11y, /focusIndicatorFailures/);
assert.match(a11y, /window\.innerWidth/);
assert.match(a11y, /fixedPixelTextClassesInResizeScopes/);
assert.match(a11y, /width: 360/);

assert.match(ci, /assurance_control_evidence/);
assert.match(ci, /control_key:\"RELEASE_CI\"/);
assert.match(ci, /control_key:\"ACCESSIBILITY_AUTOMATED\"/);
assert.match(ci, /PLAYWRIGHT_JSON_OUTPUT_NAME=\"\$report_path\"/);
assert.match(ci, /a11y-summary\.json/);
assert.match(ci, /report_dir=\"assurance-results\"/);
assert.match(ci, /schema_summary=\"assurance-results\/schema-drift\.json\"/);
assert.doesNotMatch(ci, /test-results\/assurance/);
assert.match(ci, /coveredRouteCount/);
assert.match(ci, /passedRouteCount/);
assert.match(ci, /matrixComplete/);
assert.match(ci, /core_route_coverage_pct: Math\.floor/);
assert.match(ci, /axe_failed_routes: failuresFor\('axe'\)/);
assert.match(ci, /keyboard_failures: failuresFor\('keyboard'\)\.length/);
assert.match(ci, /zoom_200_failures: failuresFor\('zoom-200'\)\.length/);
assert.match(ci, /mobile_360_overflow_failures: failuresFor\('mobile-360'\)\.length/);
assert.match(ci, /steps\.core_a11y\.outputs\.result/);
assert.doesNotMatch(ci, /core_route_coverage_pct:100/);
assert.doesNotMatch(ci, /axe_serious:0/);
assert.doesNotMatch(ci, /axe_critical:0/);
assert.match(ci, /cron:\s*'17 2 \* \* 0'/);
assert.match(ci, /failure\(\).*github\.ref == 'refs\/heads\/main'.*github\.event_name != 'pull_request'/);
assert.match(ci, /a11y_status=\"\$\(jq -r 'if \.result == \"PASS\" then \"PASS\" else \"FAIL\" end'/);

const aggregatorSource = ci.match(
  /TEST_EXIT=\"\$test_exit\" node <<'NODE'\n([\s\S]*?)\n        NODE/,
)?.[1];
assert.ok(aggregatorSource, 'workflow accessibility result aggregator must be extractable');
const matrixRoutes = ['recommendations', 'portfolio', 'scanner', 'dashboard'];
const matrixChecks = ['axe', 'keyboard', 'zoom-200', 'mobile-360'];
const makeSpec = (route, check, status = 'passed') => ({
  title: `A11Y-CORE::${route}::${check}`,
  ok: status === 'passed',
  tests: [{ results: [{ status }] }],
});
const tempDirectory = mkdtempSync(join(tmpdir(), 'mtn-a11y-workflow-'));
const reportPath = join(tempDirectory, 'report.json');
const summaryPath = join(tempDirectory, 'summary.json');

try {
  const specs = matrixRoutes.flatMap((route) => matrixChecks.map((check) => makeSpec(route, check)));
  writeFileSync(reportPath, JSON.stringify({ suites: [{ suites: [{ specs }] }] }));
  const passingRun = spawnSync(process.execPath, ['-e', aggregatorSource], {
    encoding: 'utf8',
    env: { ...process.env, REPORT_PATH: reportPath, SUMMARY_PATH: summaryPath, TEST_EXIT: '0' },
  });
  assert.equal(passingRun.status, 0, passingRun.stderr);
  const passingSummary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  assert.equal(passingSummary.schema_version, 'mtn-a11y-core-matrix-v2');
  assert.equal(passingSummary.keyboard_audit_mode, 'FULL_VISIBLE_MAIN_TAB_SEQUENCE_WITH_RENDERED_INDICATOR');
  assert.equal(passingSummary.zoom_audit_mode, 'BROWSER_ZOOM_EQUIVALENT_REFLOW_AND_FIXED_PX_SCOPE');
  assert.equal(passingSummary.mobile_audit_mode, 'DOCUMENT_AND_DESCENDANT_CLIPPING');
  assert.equal(passingSummary.fixed_pixel_text_scopes_enforced, true);
  assert.equal(passingSummary.result, 'PASS');
  assert.equal(passingSummary.expected_route_count, 4);
  assert.equal(passingSummary.covered_route_count, 4);
  assert.equal(passingSummary.passed_route_count, 4);
  assert.equal(passingSummary.core_route_coverage_pct, 100);
  assert.equal(passingSummary.checks_expected, 16);
  assert.equal(passingSummary.checks_executed, 16);
  assert.equal(passingSummary.checks_passed, 16);
  assert.equal(passingSummary.axe_checks_total, 4);
  assert.equal(passingSummary.axe_checks_passed, 4);
  assert.deepEqual(passingSummary.axe_failed_routes, []);
  assert.equal(passingSummary.keyboard_failures, 0);
  assert.deepEqual(passingSummary.keyboard_failed_routes, []);
  assert.equal(passingSummary.zoom_200_failures, 0);
  assert.deepEqual(passingSummary.zoom_200_failed_routes, []);
  assert.equal(passingSummary.mobile_360_overflow_failures, 0);
  assert.deepEqual(passingSummary.mobile_360_failed_routes, []);

  const failingSpecs = specs.map((spec) => (
    spec.title === 'A11Y-CORE::portfolio::axe' ? makeSpec('portfolio', 'axe', 'failed') : spec
  ));
  writeFileSync(reportPath, JSON.stringify({ suites: [{ suites: [{ specs: failingSpecs }] }] }));
  const failingRun = spawnSync(process.execPath, ['-e', aggregatorSource], {
    encoding: 'utf8',
    env: { ...process.env, REPORT_PATH: reportPath, SUMMARY_PATH: summaryPath, TEST_EXIT: '1' },
  });
  assert.equal(failingRun.status, 0, failingRun.stderr);
  const failingSummary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  assert.equal(failingSummary.result, 'FAIL');
  assert.equal(failingSummary.covered_route_count, 4);
  assert.equal(failingSummary.passed_route_count, 3);
  assert.equal(failingSummary.checks_passed, 15);
  assert.equal(failingSummary.axe_checks_passed, 3);
  assert.deepEqual(failingSummary.axe_failed_routes, ['portfolio']);
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

assert.match(ci, /control_key:\"SECRETS_LEAST_PRIVILEGE\"/);
assert.match(ci, /api_auth_audit_passed:true/);
assert.match(ci, /service_role_server_only_tested:true/);
assert.match(ci, /rls_anon_write_denied_tested:true/);
assert.match(ci, /deployed_rls_verified:true/);
assert.match(ci, /verify-assurance-schema-drift\.mjs/);
assert.match(ci, /schema_drift_verified:true/);
assert.match(ci, /migration_sha256:\$migration_sha256/);
assert.match(ci, /migration_sha256s:\$migration_sha256s/);
assert.match(ci, /deployed_definition_fingerprint:\$deployed_definition_fingerprint/);
assert.match(ci, /control_scope_version:"mtn-api-auth-rls-schema-integrity-v1"/);
assert.match(ci, /claim_scope:"API_AUTH_SERVICE_ROLE_SERVER_ONLY_DEPLOYED_RLS_SCHEMA_INTEGRITY"/);
assert.match(ci, /separately_required_control:"BRANCH_PROTECTION"/);
assert.match(ci, /explicitly_not_measured:\["secret-rotation","environment-secret-separation"\]/);
assert.doesNotMatch(ci, /secret_rotation_(?:verified|passed):true/);
assert.doesNotMatch(ci, /environment_(?:secret_)?separation_(?:verified|passed):true/);
assert.match(ci, /has_table_privilege\('anon', 'public\.assurance_control_evidence', 'INSERT'\)/);
assert.match(ci, /has_table_privilege\('authenticated', 'public\.assurance_control_evidence', 'INSERT'\)/);
assert.match(ci, /has_table_privilege\('service_role', 'public\.assurance_control_evidence', 'INSERT'\)/);
assert.match(ci, /row\.rls_enabled !== true/);
assert.match(ci, /api_auth_audit_passed:false/);
assert.match(ci, /deployed_rls_verified:false/);
assert.match(ci, /schema_drift_verified:false/);
assert.match(ci, /SECRETS_LEAST_PRIVILEGE:\$\{GITHUB_SHA\}:\$\{source_record_id\}:FAIL/);
assert.match(ci, /tests\/security-hardening\.test\.mjs/);
assert.match(ci, /tests\/conditional-90-workflows\.test\.mjs/);

assert.match(supabaseServer, /typeof window !== 'undefined'/);
assert.match(supabaseServer, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(supabaseServer, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
assert.match(assuranceMigration, /alter table public\.assurance_control_evidence enable row level security/i);
assert.match(
  assuranceMigration,
  /revoke all on table public\.assurance_control_evidence from public, anon, authenticated/i,
);
assert.match(
  assuranceMigration,
  /grant select, insert on table public\.assurance_control_evidence to service_role/i,
);
assert.doesNotMatch(
  assuranceMigration,
  /grant\s+(?:insert|update|delete|all)[^;]+to\s+(?:anon|authenticated)/i,
);

assert.match(backup, /postgresql-client-17/);
assert.match(backup, /critical_table_count/);
assert.match(backup, /rto_seconds/);
assert.match(backup, /rpo_(?:target_)?seconds:86400/);
assert.match(backup, /critical_query_smoke:true/);
assert.match(backup, /row_count_reconciliation:true/);
assert.match(backup, /offsite:true/);
assert.match(backup, /control_key:\"BACKUP_RESTORE\"/);
assert.match(backup, /control_key:\"RECOVERY_DRILL\"/);
assert.match(backup, /status:\"FAIL\"/);

console.log('conditional 90 CI, accessibility, backup, and recovery workflow tests passed');
