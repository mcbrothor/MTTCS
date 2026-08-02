# MTN Operator Checklist

Last verified: 2026-07-26

## 1. Production URLs

- App: `https://mttcs.vercel.app`
- Expected unauthenticated `/`: `307` redirect to `/login`
- Expected `/api/auth/session`: `200`

## 2. Required Production Environment

Confirm these exist in Vercel Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MTN_AUTH_ENABLED`
- `MTN_ADMIN_USERNAME`
- `MTN_ADMIN_PASSWORD`
- `MTN_AUTH_SECRET`
- `CRON_SECRET`
- `KIS_APP_KEY`
- `KIS_APP_SECRET`
- `KIS_BASE_URL`
- `FRED_API_KEY` (optional; without it MTN uses the official FRED CSV endpoint)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_IDS`
- `TELEGRAM_WEBHOOK_SECRET`
- `DAILY_TELEGRAM_CHARTS_ENABLED` (`false` until image delivery is verified)
- `DAILY_TELEGRAM_CHARTS_PER_CATEGORY` (default: `3`, maximum: `10`)
- `DAILY_TELEGRAM_CHART_RANGE` (default: `1Y`; `ALL` uses the full returned history)
- `DAILY_TELEGRAM_CHART_AI_TIMEOUT_MS` (default: `60000`; first local 14B inference includes model-load time)
- `DAILY_RECOMMENDATION_CHART_GATE_ENABLED` (default: `true`; `false` stops chart/fundamental collection but remains fail-closed: every pick is `UNVERIFIED`, publications stay `SHADOW`, and official Telegram delivery is blocked)
- `DAILY_RECOMMENDATION_CHART_GATE_CONCURRENCY` (default: `3`, maximum: `5`)
- `MTN_BASE_URL` (default: `https://mttcs.vercel.app`; used by the local worker for protected chart analysis)
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `CEREBRAS_API_KEY`
- `CEREBRAS_MODEL=gpt-oss-120b`
- `CENTAUR_GEMINI_TIMEOUT_MS=7000`
- `CENTAUR_FAST_MODEL_TIMEOUT_MS=5000`
- `CENTAUR_LOCAL_MODEL_TIMEOUT_MS=8000`
- `MARKET_INSIGHT_TIMEOUT_MS=12000`
- `MARKET_INSIGHT_FAILURE_CACHE_TTL_MS=60000`

Optional market data fallback variables:

- `TOSS_INVEST_CLIENT_ID` or `TOSS_CLIENT_ID`
- `TOSS_INVEST_CLIENT_SECRET` or `TOSS_CLIENT_SECRET`
- `TOSS_INVEST_BASE_URL` (defaults to `https://openapi.tossinvest.com`)
- `TOSS_INVEST_ACCOUNT_ID` or `TOSS_ACCOUNT_ID` (needed when the Toss holdings endpoint requires an account identifier)
- `TOSS_INVEST_HOLDINGS_PATH` (defaults to `/api/v1/holdings`)
- `TOSS_PROXY_SECRET` (required when exposing `/api/toss-proxy/holdings`)
- `TOSS_INVEST_PROXY_URL` (set on Vercel when Toss must be called through a local/free proxy)

Local Codex worker optional variables:

- `CODEX_CLI_ENABLED`
- `CODEX_CLI_BIN`
- `CODEX_CLI_MODEL`
- `CODEX_CLI_TIMEOUT_MS`
- `LOCAL_LLM_ENABLED`
- `LOCAL_LLM_API_URL`
- `LOCAL_LLM_MODEL`
- `TECHNICAL_CHART_LOCAL_MODEL` (default: `qwen3:14b`)
- `TECHNICAL_CHART_MODEL_FALLBACKS` (default: `qwen3:8b,qwen2.5:7b`)
- `TECHNICAL_CHART_EXTERNAL_FALLBACK_ENABLED` (default: `false`)
- `LOCAL_LLM_PROXY_SECRET` (optional; defaults to `TOSS_PROXY_SECRET`)
- `LOCAL_LLM_UPSTREAM_URL` (local only; defaults to `http://127.0.0.1:11434/v1`)

## 3. Supabase Production Schema

Project: `MTTCS / eorikodkkxlzlqxhjdko`

Required migrations confirmed:

- `risk_policy_and_gate`
- `trade_snapshots`
- `20260711015944_add_trade_market_and_versions`
- `20260711020223_trade_integrity_v2`
- `20260711000000_harden_privileged_functions`
- `20260726090000_gold_strategy_v1`

Before production rollout, run migration validation in a staging database, then verify:

