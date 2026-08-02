import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeDecisionReadiness,
  compactText,
} from '../lib/intelligence/model.ts';
import { buildIntelligenceSourceHealth } from '../lib/intelligence/health.ts';
import {
  applyBlsReleaseCalendar,
  normalizeBlsResponse,
  parseBlsReleaseCalendar,
  parseOfficialRss,
} from '../lib/intelligence/sources.ts';

const source = {
  key: 'FED_MONETARY',
  name: 'Federal Reserve Monetary Policy',
  url: 'https://example.test/feed.xml',
  market: 'US',
  eventType: 'CENTRAL_BANK',
  defaultSeverity: 'WATCH',
  topics: ['MONETARY_POLICY'],
  whyItMatters: 'Policy changes discount rates.',
};

const xml = `<?xml version="1.0"?><rss><channel>
  <item><title>Federal Reserve issues FOMC statement</title><link>https://example.test/a</link><guid>a</guid><description><![CDATA[<p>Policy statement</p>]]></description><pubDate>Wed, 29 Jul 2026 18:00:00 GMT</pubDate></item>
  <item><title>Federal Reserve issues FOMC statement</title><link>https://example.test/a</link><guid>a</guid><description>duplicate</description><pubDate>Wed, 29 Jul 2026 18:00:00 GMT</pubDate></item>
</channel></rss>`;

const events = parseOfficialRss(xml, source, '2026-07-29T18:01:00.000Z');
assert.equal(events.length, 1);
assert.equal(events[0].severity, 'RISK');
assert.equal(events[0].direction, 'UNKNOWN');
assert.equal(events[0].sourceTier, 'PRIMARY');
assert.equal(events[0].summary, 'Policy statement');
assert.equal(events[0].analysis.requiresReview, true);
assert.match(events[0].contentHash, /^[0-9a-f]{64}$/);

assert.equal(compactText('&lt;p&gt;한국은행 &amp; 정책&lt;/p&gt;'), '한국은행 & 정책');

const blsEvents = normalizeBlsResponse({
  status: 'REQUEST_SUCCEEDED',
  Results: {
    series: [
      {
        seriesID: 'CUSR0000SA0',
        data: [
          { year: '2026', period: 'M06', periodName: 'June', value: '303.0' },
          { year: '2026', period: 'M05', periodName: 'May', value: '301.0' },
        ],
      },
      {
        seriesID: 'LNS14000000',
        data: [
          { year: '2026', period: 'M06', periodName: 'June', value: '4.3' },
          { year: '2026', period: 'M05', periodName: 'May', value: '4.0' },
        ],
      },
    ],
  },
}, '2026-07-14T12:30:00.000Z');
assert.equal(blsEvents.length, 2);
assert.equal(blsEvents[0].eventType, 'MACRO_RELEASE');
assert.equal(blsEvents[0].analysis.methodology, 'SEQUENTIAL_CHANGE_WITHOUT_CONSENSUS');
assert.equal(blsEvents[1].severity, 'RISK');
assert.equal(blsEvents[1].payload.sequentialChange, 0.3);
assert.equal(blsEvents[0].publishedAt, '2026-07-14T12:30:00.000Z');
assert.equal(blsEvents[0].payload.observationPeriodEnd, '2026-06-30T23:59:59.000Z');
assert.equal(blsEvents[0].payload.timestampQuality, 'FIRST_OBSERVED_AT');

const blsCalendar = parseBlsReleaseCalendar(`BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;TZID=US-Eastern:20260702T083000
SUMMARY:Employment Situation
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=US-Eastern:20260714T083000
SUMMARY:Consumer Price Index
END:VEVENT
END:VCALENDAR`);
assert.equal(blsCalendar.length, 2);
assert.equal(blsCalendar[0].expectedPeriod, '2026-M06');
const releaseAligned = applyBlsReleaseCalendar(blsEvents, blsCalendar, new Date('2026-07-14T12:35:00.000Z'));
assert.equal(releaseAligned[0].publishedAt, '2026-07-14T12:30:00.000Z');
assert.equal(releaseAligned[0].payload.timestampQuality, 'OFFICIAL_RELEASE_CALENDAR');
assert.throws(
  () => applyBlsReleaseCalendar(blsEvents.map((event) => ({
    ...event,
    payload: { ...event.payload, period: '2026-M05' },
  })), blsCalendar, new Date('2026-07-14T12:35:00.000Z')),
  /is stale/,
);

