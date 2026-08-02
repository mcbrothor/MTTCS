import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20260728090000_manual_strategy_capital.sql', import.meta.url),
  'utf8',
);

for (const table of ['gold_strategy_settings', 'nasdaq_strategy_settings']) {
  assert.match(
    sql,
    new RegExp(`alter table public\\.${table}[\\s\\S]*add column if not exists manual_account_value`, 'i'),
  );
}
assert.match(sql, /manual_account_value is null or manual_account_value > 0/i);

console.log('manual strategy capital migration tests passed');
