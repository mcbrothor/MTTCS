import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20260728143000_risk_barometer_v1.sql', import.meta.url),
  'utf8',
);

for (const table of [
  'risk_barometer_indicator_observations',
  'risk_barometer_snapshots',
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, 'i'));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  assert.match(migration, new RegExp(`grant select on table public\\.${table} to authenticated`, 'i'));
  assert.match(
    migration,
    new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`, 'i'),
  );
}

assert.match(migration, /add column if not exists close_price/i);
assert.match(migration, /add column if not exists above_200d/i);
assert.match(migration, /create or replace function public\.get_us_breadth_series/i);
assert.match(
  migration,
  /unique \(market, calc_date, indicator_key, observation_kind, model_version\)/i,
);
assert.match(
  migration,
  /unique \(market, calc_date, model_version, input_hash\)/i,
);
assert.match(migration, /source_excerpt is null or char_length\(source_excerpt\) <= 600/i);
assert.match(migration, /input_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
assert.match(
  migration,
  /'ai-fomo-us',[\s\S]*'ai-fomo-us-2026\.07-v1',[\s\S]*'RESEARCH_ONLY'/i,
);
assert.match(migration, /"auto_order": false/i);

console.log('risk barometer migration tests passed');
