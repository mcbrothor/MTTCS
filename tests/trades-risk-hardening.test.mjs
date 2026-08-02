import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tradesRoute = await readFile(new URL('../app/api/trades/route.ts', import.meta.url), 'utf8');
const planPage = await readFile(new URL('../app/plan/page.tsx', import.meta.url), 'utf8');

assert.match(tradesRoute, /currentOpenRisk: riskContext\.currentOpenRisk/);
assert.match(tradesRoute, /sectorExposurePct: riskContext\.sectorExposurePct/);
assert.match(tradesRoute, /drawdownPct: riskContext\.drawdownPct/);
assert.match(tradesRoute, /dailyLossPct: riskContext\.dailyLossPct/);
assert.match(tradesRoute, /weeklyLossPct: riskContext\.weeklyLossPct/);
assert.match(tradesRoute, /currentPositionCount: riskContext\.currentPositionCount/);
assert.match(tradesRoute, /maxPositions: riskContext\.maxPositions/);
assert.match(tradesRoute, /marketActionLevel: riskContext\.marketActionLevel/);
assert.match(tradesRoute, /serverRiskGate\.status === 'REDUCE'/);
assert.match(tradesRoute, /findServerManagedTradePatchFields/);
assert.match(tradesRoute, /executionUnknownTickers/);
assert.match(tradesRoute, /plannedRiskReservation/);
assert.match(tradesRoute, /buildConservativeDrawdownSeries/);
assert.match(tradesRoute, /candidateSector:/);
assert.match(tradesRoute, /\.eq\('version', currentVersion\)/);
assert.match(tradesRoute, /updateQuery\.eq\('status', 'PLANNED'\)\.is\('entry_snapshot_locked_at', null\)/);
assert.match(tradesRoute, /'TRADE_UPDATE_CONFLICT'/);
assert.match(tradesRoute, /create_trade_plan_with_position_limit/);
assert.doesNotMatch(tradesRoute, /update\.risk_gate\s*=/);
assert.doesNotMatch(tradesRoute, /update\.total_equity\s*=/);

assert.match(planPage, /source=supabase/);
assert.match(planPage, /capitalSnapshot\.fallbackUsed/);
assert.doesNotMatch(planPage, /DEFAULT_PLAN_TOTAL_EQUITY/);
assert.doesNotMatch(planPage, /50000/);

console.log('trade risk hardening tests passed');