- duplicate `Idempotency-Key` returns the original CREATE result and never adds a second execution
- stale `expected_version` returns HTTP 409
- first ENTRY sets `entry_snapshot_locked_at`; later plan changes require `/api/trades/:id/amendments`
- `maintain_stock_metrics_retention_v2(true)` reports counts without deleting rows
- the scheduled DB backup produces a non-empty `pg_restore --list` artifact; perform a full restore drill at least quarterly

Required `public.trades` columns:

- `risk_strategy`
- `requested_risk_strategy`
- `risk_gate`
- `risk_policy_snapshot`
- `entry_snapshot`
- `contest_snapshot`
- `llm_verdict`

Required indexes:

- `trades_risk_gate_gin`
- `risk_policies_market_profile_idx`
- `trades_entry_snapshot_gin`
- `trades_contest_snapshot_gin`
- `trades_llm_verdict_gin`

### Retention maintenance safety gate

The `MTN DB Maintenance` GitHub Actions workflow uses the PostgreSQL 17 client
and `SUPABASE_DATABASE_URL`. Its weekly schedule is observation-only: it calls
`mtn_internal.apply_retention_policies(true, null)` and reports candidate and
capacity counts without deleting rows. The legacy
`maintain_stock_metrics_retention_v2(false)` automatic deletion path is not
used.

Before a manual deletion:

1. Run `workflow_dispatch` with `mode=dry-run` and review every returned policy,
   cutoff, candidate count, and current capacity level.
2. Confirm the affected tables are reproducible/noncritical and that a verified
   encrypted backup and restore drill are recent.
3. Dispatch again with `mode=apply` and the exact, case-sensitive confirmation
   `APPLY_RETENTION`. Any missing or different confirmation fails closed after
   the dry-run report; a scheduled event cannot enter the apply step.
4. Re-run `mode=dry-run` and the database-capacity snapshot after completion,
   then retain the workflow run as the audit record.

## 4. Live Data Smoke Tests

Run after deployment with an authenticated session:

- `GET /api/market-data?ticker=AAPL&exchange=NAS&includeFundamentals=false&skipStandardMetrics=true`
  - Expected provider: `Toss Securities (260 daily bars)` when Toss credentials are configured; otherwise `KIS (260 daily bars)` or Yahoo fallback
- `GET /api/market-data?ticker=005930&exchange=KOSPI&includeFundamentals=false&skipStandardMetrics=true`
  - Expected provider: `KIS (260 daily bars)`
- `GET /api/macro`
  - Expected: `score` present, `regime` present, `^KS11.source = KIS`
- `GET /api/portfolio/risk?market=KR&source=toss`
  - Expected provider: `Toss Securities`, with active positions matching the Toss account holdings

### Supabase-owned scheduler and market intelligence

All production schedules are owned by Supabase Cron. Vercel hosts only the
authenticated HTTP handlers, and `vercel.json` must not contain a `crons` key.
This removes the Vercel Hobby frequency and timing limits and prevents two
independent schedulers from invoking the same endpoint.

- Supabase Cron owns 24 HTTP schedules, including all daily/weekly jobs.
- Official market feeds run every 30 minutes; their alert threshold is 45 minutes.
- BLS retries run at `35,45,55 12,13 * * *`; their alert threshold is 26 hours.
- A one-minute response collector copies transient `pg_net` responses into the
  durable `cron_http_runs` ledger.
- Each call claims a job/time-slot unique key before sending HTTP, so a duplicate
  delivery in the same slot is ignored.
- No paid Vercel Cron interval, queue, Redis, or always-on worker is required.

Before enabling the Supabase schedules:

- Review the pending migration set and apply `20260731123727_market_intelligence_v1.sql` in staging first.
- Apply `20260801123027_repair_market_intelligence_remote_drift.sql` when an older v1 shape lacks `is_revision` or `market_intelligence_source_health`.
- Confirm the baseline `20260801085212_free_infrastructure_scheduler.sql` is in
  migration history, then apply
  `20260801133000_supabase_scheduler_control_plane.sql`. Confirm `pg_cron`,
  `pg_net`, and Vault are enabled. Apply through migration history rather than
  running untracked DDL.
- Apply `20260801135500_remove_legacy_cron_invoker.sql` and confirm only the
  three-argument, execution-slot-aware `mtn_internal.invoke_cron` remains.
- Set `CRON_SECRET` and a real organization/contact value for `SEC_USER_AGENT`; `BLS_API_KEY` remains optional.
- Add the production origin and the same cron secret to Supabase Vault without committing either value:

```sql
select vault.create_secret(
  'https://<production-host>',
  'mtn_app_base_url',
  'MTN production HTTPS origin'
);
select vault.create_secret(
  '<same-value-as-vercel-CRON_SECRET>',
  'mtn_cron_secret',
  'MTN protected cron bearer token'
);
```

- Confirm the 24 HTTP jobs and two internal maintenance jobs are the only MTN jobs:

```sql
select jobname, schedule, active, command
from cron.job
where jobname like 'mtn-%'
order by jobname;
```

- Confirm secrets exist without selecting their decrypted values:

```sql
select name, created_at, updated_at
from vault.secrets
where name in ('mtn_app_base_url', 'mtn_cron_secret')
order by name;
```

- Inspect durable transport health and actionable failures:

```sql
select * from public.cron_scheduler_health order by job_name;
select * from public.cron_scheduler_alerts order by job_name;
select job_name, status, http_status, requested_at, completed_at, error_message
from public.cron_http_runs
order by requested_at desc
limit 100;
```

- Call `GET /api/cron/market-intelligence?mode=all&dryRun=true` with `Authorization: Bearer $CRON_SECRET`.
- Confirm `FED_MONETARY`, `BOK_MONETARY`, `SEC_TRADING_SUSPENSIONS`, and `BLS` are all `SUCCESS`; BLS must return four events.
- Run the non-dry feed and indicator jobs once, then open `/intelligence`; the authenticated `공식 원천 갱신` action must respect its 30-minute cooldown.
- Invoke `mtn_internal.invoke_cron` twice with the same test job name and slot in
  staging; the first call must return a request ID and the second must return
  `NULL`. Never use a production job name for this check.
- Confirm `mtn-market-intelligence-feeds` runs every 30 minutes,
  `mtn-market-intelligence-indicators` uses the two BLS UTC windows,
  `mtn-cron-response-monitor` runs every minute, and
  `mtn-cron-history-prune` keeps 30 days of pg_cron logs and 90 days of HTTP runs.
- A `FAILED` or `STALE` row in `cron_scheduler_alerts` is an operational incident.
  Resolve the HTTP/auth/provider cause and verify a later `SUCCESS`; do not clear
  the ledger manually.
- Force one source failure in staging and confirm decision readiness becomes `BLOCKED`; do not accept a recent success from another source as a substitute.
- Verify unauthenticated `GET /api/market-intelligence` and an unauthenticated cron call both return `401`.
- Keep `market-intelligence-rules-2026.07-v1` at `RESEARCH_ONLY`; the displayed multiplier is advisory only.
- Monitor Supabase database usage below the Free Plan's 500 MB limit and Vercel Function usage monthly. Never enable metered add-ons for this deployment.

### Weekly recommendation performance report

Before enabling or manually retrying Telegram delivery:

- Call `GET /api/cron/recommendation-weekly?dryRun=true` with `Authorization: Bearer $CRON_SECRET`.
- Confirm `dryRun=true`, `chunkCount=1`, `messageLength < 3200`, and a non-null `dataAsOf`.
- Read the returned `preview` and verify the reporting window, executive summary, market scorecards, risks, and actions.
- Treat a live response with skipped Telegram delivery as a failure; do not retry until the bot token and allowed chat IDs are confirmed.
- Keep `RECOMMENDATION_WEEKLY_DRY_RUN=false` in production after validation. Setting it to `true` forces all weekly report calls into preview mode.
- Keep `RECOMMENDATION_PROMOTION_MIN_COHORTS=20` unless the promotion protocol is formally revised. The weekly job sends a separate, recipient-deduplicated Telegram alert only after both Korean categories pass the D20 and D60 paired-cohort criteria. It does not change `KR_RECOMMENDATION_POLICY` automatically.

### Gold strategy v1

Before enabling the scheduled snapshot:

- Apply `20260726090000_gold_strategy_v1.sql` in staging and run `supabase db lint --level warning`.
- Confirm `gold_strategy_settings`, `gold_macro_observations`, and `gold_strategy_snapshots` have RLS enabled.
- Confirm `anon` and `authenticated` have no direct table privileges and `service_role` has the explicit policy/grants.
- In `/admin`, enter only the approved WGC monthly aggregates, reference month, short excerpt, and official `https://*.gold.org` source URL. Do not store or redistribute the source table or raw report.
- Run `npm run smoke:gold-providers`; Yahoo, KIS, DFII10, and DTWEXBGS must each report `ok: true`.
- Run `npm run backtest:gold`; deploy the published historical table only when `publishable: true`.
- Call `GET /api/cron/gold-strategy?dryRun=true` with `Authorization: Bearer $CRON_SECRET`; confirm `persisted=false`, a 64-character `inputHash`, and no order/execution side effect.
- After deployment, confirm the `23:30 UTC` cron creates one idempotent snapshot for the same date and input.
- Keep model status `gold-core-tactical-2026.07-v1 / RESEARCH_ONLY`; do not add order buttons or broker execution.

