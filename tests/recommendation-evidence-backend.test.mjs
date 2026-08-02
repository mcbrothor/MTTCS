import assert from 'node:assert/strict';
import fs from 'node:fs';

const job = fs.readFileSync('lib/recommendations/jobs.ts', 'utf8');
const metricsApi = fs.readFileSync('app/api/recommendations/metrics/route.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260802153000_recommendation_evidence_backend.sql', 'utf8');

assert.match(job, /engine_version, prompt_version, market_context, is_official/);
assert.match(job, /buildRecommendationEvidenceManifest/);
assert.match(job, /buildRecommendationPriceEvidence/);
assert.doesNotMatch(job, /buildPriceDataManifest/, 'jobs must not register a shared full-series manifest');
assert.match(job, /for \(const horizon[\s\S]*buildRecommendationPriceEvidence\(\{[\s\S]*horizon,/);
assert.match(job, /calculateNetRecommendationPerformance/);
assert.match(job, /registerRecommendationEvidenceManifest/);
assert.match(job, /refreshRecommendationEvidenceEvaluations/);
for (const column of [
  'net_return_pct',
  'net_excess_return_pct',
  'commission_cost_pct',
  'tax_cost_pct',
  'slippage_cost_pct',
  'fx_cost_pct',
  'evidence_manifest_id',
  'data_evidence_tier',
  'market_regime',
]) {
  assert.match(job, new RegExp(column));
}

assert.match(metricsApi, /readRecommendationEvidence/);
assert.match(metricsApi, /evidencePromotion/);

assert.match(migration, /create table if not exists public\.recommendation_evidence_manifests/i);
assert.match(migration, /create table if not exists public\.recommendation_evidence_evaluations/i);
assert.match(migration, /alter table public\.recommendation_performance/i);
assert.match(migration, /net_return_pct/i);
assert.match(migration, /net_excess_return_pct/i);
assert.match(migration, /manifest_hash text not null unique/i);
assert.match(migration, /data_payload jsonb not null/i);
assert.match(migration, /payload_hash text not null/i);
assert.match(migration, /data_manifest_id = payload_hash/i);
assert.match(migration, /pick_id uuid not null references public\.recommendation_picks/i);
assert.match(migration, /horizon text not null check \(horizon in \('LIVE', 'D5', 'D20', 'D60'\)\)/i);
assert.match(migration, /calculation_result jsonb not null/i);
assert.match(migration, /horizon in \('D5', 'D20', 'D60'\)[\s\S]*calculation_status = 'MATURED'/i);
assert.match(migration, /horizon in \('D5', 'D20', 'D60'\)[\s\S]*status = 'MATURED'[\s\S]*evidence_manifest_id is not null/i);
assert.match(migration, /evaluation_hash text not null unique/i);
assert.match(migration, /prevent_recommendation_evidence_mutation/i);
assert.match(migration, /before update or delete/i);
assert.match(migration, /enable row level security/i);
assert.doesNotMatch(migration, /drop\s+(table|column)/i);

console.log('recommendation evidence backend contract tests passed');
