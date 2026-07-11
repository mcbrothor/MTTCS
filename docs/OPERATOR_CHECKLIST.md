# MTN Operator Checklist

Last verified: 2026-07-11

## 1. Production URLs

- App: `https://mtn-trading.vercel.app`
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
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_IDS`
- `TELEGRAM_WEBHOOK_SECRET`
- `DAILY_TELEGRAM_CHARTS_ENABLED` (`false` until image delivery is verified)
- `DAILY_TELEGRAM_CHARTS_PER_CATEGORY` (default: `3`, maximum: `10`)
- `DAILY_TELEGRAM_CHART_RANGE` (default: `1Y`; `ALL` uses the full returned history)
- `DAILY_TELEGRAM_CHART_AI_TIMEOUT_MS` (default: `60000`; first local 14B inference includes model-load time)
- `DAILY_RECOMMENDATION_CHART_GATE_ENABLED` (default: `true`; excludes invalid, extended, or fundamentally unverified picks from Telegram chart delivery)
- `DAILY_RECOMMENDATION_CHART_GATE_CONCURRENCY` (default: `3`, maximum: `5`)
- `MTN_BASE_URL` (default: `https://mttcs.vercel.app`; used by the local worker for protected chart analysis)
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `CEREBRAS_API_KEY`

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
curl -I -s https://mtn-trading.vercel.app | head
curl -s -o /dev/null -w "%{http_code}\n" https://mtn-trading.vercel.app/api/auth/session
```
