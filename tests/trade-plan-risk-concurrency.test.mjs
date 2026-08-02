import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/trades/route.ts', import.meta.url), 'utf8');
const migration = await readFile(
  new URL('../supabase/migrations/20260802123000_p0_risk_alert_capacity.sql', import.meta.url),
  'utf8'
);

// The API must send independently named, server-resolved inputs to the privileged RPC.
assert.match(route, /p_candidate_sector:\s*riskContext\.candidateSector/);
assert.match(route, /p_candidate_sector_source:\s*riskContext\.candidateSectorSource/);
assert.match(route, /p_max_single_trade_risk_pct:\s*riskPolicy\.maxSingleTradeRiskPct/);
assert.match(route, /p_max_portfolio_heat_pct:\s*riskPolicy\.maxPortfolioHeatPct/);
assert.match(route, /p_max_sector_risk_pct:\s*riskPolicy\.maxSectorRiskPct/);
assert.match(route, /MTN_PORTFOLIO_HEAT_LIMIT_REACHED/);
assert.match(route, /MTN_SECTOR_RISK_LIMIT_REACHED/);

// A durable reservation row is the DB-owned source for every PLANNED trade.
assert.match(migration, /create table if not exists public\.trade_plan_risk_reservations/i);
assert.match(migration, /candidate_risk numeric not null check \(candidate_risk > 0\)/i);
assert.match(migration, /candidate_exposure numeric not null check \(candidate_exposure > 0\)/i);
assert.match(migration, /references public\.trades\(id\) on delete cascade/i);

// Authenticated clients may retain owner-scoped reads, but every direct write
// path must be removed so PLANNED rows cannot bypass or desynchronize the RPC.
assert.match(migration, /drop policy if exists "Users can manage their own trades" on public\.trades/i);
assert.match(migration, /revoke insert, update, delete on table public\.trades from anon, authenticated/i);
assert.match(migration, /create policy "Users can read their own trades"[\s\S]*for select[\s\S]*to authenticated/i);
assert.doesNotMatch(migration, /create policy "Users can manage their own trades"[\s\S]*for all/i);

// All concurrency-sensitive checks must execute after the account/market lock.
const lockOffset = migration.indexOf('pg_advisory_xact_lock');
const heatOffset = migration.indexOf('MTN_PORTFOLIO_HEAT_LIMIT_REACHED');
const sectorOffset = migration.indexOf('MTN_SECTOR_RISK_LIMIT_REACHED');
const insertOffset = migration.indexOf('insert into public.trades', lockOffset);
assert.ok(lockOffset >= 0 && heatOffset > lockOffset && sectorOffset > lockOffset);
assert.ok(heatOffset < insertOffset && sectorOffset < insertOffset);

// Candidate risk and active risk are recalculated from DB/raw trade economics.
assert.match(migration, /greatest\(\s*v_payload\.planned_risk,\s*pg_catalog\.abs\(v_payload\.entry_price - v_payload\.stoploss_price\)/i);
assert.match(migration, /v_risk_equity,\s*v_candidate_risk,\s*pg_catalog\.round\(v_candidate_risk \/ v_risk_equity, 6\)/i);
assert.match(migration, /sum\(case when execution\.side = 'ENTRY' then execution\.shares else -execution\.shares end\)/i);
assert.match(migration, /MTN_ACTIVE_RISK_CONTEXT_INCOMPLETE/);
assert.match(migration, /MTN_PLANNED_RISK_CONTEXT_INCOMPLETE/);

// Supplied policy values can only tighten, never raise the DB hard ceilings.
assert.match(migration, /MTN_INVALID_RISK_POLICY_CEILING/);
assert.match(migration, /p_max_portfolio_heat_pct > \(case when p_market = 'KR' then 0\.05 else 0\.06 end\)/i);
assert.match(migration, /p_max_sector_risk_pct > 0\.03/i);
assert.match(migration, /MTN_RISK_POLICY_SNAPSHOT_MISMATCH/);

// A PASS string remains an audit snapshot, not the authorization decision.
assert.doesNotMatch(migration, /v_payload\.risk_gate->>'status' is distinct from 'PASS'/i);

console.log('trade plan DB risk concurrency contract tests passed');
