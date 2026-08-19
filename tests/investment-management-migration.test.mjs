import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20260820120000_investment_management_integration.sql', import.meta.url), 'utf8');

test('investment management tables enforce RLS and idempotent snapshot keys', () => {
  for (const table of ['market_breadth_snapshots', 'investor_flow_oscillator_snapshots', 'asset_allocation_snapshots', 'turnover_intensity_snapshots', 'market_sentiment_snapshots']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /unique \(market, universe, as_of, model_version\)/i);
  assert.match(migration, /unique \(user_id, strategy, as_of, model_version\)/i);
  assert.match(migration, /add column if not exists thesis text/i);
  assert.match(migration, /idea_status in \('DRAFT', 'WATCHING', 'READY', 'INVALIDATED', 'ARCHIVED'\)/i);
});