## 5. Free Toss Holdings Production Workaround

When Toss rejects Vercel with `access_denied: IP address not allowed`, run the Toss call from an allowed local Mac and let Vercel call that Mac through a protected proxy.

Local Mac:

- Set `TOSS_PROXY_SECRET` in `.env.local`.
- Run MTN locally with `npm run dev`.
- Expose `http://localhost:3000/api/toss-proxy/holdings` with a free HTTPS tunnel, such as Cloudflare Tunnel.
- Test:
  - `GET /api/toss-proxy/holdings?market=KR`
  - Header: `Authorization: Bearer $TOSS_PROXY_SECRET`

Vercel:

- Set `TOSS_INVEST_PROXY_URL` to the public tunnel URL ending in `/api/toss-proxy/holdings`.
- Set the same `TOSS_PROXY_SECRET`.
- Redeploy.
- Verify `GET /api/portfolio/risk?market=KR&source=toss`.

## 6. Local LLM / Codex Worker

For production Local LLM calls, keep the Mac mini Next server exposed through the protected local proxy:

- Vercel `LOCAL_LLM_ENABLED=true`
- Vercel `LOCAL_LLM_API_URL=https://<mac-funnel-host>/api/local-llm-proxy`
- Vercel `LOCAL_LLM_MODEL=qwen2.5:7b` for lightweight non-chart jobs
- Local worker `TECHNICAL_CHART_LOCAL_MODEL=qwen3:14b`, with `qwen3:8b,qwen2.5:7b` as installed-model fallbacks
- The local proxy authenticates with `LOCAL_LLM_PROXY_SECRET` or `TOSS_PROXY_SECRET`.

After changing a provider model or proxy URL:

- Confirm Cerebras `GET /v1/models` includes `gpt-oss-120b`.
- Confirm the protected local proxy `/models` and `/chat/completions` return JSON, never an ngrok or tunnel HTML page.
- Call authenticated `GET /api/master-filter?market=US` and `?market=KR` three times each.
- Require at least one AI `success`, no persistent `MODEL_NOT_FOUND` or `PROXY_ERROR`, and a working rule-based fallback when all AI providers are unavailable.

Start on the Mac mini when IB validation queue processing is needed:

```bash
npm run codex:worker
```

Persistent launchd worker:

```bash
cp infra/launchd/com.mantori.mtn-codex-worker.plist ~/Library/LaunchAgents/
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.mantori.mtn-codex-worker.plist
launchctl enable "gui/$(id -u)/com.mantori.mtn-codex-worker"
launchctl kickstart -k "gui/$(id -u)/com.mantori.mtn-codex-worker"
```

Logs:

- `/tmp/mtn-codex-worker.out.log`
- `/tmp/mtn-codex-worker.err.log`

Expected behavior:

- `pending-codex-cli` is processed by Codex CLI first.
- Codex failure falls back to `pending-local-llm`.
- Telegram report is sent to every id in `TELEGRAM_ALLOWED_CHAT_IDS`.
- With `DAILY_TELEGRAM_CHARTS_ENABLED=true`, each daily category report is followed by PNG chart analyses only for picks that pass the integrated chart and fundamental-data gate. A failed image is logged and does not change the successful text delivery status.

## 6A. Local Analysis Infra

The local analysis server keeps heavy data in Local Postgres while Supabase stores queue state and UI summaries.

Local Postgres:

- DB: `mtn_local`
- user: `mtn_worker`
- secret file: `~/.config/mtn/local-postgres-url`
- local schema: `local-postgres/migrations/001_local_analysis_infra.sql`

Apply local schema:

```bash
psql "$LOCAL_POSTGRES_URL" -f local-postgres/migrations/001_local_analysis_infra.sql
```

Supabase schema:

- migration: `supabase/migrations/20260628000000_local_analysis_queue.sql`
- queue table: `analysis_jobs`
- supported jobs: `FINANCIAL_AUDIT`, `THESIS_CHECK`, `COMMITTEE_REVIEW`, `NEWS_PULSE`, `RECOMMENDATION_BACKTEST`
- summary table: `financial_audit_summaries`
- default worker claim set: all supported job types

