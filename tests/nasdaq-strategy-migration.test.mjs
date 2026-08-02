import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20260727103000_nasdaq_strategy_v1.sql', import.meta.url),
  'utf8',
);

for (const table of [
  'nasdaq_strategy_settings',
  'nasdaq_product_metadata',
  'nasdaq_strategy_snapshots',
]) {
  assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  assert.match(sql, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`));
}
assert.match(sql, /unique \(owner_id, as_of_date, model_version, input_hash\)/);
assert.match(sql, /nasdaq-core-leverage-2026\.07-v1/);
assert.match(sql, /'RESEARCH_ONLY'/);
assert.match(sql, /"auto_order": false/);

console.log('nasdaq migration security tests passed');