const blocked = computeDecisionReadiness({
  events: [],
  lastSuccessfulIngestionAt: '2026-07-31T00:00:00.000Z',
  now: new Date('2026-07-31T00:45:01.000Z'),
});
assert.equal(blocked.status, 'BLOCKED');
assert.equal(blocked.advisoryRiskMultiplier, 0);
assert.deepEqual(blocked.sourceHealth, []);

const partialFailureBlocked = computeDecisionReadiness({
  events: [],
  lastSuccessfulIngestionAt: '2026-07-31T00:09:30.000Z',
  sourceHealth: [{
    source: 'FED_MONETARY',
    status: 'FAILED',
    lastAttemptAt: '2026-07-31T00:09:30.000Z',
    lastSuccessfulAt: '2026-07-31T00:04:30.000Z',
    ageSeconds: 330,
    staleAfterSeconds: 1200,
    error: 'upstream timeout',
  }],
  now: new Date('2026-07-31T00:10:00.000Z'),
});
assert.equal(partialFailureBlocked.status, 'BLOCKED');
assert.match(partialFailureBlocked.reasons[0], /FED_MONETARY/);

const sourceSpecificSlaReady = computeDecisionReadiness({
  events: [],
  lastSuccessfulIngestionAt: '2026-07-30T12:35:00.000Z',
  sourceHealth: [{
    source: 'BLS',
    status: 'FRESH',
    lastAttemptAt: '2026-07-30T12:35:00.000Z',
    lastSuccessfulAt: '2026-07-30T12:35:00.000Z',
    ageSeconds: 77_700,
    staleAfterSeconds: 93_600,
    error: null,
  }],
  now: new Date('2026-07-31T10:10:00.000Z'),
});
assert.equal(sourceSpecificSlaReady.status, 'READY');

const sourceHealth = buildIntelligenceSourceHealth([
  {
    source: 'FED_MONETARY',
    status: 'SUCCESS',
    last_attempt_at: '2026-07-31T00:05:00.000Z',
    last_success_at: '2026-07-31T00:05:00.000Z',
  },
  {
    source: 'SEC_TRADING_SUSPENSIONS',
    status: 'FAILED',
    last_attempt_at: '2026-07-31T00:09:00.000Z',
    last_success_at: '2026-07-31T00:04:00.000Z',
    last_error: 'HTTP 503',
  },
  {
    source: 'BLS',
    status: 'SUCCESS',
    last_attempt_at: '2026-07-30T12:35:00.000Z',
    last_success_at: '2026-07-30T12:35:00.000Z',
  },
], 'US', new Date('2026-07-31T00:10:00.000Z'));
assert.deepEqual(sourceHealth.map((source) => source.status), ['FRESH', 'FAILED', 'FRESH']);
assert.equal(sourceHealth[1].error, 'HTTP 503');

const caution = computeDecisionReadiness({
  events: [{ severity: 'RISK', publishedAt: '2026-07-31T00:09:00.000Z' }],
  lastSuccessfulIngestionAt: '2026-07-31T00:09:30.000Z',
  now: new Date('2026-07-31T00:10:00.000Z'),
});
assert.equal(caution.status, 'CAUTION');
assert.equal(caution.advisoryRiskMultiplier, 0.5);

const firstObservedIndicator = computeDecisionReadiness({
  events: [{
    severity: 'RISK',
    publishedAt: '2026-06-30T23:59:59.000Z',
    firstSeenAt: '2026-07-31T00:09:00.000Z',
    payload: { timestampQuality: 'OBSERVATION_PERIOD_END' },
  }],
  lastSuccessfulIngestionAt: '2026-07-31T00:09:30.000Z',
  now: new Date('2026-07-31T00:10:00.000Z'),
});
assert.equal(firstObservedIndicator.status, 'CAUTION');

