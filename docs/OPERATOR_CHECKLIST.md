# MTN Operator Checklist

Last verified: 2026-06-07

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
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `CEREBRAS_API_KEY`

Local Codex worker optional variables:

- `CODEX_CLI_ENABLED`
- `CODEX_CLI_BIN`
- `CODEX_CLI_MODEL`
- `CODEX_CLI_TIMEOUT_MS`
- `LOCAL_LLM_API_URL`
- `LOCAL_LLM_MODEL`

## 3. Supabase Production Schema

Project: `MTTCS / eorikodkkxlzlqxhjdko`

Required migrations confirmed:

- `risk_policy_and_gate`
- `trade_snapshots`

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
  - Expected provider: `KIS (260 daily bars)`
- `GET /api/market-data?ticker=005930&exchange=KOSPI&includeFundamentals=false&skipStandardMetrics=true`
  - Expected provider: `KIS (260 daily bars)`
- `GET /api/macro`
  - Expected: `score` present, `regime` present, `^KS11.source = KIS`

## 5. Local Codex Worker

Start on the Mac mini when IB validation queue processing is needed:

```bash
npm run codex:worker
```

Expected behavior:

- `pending-codex-cli` is processed by Codex CLI first.
- Codex failure falls back to `pending-local-llm`.
- Telegram report is sent to every id in `TELEGRAM_ALLOWED_CHAT_IDS`.

## 6. Verification Commands

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