Run a one-shot worker:

```bash
npm run local:worker:once
```

Create a job through the MTN API after logging in:

```bash
curl -X POST http://localhost:3000/api/local-analysis/jobs \
  -H 'content-type: application/json' \
  --data '{"job_type":"FINANCIAL_AUDIT","payload":{"ticker":"NVDA","market":"US","financials":[]}}'
```

Other supported payloads:

- `THESIS_CHECK`: `ticker` or `thesis_id`, plus `assumptions`, `events`, `evidence`.
- `COMMITTEE_REVIEW`: `ticker`, optional `agent_votes`.
- `NEWS_PULSE`: `ticker`, `news`.
- `RECOMMENDATION_BACKTEST`: `strategy_key`, `trades` or `picks`.

Operator dashboard:

- `/admin/local-analysis`
- shows Supabase queue counts, recent jobs, worker heartbeat, local evidence counts, and recent worker logs.
- supports `retry`, `requeue`, and `cancel` actions for existing jobs.
- can create smoke jobs from built-in payload templates.

Automatic queue collector:

```bash
DRY_RUN=true npm run local:analysis:enqueue -- --market=US --limit=12
npm run local:analysis:enqueue -- --market=US --limit=12
npm run local:analysis:enqueue -- --market=KR --limit=12
```

Collector sources:

- `recommendation_publications` / `recommendation_picks` → `COMMITTEE_REVIEW`
- `security_events` → `NEWS_PULSE`
- `fundamental_cache` → `FINANCIAL_AUDIT`
- `investment_theses` / `thesis_assumptions` → `THESIS_CHECK`
- `recommendation_performance` → `RECOMMENDATION_BACKTEST`

Daily collector launchd:

```bash
cp infra/launchd/com.mantori.mtn-local-analysis-enqueue.plist ~/Library/LaunchAgents/
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.mantori.mtn-local-analysis-enqueue.plist
launchctl enable "gui/$(id -u)/com.mantori.mtn-local-analysis-enqueue"
```

Persistent launchd worker:

```bash
cp infra/launchd/com.mantori.mtn-local-analysis-worker.plist ~/Library/LaunchAgents/
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.mantori.mtn-local-analysis-worker.plist
launchctl enable "gui/$(id -u)/com.mantori.mtn-local-analysis-worker"
launchctl kickstart -k "gui/$(id -u)/com.mantori.mtn-local-analysis-worker"
```

Free-plan worker defaults:

- Codex queue: `MTN_CODEX_WORKER_POLL_MS=30000`, idle backoff up to `MTN_CODEX_WORKER_MAX_POLL_MS=300000`.
- Local analysis queue: `MTN_LOCAL_WORKER_POLL_MS=30000`, idle backoff up to `MTN_LOCAL_WORKER_MAX_POLL_MS=300000`.
- Stale Daily Screener recovery runs at most every `DAILY_SCREENER_STALE_CHECK_INTERVAL_MS=900000`.
- Transient Supabase 5xx/network failures keep the workers alive with backoff; non-transient failures still stop after three attempts.

Daily local backup:

```bash
cp infra/launchd/com.mantori.mtn-local-postgres-backup.plist ~/Library/LaunchAgents/
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.mantori.mtn-local-postgres-backup.plist
launchctl enable "gui/$(id -u)/com.mantori.mtn-local-postgres-backup"
```

Health and backup commands:

```bash
npm run local:postgres:health
DRY_RUN=true npm run local:postgres:backup
npm run local:postgres:backup
```

Logs:

- `/tmp/mtn-local-worker.out.log`
- `/tmp/mtn-local-worker.err.log`
- `/tmp/mtn-local-postgres-backup.out.log`
- `/tmp/mtn-local-postgres-backup.err.log`

Expected behavior:

- MTN writes `analysis_jobs.status = queued`.
- Local worker claims one job with `claim_analysis_job(...)`.
- Full evidence is written to Local Postgres.
- Supabase gets `financial_audit_summaries` and `analysis_jobs.result_summary`.
- Stale `running` jobs are claimable again after `MTN_LOCAL_WORKER_STALE_AFTER_SECONDS`.

## 7. Verification Commands

Before deployment:

```bash
npm test
npm run lint
npm run build
```

Deploy:

```bash
npx vercel --prod --yes
```

Confirm production:

```bash
curl -I -s https://mttcs.vercel.app | head
curl -s -o /dev/null -w "%{http_code}\n" https://mttcs.vercel.app/api/auth/session
```