const correctedOldRelease = computeDecisionReadiness({
  events: [{
    severity: 'RISK',
    publishedAt: '2026-06-30T23:59:59.000Z',
    firstSeenAt: '2026-07-31T00:09:00.000Z',
    payload: { timestampQuality: 'SOURCE_PUBLISHED_AT' },
    isRevision: true,
  }],
  lastSuccessfulIngestionAt: '2026-07-31T00:09:30.000Z',
  now: new Date('2026-07-31T00:10:00.000Z'),
});
assert.equal(correctedOldRelease.status, 'CAUTION');

const ready = computeDecisionReadiness({
  events: [{ severity: 'RISK', publishedAt: '2026-07-30T00:09:00.000Z' }],
  lastSuccessfulIngestionAt: '2026-07-31T00:09:30.000Z',
  now: new Date('2026-07-31T00:10:00.000Z'),
});
assert.equal(ready.status, 'READY');
assert.equal(ready.advisoryRiskMultiplier, 1);

const migration = readFileSync(new URL('../supabase/migrations/20260731123727_market_intelligence_v1.sql', import.meta.url), 'utf8');
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all[^;]+from public, anon, authenticated/i);
assert.match(migration, /unique \(source, external_id, content_hash\)/i);
assert.match(migration, /using gin \(symbols\)/i);
assert.match(migration, /market-intelligence-rules-2026\.07-v1/i);
assert.match(migration, /RESEARCH_ONLY/i);
assert.match(migration, /mark_market_intelligence_revision/i);
assert.match(migration, /market_intelligence_source_health/i);

const schedulerMigration = readFileSync(
  new URL('../supabase/migrations/20260801133000_supabase_scheduler_control_plane.sql', import.meta.url),
  'utf8',
);
assert.match(schedulerMigration, /create extension if not exists pg_cron/i);
assert.match(schedulerMigration, /create extension if not exists pg_net/i);
assert.match(schedulerMigration, /create extension if not exists supabase_vault with schema vault/i);
assert.match(schedulerMigration, /mtn_internal\.invoke_cron/i);
assert.match(schedulerMigration, /security definer[\s\S]+set search_path = ''/i);
assert.match(schedulerMigration, /revoke all on function mtn_internal\.invoke_cron\(text, text, integer\)[\s\S]+from public, anon, authenticated/i);
assert.match(schedulerMigration, /mtn_app_base_url/i);
assert.match(schedulerMigration, /mtn_cron_secret/i);
assert.match(schedulerMigration, /'\*\/30 \* \* \* \*'/i);
assert.match(schedulerMigration, /'35,45,55 12,13 \* \* \*'/i);
assert.match(schedulerMigration, /cron\.job_run_details[\s\S]+interval '30 days'/i);
assert.match(schedulerMigration, /unique \(job_name, slot_started_at\)/i);
assert.match(
  schedulerMigration,
  /on conflict on constraint cron_http_runs_job_name_slot_started_at_key do nothing/i,
);
assert.match(schedulerMigration, /create table if not exists public\.cron_http_runs/i);
assert.match(schedulerMigration, /create view public\.cron_scheduler_health/i);
assert.match(schedulerMigration, /create view public\.cron_scheduler_alerts/i);
assert.match(schedulerMigration, /mtn_internal\.collect_cron_http_responses/i);
assert.match(schedulerMigration, /No pg_net response was received within 120 seconds/i);

const scheduledRouteRows = schedulerMigration.match(
  /^\s+\('mtn-[^']+',\s+'\/api\/cron\//gm,
) || [];
assert.equal(scheduledRouteRows.length, 24, 'all 24 MTN HTTP schedules must be Supabase-owned');

