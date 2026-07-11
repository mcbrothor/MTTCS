import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20260711020223_trade_integrity_v2.sql', import.meta.url),
  'utf8',
);

assert.match(migration, /add column if not exists version bigint not null default 0/);
assert.match(migration, /trade_executions_trade_idempotency_idx/);
assert.match(migration, /for update/);
assert.match(migration, /MTN_VERSION_CONFLICT/);
assert.match(migration, /MTN_IDEMPOTENCY_CONFLICT/);
assert.match(migration, /entry_snapshot_locked_at/);
assert.match(migration, /create table if not exists public\.trade_plan_revisions/);
assert.match(migration, /create or replace function public\.amend_trade_plan_v2/);
assert.match(migration, /security definer[\s\S]*set search_path = ''/);
assert.match(migration, /revoke execute[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute[\s\S]*to service_role/);

const route = await readFile(new URL('../app/api/trade-executions/route.ts', import.meta.url), 'utf8');
assert.match(route, /Idempotency-Key 헤더가 필요합니다/);
assert.match(route, /mutate_trade_execution_v2/);
assert.match(route, /expectedVersion \?\? args\.trade\.version/);
assert.doesNotMatch(route, /\.from\('trade_executions'\)\.insert/);

console.log('trade integrity migration tests passed');
