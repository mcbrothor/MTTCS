import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';

const jiti = createJiti(import.meta.url, { interopDefault: true, alias: { '@': path.resolve('.') } });
const {
  CATEGORY_MARKET_REGIME,
  resolveAllCategoryMarketRegimes,
  resolveCategoryMarketRegime,
} = jiti('../lib/recommendations/market-regime.ts');

assert.deepEqual(
  Object.fromEntries(Object.entries(CATEGORY_MARKET_REGIME).map(([category, spec]) => [
    category,
    { benchmarkSymbol: spec.benchmarkSymbol, stateKey: spec.stateKey },
  ])),
  {
    NASDAQ100: { benchmarkSymbol: '^NDX', stateKey: 'NASDAQ100' },
    SP500: { benchmarkSymbol: '^GSPC', stateKey: 'SP500' },
    KOSPI200: { benchmarkSymbol: '^KS200', stateKey: 'KOSPI200' },
    KOSDAQ150: { benchmarkSymbol: '^KQ150', stateKey: 'KOSDAQ150' },
  },
);

const exactKosdaq = resolveCategoryMarketRegime({
  category: 'KOSDAQ150',
  states: { KOSDAQ150: { state: 'yellow' }, KR: { state: 'GREEN' } },
});
assert.equal(exactKosdaq.status, 'READY');
assert.equal(exactKosdaq.quality, 'FULL');
assert.equal(exactKosdaq.effectiveState, 'YELLOW');
assert.equal(exactKosdaq.sourceKey, 'KOSDAQ150');
assert.equal(exactKosdaq.canSelect, true);
assert.equal(exactKosdaq.failClosed, false);

const krOnlyKosdaq = resolveCategoryMarketRegime({
  category: 'KOSDAQ150',
  states: { KR: { state: 'GREEN' } },
});
assert.equal(krOnlyKosdaq.status, 'BLOCKED');
assert.equal(krOnlyKosdaq.quality, 'DEGRADED');
assert.equal(krOnlyKosdaq.observedState, 'GREEN');
assert.equal(krOnlyKosdaq.effectiveState, 'RED');
assert.equal(krOnlyKosdaq.sourceKey, 'KR');
assert.equal(krOnlyKosdaq.canSelect, false);
assert.equal(krOnlyKosdaq.failClosed, true);
assert.equal(krOnlyKosdaq.reason, 'CATEGORY_STATE_REQUIRED');

const compatibleLegacyStates = resolveAllCategoryMarketRegimes({
  US: 'GREEN',
  KR: 'YELLOW',
});
assert.equal(compatibleLegacyStates.SP500.status, 'DEGRADED');
assert.equal(compatibleLegacyStates.SP500.effectiveState, 'GREEN');
assert.equal(compatibleLegacyStates.SP500.canSelect, true);
assert.equal(compatibleLegacyStates.KOSPI200.status, 'DEGRADED');
assert.equal(compatibleLegacyStates.KOSPI200.effectiveState, 'YELLOW');
assert.equal(compatibleLegacyStates.KOSPI200.canSelect, true);
assert.equal(compatibleLegacyStates.NASDAQ100.status, 'BLOCKED');
assert.equal(compatibleLegacyStates.NASDAQ100.effectiveState, 'RED');
assert.equal(compatibleLegacyStates.KOSDAQ150.status, 'BLOCKED');

const invalidExactDoesNotFallBack = resolveCategoryMarketRegime({
  category: 'KOSPI200',
  states: { KOSPI200: { state: 'UNKNOWN' }, KR: 'GREEN' },
});
assert.equal(invalidExactDoesNotFallBack.status, 'BLOCKED');
assert.equal(invalidExactDoesNotFallBack.quality, 'INVALID');
assert.equal(invalidExactDoesNotFallBack.sourceKey, 'KOSPI200');
assert.equal(invalidExactDoesNotFallBack.reason, 'INVALID_CATEGORY_STATE');

const missing = resolveCategoryMarketRegime({ category: 'SP500', states: {} });
assert.equal(missing.status, 'BLOCKED');
assert.equal(missing.quality, 'MISSING');
assert.equal(missing.effectiveState, 'RED');
assert.equal(missing.sourceKey, null);
assert.equal(missing.reason, 'STATE_MISSING');

const migrationSql = readFileSync(
  new URL('../supabase/migrations/20260802093000_recommendation_category_market_state.sql', import.meta.url),
  'utf8',
);
assert.match(migrationSql, /create table if not exists public\.recommendation_category_market_state/i);
assert.match(migrationSql, /primary key \(calc_date, category\)/i);
assert.match(migrationSql, /category in \('NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150'\)/i);
assert.match(migrationSql, /enable row level security/i);
assert.match(migrationSql, /grant select on table public\.recommendation_category_market_state to authenticated/i);
assert.match(migrationSql, /grant select, insert, update, delete on table public\.recommendation_category_market_state to service_role/i);
assert.doesNotMatch(migrationSql, /auth\.role\(\)/i);

const snapshotRoute = readFileSync(
  new URL('../app/api/cron/snapshot-market-state/route.ts', import.meta.url),
  'utf8',
);
for (const category of ['NASDAQ100', 'SP500', 'KOSPI200', 'KOSDAQ150']) {
  assert.match(snapshotRoute, new RegExp(`${category}: \\{`));
}
assert.match(snapshotRoute, /from\('recommendation_category_market_state'\)/);
assert.match(snapshotRoute, /onConflict: 'calc_date,category'/);

console.log('recommendation market regime tests passed');