for (const path of [
  '/api/cron/snapshot-market-state?type=macro',
  '/api/cron/contest-review-us',
  '/api/cron/daily-screeners',
  '/api/cron/recommendation-performance?market=US&shard=0&shards=4',
  '/api/cron/recommendation-weekly',
  '/api/cron/rs-metrics?market=US',
  '/api/cron/risk-barometer?dryRun=false',
  '/api/cron/edgar-backfill?wave=A&size=80',
  '/api/cron/gold-strategy?dryRun=false',
  '/api/cron/nasdaq-strategy?dryRun=false',
  '/api/cron/market-intelligence?mode=feeds',
  '/api/cron/market-intelligence?mode=indicators',
]) {
  assert.ok(schedulerMigration.includes(path), `Supabase scheduler is missing ${path}`);
}

const driftRepairMigration = readFileSync(
  new URL('../supabase/migrations/20260801123027_repair_market_intelligence_remote_drift.sql', import.meta.url),
  'utf8',
);
assert.match(driftRepairMigration, /add column if not exists is_revision boolean not null default false/i);
assert.match(driftRepairMigration, /create table if not exists public\.market_intelligence_source_health/i);
assert.match(driftRepairMigration, /market_intelligence_events_source_external_id_content_hash_key/i);
assert.match(driftRepairMigration, /alter table public\.market_intelligence_source_health enable row level security/i);
assert.match(driftRepairMigration, /revoke all on table public\.market_intelligence_source_health from public, anon, authenticated/i);
assert.match(driftRepairMigration, /to service_role[\s\S]+using \(true\)[\s\S]+with check \(true\)/i);

const revisionConstraintMigration = readFileSync(
  new URL('../supabase/migrations/20260801132500_allow_market_intelligence_revisions.sql', import.meta.url),
  'utf8',
);
assert.match(
  revisionConstraintMigration,
  /drop constraint market_intelligence_events_source_external_id_key/i,
);
assert.doesNotMatch(
  revisionConstraintMigration,
  /drop constraint market_intelligence_events_source_external_id_content_hash_key/i,
);

const cronSlotClaimMigration = readFileSync(
  new URL('../supabase/migrations/20260801134500_fix_cron_slot_claim.sql', import.meta.url),
  'utf8',
);
assert.match(
  cronSlotClaimMigration,
  /on conflict on constraint cron_http_runs_job_name_slot_started_at_key do nothing/i,
);
assert.match(
  cronSlotClaimMigration,
  /revoke all on function mtn_internal\.invoke_cron\(text, text, integer\)[\s\S]+from public, anon, authenticated/i,
);

const frequencyMigration = readFileSync(
  new URL('../supabase/migrations/20260801142755_reduce_market_intelligence_frequency.sql', import.meta.url),
  'utf8',
);
assert.match(frequencyMigration, /schedule = '\*\/30 \* \* \* \*'/i);
assert.match(frequencyMigration, /slot_minutes = 30/i);
assert.match(frequencyMigration, /expected_delay_seconds = 2700/i);
assert.match(frequencyMigration, /perform cron\.unschedule\(existing_job\.jobid\)/i);
assert.match(
  frequencyMigration,
  /cron\.schedule\([\s\S]*'mtn-market-intelligence-feeds'[\s\S]*'\*\/30 \* \* \* \*'/i,
);

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.equal(
  Object.hasOwn(vercel, 'crons'),
  false,
  'Vercel must not own any MTN schedules after the Supabase migration',
);

const intelligenceApi = readFileSync(
  new URL('../app/api/market-intelligence/route.ts', import.meta.url),
  'utf8',
);
assert.match(intelligenceApi, /export async function POST\(request: Request\)/);
assert.match(intelligenceApi, /rejectUnauthenticatedRequest\(request\)/);
assert.match(intelligenceApi, /ON_DEMAND_COOLDOWN_MS = 30 \* 60 \* 1000/);
assert.match(intelligenceApi, /runMarketIntelligenceIngestion\(\{ mode: 'feeds' \}\)/);

const intelligencePage = readFileSync(
  new URL('../app/intelligence/page.tsx', import.meta.url),
  'utf8',
);
assert.match(intelligencePage, /method: 'POST'/);
assert.match(intelligencePage, /공식 원천 갱신/);
assert.match(intelligencePage, /30분 간격/);
assert.match(intelligencePage, /DASHBOARD_REFRESH_MS = 5 \* 60 \* 1000/);

console.log('market intelligence tests passed');
