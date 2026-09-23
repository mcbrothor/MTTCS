# MTN recovery implementation — 2026-09-21

## Implemented

- Universe source failures are isolated from other markets. Category-specific LLM prompts, schemas, parsers, persistence and Telegram selection use the same market scope. Partial runs retain failed-market evidence and do not claim complete delivery.
- Naver's old HTML endpoint redirects to a new SPA. A validated market-specific JSON fallback restores 200 KOSPI / 150 KOSDAQ input symbols. Existing market-cap universe semantics and the 95% closing coverage gate are unchanged.
- Authenticated production smoke exposed StockAnalysis's S&P 500 HTTP 403. A validated Wikipedia constituent-table fallback preserves supported share classes, explicitly marks missing price/market-cap data, and does not claim that alphabetical membership order is market-cap rank. Verified NYSE/NASDAQ members currently total 502; the CBOE BZX listing is explicitly excluded rather than misclassified as NASDAQ. Supporting additional exchanges and full market-cap ordering before sampled scans remain follow-up data-quality improvements.
- Recommendation delivery includes requested-official SHADOW observations without promoting them to official recommendations. Stored-publication retries retain observation labeling.
- Shared per-publication/recipient/chunk claims and receipts protect against concurrent sends. Expired claims and ambiguous Telegram responses become UNCERTAIN, not permission to resend. Existing local receipt evidence is imported without overwriting shared rows.
- Historical recommendation regeneration with current prices/chart data is rejected. Old live-delivery replay is rejected; retrospective recovery requires explicit labeling.
- Closing HTTP success is separated from SKIPPED, PENDING, UNKNOWN, HELD, DATA_BLOCKED and DELIVERY_FAILED. Off-window calls no longer clear an earlier business failure.
- Watchdog defaults to dry-run and requires --apply. Imports cannot accidentally execute it. Partial-market runs are alerted without automatically rebuilding already completed markets.
- Worker heartbeats report startup-loaded Git SHA, Node version, PID, startup time, current daily job, stage and progress timestamp.

## Database rollout

- Applied `20260914010000`: verified actual invoke/collector definitions contain 280/290 seconds for general jobs and 240/300 for closing jobs.
- Applied `20260921010000`: business outcomes and scheduler health. Existing failed closing FINAL jobs remain FAILED after later off-window SKIPPED responses.
- Applied `20260921020000`: shared Telegram receipts and explicit UNCERTAIN/EXPIRED publication statuses.
- Before each apply, internal function definitions and migration ledger were backed up under ignored `tmp/migration-backups/` with restrictive permissions. No recommendation/candidate deletion or force queue reset was performed.

## Verification and limits

Node 24 is used for scripts and tests. Isolated PostgreSQL tests exercise migration SQL, two-connection claims, lease expiration, receipt immutability, service-role permissions and business-health transitions. Unit tests cover provider fallback, scoped market failures, observation delivery, ambiguous responses, safe CLI modes and historical-date rejection.

Initial rollout: 205 tests, typecheck and full lint passed; Vercel deployment `dpl_CzZX2uuyFnL9kMiX154dWRiAnP4C` exposed SHA `4db0170b9525fa97c9139ffdb53c271028bcaabe`; 47 protected scheduler URLs returned 401 as expected. Worker PID 85693 reported the same loaded SHA using Node 24.18.0. All 202 legacy Telegram receipts were imported to the shared table. Subsequent portability and S&P 500 fallback tests increased the suite to 207 files. Ubuntu CI initially exposed a macOS-only PostgreSQL binary path; the tests now locate validated server binaries explicitly instead of skipping integration tests.

Recovery inventory: September 11–20 has 10 failed daily runs and zero stored candidates. September 18 KOSPI FINAL was BLOCKED with 29/200 coverage and zero picks; no KOSDAQ FINAL exists for that date. The two eligible September 9 SHADOW publications still pending (NASDAQ100/SP500) were marked EXPIRED with a recovery reason; their stored content and receipts were preserved. None was relabeled or sent as a current recommendation.

External monitor: GitHub's default branch was still `9956d8f`, and repeated failures were generating repeat notifications under the old 30-minute dedupe. PR #31 contains only the MTN delivery/recovery changes needed for main; unrelated local commits were excluded. A weekday follow-up at 16:45 and 21:45 KST checks actual planned publications and receipts over two trading days without blindly replaying expired or uncertain messages.

Source restoration is not proof of a completed closing recommendation. Today's live FINAL must still run in its valid market window; real report and Telegram receipt validation remains necessary over two trading sessions. No stale recommendation is represented as current advice.

The following plan items remain follow-up work, not claimed complete: independent persistent per-market retry jobs/checkpoints; decoupling all long AI jobs from outbox processing; closing delivery lease reconciliation; source-version snapshots; measured call-count/p95 optimization; session-aware schedule reduction; host-wide AI resource budgets and 24–48-hour memory measurements; installed external monitor version reconciliation. Existing rate limiters, caches and adaptive polling are retained.

## Rollback

Keep the previous web deployment and Git commit `94a46adce5d802a89fd31378376a685d6a0421bc` available. Stop new queue work before worker replacement. Do not revert receipt/status migrations blindly: new UNCERTAIN records must remain protected from automatic retries. Prefer a forward fix using backed-up definitions and preserve all reports/receipts.
