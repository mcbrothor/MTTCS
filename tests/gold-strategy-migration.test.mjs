import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL(
    '../supabase/migrations/20260726090000_gold_strategy_v1.sql',
    import.meta.url,
  ),
  'utf8',
);

for (const table of [
  'gold_strategy_settings',
  'gold_macro_observations',
  'gold_strategy_snapshots',
]) {
  assert.match(
    migration,
    new RegExp(`create table if not exists public\\.${table}`, 'i'),
  );
  assert.match(
    migration,
    new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
  );
  assert.match(
    migration,
    new RegExp(
      `revoke all on table public\\.${table} from anon, authenticated`,
      'i',
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `grant select, insert, update, delete on table public\\.${table} to service_role`,
      'i',
    ),
  );
}

assert.doesNotMatch(migration, /references\s+(?:public\.)?auth\.users/i);
assert.doesNotMatch(migration, /references\s+auth\.users/i);
assert.match(
  migration,
  /owner_id uuid primary key[\s\S]*core_product[\s\S]*tactical_product/i,
);
assert.match(
  migration,
  /unique \(owner_id, observation_month\)/i,
);
assert.match(
  migration,
  /unique \(owner_id, as_of_date, core_product, tactical_product, input_hash\)/i,
);
assert.match(migration, /input_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
assert.match(migration, /etf_flow_direction text generated always as/i);
assert.match(migration, /data_quality in \('READY', 'DEGRADED', 'BLOCKED'\)/i);
assert.match(
  migration,
  /create policy "Service role manages gold strategy settings"[\s\S]*to service_role[\s\S]*with check \(auth\.role\(\) = 'service_role'\)/i,
);
assert.match(
  migration,
  /'gold-core-tactical',[\s\S]*'gold-core-tactical-2026\.07-v1',[\s\S]*'RESEARCH_ONLY'/i,
);
assert.match(
  migration,
  /on conflict \(model_key, version\) do update/i,
);
assert.match(migration, /"llm_decision": false/i);
assert.match(migration, /"leverage_enabled": false/i);

console.log('gold strategy migration tests passed');
