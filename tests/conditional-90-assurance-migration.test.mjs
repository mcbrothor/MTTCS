import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260803100000_conditional_90_assurance.sql', import.meta.url),
  'utf8',
);

for (const table of [
  'recommendation_longitudinal_evaluations',
  'recommendation_decision_events',
  'recommendation_pilot_links',
  'recommendation_pilot_outcomes',
  'assurance_control_evidence',
  'assurance_score_snapshots',
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, 'i'));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  assert.match(migration, new RegExp(`${table}_immutable`, 'i'));
}

assert.match(migration, /window_months in \(12, 24\)/i);
assert.match(migration, /add column if not exists assurance_contract_hash text/i);
assert.match(migration, /create or replace function public\.assurance_jsonb_object_key_count\(value jsonb\)/i);
assert.match(migration, /assurance_jsonb_object_key_count\(assurance_contract\) = 7/i);
assert.match(migration, /Recommendation publication assurance contracts are immutable and cannot be backfilled or changed/i);
assert.match(migration, /NULL\/NULL remains rollout-compatible with an older application/i);
for (const [contractField, column] of [
  ['engineVersion', 'engine_version'],
  ['promptVersion', 'prompt_version'],
  ['llmProvider', 'llm_provider'],
  ['llmModel', 'llm_model'],
]) {
  assert.match(
    migration,
    new RegExp(`assurance_contract ->> '${contractField}'\\) is not distinct from ${column}`, 'i'),
    `${contractField} must use null-safe contract equality`,
  );
}
assert.doesNotMatch(migration, /before insert or update on public\.recommendation_publications/i);
assert.match(migration, /assurance_contract_hash text not null check \(assurance_contract_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i);
assert.match(migration, /recommendation_longitudinal_latest_idx[\s\S]*assurance_contract_hash/i);
assert.match(migration, /excess_ci95_lower > 0/i);
assert.match(migration, /lower_decile_net_excess_return_pct >= 0/i);
assert.match(migration, /tail_breach_rate <= 0\.05/i);
assert.match(migration, /authorized_risk_r > 0 and authorized_risk_r <= 0\.5/i);
assert.match(migration, /Pilot trade must be linked before its first entry execution/i);
assert.match(migration, /source_kind in \('BROKER_API', 'BROKER_STATEMENT'\)/i);
assert.match(migration, /Verified pilot outcome does not match canonical trade execution and performance evidence/i);
assert.match(migration, /valid_until > observed_at/i);
assert.match(migration, /assurance_control_not_future_check/i);
assert.match(migration, /assurance_score_exact_ceiling_check/i);
for (const flag of [
  'duration_24m_gate_passed',
  'longitudinal_24m_gate_passed',
  'recovery_gate_passed',
  'operations_90d_gate_passed',
]) {
  assert.match(migration, new RegExp(`${flag} boolean not null`, 'i'));
  assert.match(migration, new RegExp(`accessibility_gate_passed[\\s\\S]*${flag}[\\s\\S]*then 90`, 'i'));
}
assert.match(migration, /assurance_score_version_check/i);
assert.match(migration, /assurance_score_release_gate_check/i);
assert.match(migration, /Assurance score evidence manifest hash does not match its content/i);
assert.match(migration, /Assurance score snapshot hash does not match its canonical identity/i);
assert.match(migration, /'duration24m', new\.duration_24m_gate_passed/i);
assert.match(migration, /Assurance score append timestamp must be within five minutes of database time/i);
assert.match(migration, /Longitudinal evaluation append timestamp must be within five minutes of database time/i);
assert.match(migration, /assurance_manual_accessibility_payload_check/i);
assert.match(migration, /assurance_branch_protection_payload_check.*source_kind = 'GITHUB_API'/is);
assert.match(migration, /screenReader.*keyboardOnly.*focusOrder.*colorIndependence.*zoom200.*mobile360/is);
assert.match(migration, /capital_authorized boolean not null default false check \(not capital_authorized\)/i);
assert.match(migration, /decision_scope = 'ASSESSMENT_ONLY'/i);
assert.match(migration, /status = 'ELIGIBLE_FOR_HUMAN_REVIEW' and awarded_score = 90 and conditional_ceiling = 90/i);
assert.doesNotMatch(migration, /mfa_required|MFA_REQUIRED/i);
assert.doesNotMatch(migration, /grant[^;]+(?:anon|authenticated)/i);

const manifest = JSON.parse(readFileSync(
  new URL('../infra/release/production-scheduler-manifest.json', import.meta.url),
  'utf8',
));
assert.ok(
  manifest.requiredMigrations.includes('supabase/migrations/20260803100000_conditional_90_assurance.sql'),
  'conditional assurance migration must be release-gated',
);
assert.ok(
  manifest.requiredMigrations.includes('supabase/migrations/20260803120000_assurance_least_privilege.sql'),
  'least-privilege correction must be release-gated',
);

console.log('conditional 90 assurance migration contract tests passed');
