import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const alertsRoute = await readFile(new URL('../app/api/cron/check-alerts/route.ts', import.meta.url), 'utf8');
const migration = await readFile(
  new URL('../supabase/migrations/20260802123000_p0_risk_alert_capacity.sql', import.meta.url),
  'utf8'
);

assert.match(alertsRoute, /entry_price/);
assert.match(alertsRoute, /stoploss_price/);
assert.match(alertsRoute, /user_id/);
assert.doesNotMatch(alertsRoute, /entry_pivot|initial_stop|current_stop/);
assert.match(alertsRoute, /delivery_status/);
assert.match(alertsRoute, /claim_alert_delivery_batch/);
assert.match(alertsRoute, /createAlertDeliveryHooks/);
assert.match(alertsRoute, /read_at/);

assert.match(migration, /create_trade_plan_with_position_limit/i);
assert.match(migration, /pg_advisory_xact_lock/i);
assert.match(migration, /claim_alert_delivery_batch/i);
assert.match(migration, /alert_delivery_receipts/i);
assert.match(migration, /delivery_status/i);
assert.match(migration, /read_at/i);
assert.match(migration, /daily_screener_candidates/i);
assert.match(migration, /250/);
assert.match(migration, /350/);
assert.match(migration, /400/);
assert.match(migration, /BLOCK_NONCRITICAL/);
assert.match(migration, /p_dry_run boolean default true/i);
assert.match(migration, /APPLY_RETENTION/);
assert.match(migration, /mtn-check-alerts/);
assert.match(migration, /\/api\/cron\/check-alerts/);
assert.doesNotMatch(migration, /perform\s+mtn_internal\.apply_retention_policies\(false/i);

console.log('P0 risk, alert, and capacity migration tests passed');
