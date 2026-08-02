import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPipelineHealthRows,
  pipelineRunScope,
} from '../lib/data/pipeline-status.ts';

const now = new Date('2026-08-02T12:00:00.000Z');
const base = {
  provider: 'Supabase',
  market: 'US',
  completed_at: '2026-08-02T11:30:00.000Z',
  fetched_at: '2026-08-02T11:30:00.000Z',
  created_at: '2026-08-02T11:30:00.000Z',
  fallback_used: false,
  fallback_reason: null,
  error_message: null,
  metadata: {},
};

const rows = buildPipelineHealthRows([
  {
    ...base,
    id: 'stale-performance',
    pipeline: 'recommendation-performance',
    status: 'SUCCESS',
    observed_at: '2026-07-30T06:00:00.000Z',
  },
  {
    ...base,
    id: 'fresh-macro',
    pipeline: 'macro',
    status: 'SUCCESS',
    observed_at: '2026-08-02T11:00:00.000Z',
  },
  {
    ...base,
    id: 'missing-observed',
    pipeline: 'portfolio-risk',
    status: 'SUCCESS',
    observed_at: null,
  },
], now);

const stale = rows.find((row) => row.id === 'stale-performance');
assert.equal(stale.recorded_status, 'SUCCESS');
assert.equal(stale.status, 'FAILED');
assert.equal(stale.freshness_status, 'STALE');
assert.ok(stale.age_seconds > stale.expected_max_age_seconds);
assert.equal(stale.last_success_at, '2026-07-30T06:00:00.000Z');

const fresh = rows.find((row) => row.id === 'fresh-macro');
assert.equal(fresh.status, 'SUCCESS');
assert.equal(fresh.freshness_status, 'FRESH');
assert.ok(fresh.next_expected_at);

const missing = rows.find((row) => row.id === 'missing-observed');
assert.equal(missing.status, 'FAILED');
assert.equal(missing.freshness_status, 'UNKNOWN');
assert.equal(missing.age_seconds, null);

assert.notEqual(
  pipelineRunScope({ pipeline: 'market-intelligence', market: null, metadata: { mode: 'feeds' } }),
  pipelineRunScope({ pipeline: 'market-intelligence', market: null, metadata: { mode: 'indicators' } }),
);

const routeSource = readFileSync(new URL('../app/api/admin/data-health/route.ts', import.meta.url), 'utf8');
assert.match(routeSource, /buildPipelineHealthRows/);
assert.match(routeSource, /row\.freshness_at/);
assert.doesNotMatch(routeSource, /observedAt:\s*new Date/);

console.log('pipeline health status tests passed');
