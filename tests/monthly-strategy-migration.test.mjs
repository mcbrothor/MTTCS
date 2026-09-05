import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20260901090000_monthly_strategy_snapshots.sql', 'utf8');

assert.match(sql, /create table if not exists public\.monthly_strategy_snapshots/i);
assert.match(sql, /owner_id uuid not null/i);
assert.match(sql, /market text not null/i);
assert.match(sql, /signal_at date not null/i);
assert.match(sql, /effective_at date/i);
assert.match(sql, /input_hash text not null/i);
assert.match(sql, /unique \(owner_id, market, signal_at, model_version, input_hash\)/i);
assert.match(sql, /'RESEARCH_ONLY'/i);

console.log('monthly strategy migration tests passed');
