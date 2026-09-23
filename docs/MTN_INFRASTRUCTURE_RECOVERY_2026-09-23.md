# Infrastructure recovery — 2026-09-23

The Telegram alert at 07:19:45 UTC matches GitHub health-monitor run
35831122200. Investigation used the matching monitor execution, production
Supabase records, host boot history, and backup logs.

## Causes and repairs

- After the database restart at September 22 09:36 UTC, pg_net's unlogged
  request sequence restarted below retained `cron_http_runs.request_id` values.
  New requests failed with `23505` before reaching their HTTP handlers. The
  dispatcher now serializes the pg_net queue boundary and advances the sequence
  past retained audit, queue and response IDs. It preserves unique constraints
  and historical rows. Response collection rejects stale responses and
  cross-restart ID matches. Supabase owns the sequence, so making it logged is
  unavailable to the application database role.
- The September 21 business-health view omitted dated performance retries.
  Health again considers shard and finalization retries while retaining the
  closing recommendation data/delivery checks. Off-window final requests do not
  erase a failed real recommendation. Canonical job names and partial indexes
  read only the latest required outcome instead of scanning each job's history.
- The Mac was shut down from September 22 17:02 to September 23 17:53 KST.
  Both launchd workers recovered automatically after startup. AC sleep was
  already disabled; shutdown cannot be repaired by changing heartbeat thresholds.
- September 22 backup attempts failed to connect to Supabase. Initial read-only
  connection checks now retry transient errors within a fixed budget. Failure
  evidence retries confirmed HTTP 522 responses; ambiguous transport results
  are not blindly replayed into the append-only backup ledger.
- Empty closing-review snapshots no longer call trading-calendar and price
  providers or attempt an empty Telegram message. They report zero evaluated
  picks as completed review work, independently of final recommendation health.
- Performance shards previously restarted the same securities after the
  230-second work deadline. Completed securities now persist in the existing
  claim-owned batch metadata and matching retries continue the remainder. Exact
  input fingerprints invalidate changed work; partial writes and failed horizons
  never become checkpoints. Metadata-read failures preserve existing progress.

## Operational verification

- Encrypted backup, offsite upload and restore drill completed in run
  35840462349 (backup record 105). Its recovery assurance correctly retained the
  prior 36.5-hour backup gap as `RPO_TARGET_BREACHED`.
- A fresh backup run 35840935267 completed successfully with backup record 106
  and passing recovery assurance. No previous failure evidence was rewritten.
- Production migration definitions and migration ledger were backed up under
  ignored, restrictive-permission `tmp/migration-backups/` before application.
  Migration transactions now limit lock waits to three seconds and statements
  to sixty seconds; a blocked view replacement rolls back without a ledger row.
- A distinct diagnostic scheduler request used the weekly report's dry-run
  endpoint: request 15359 completed with HTTP 200. It did not send a report or
  replace any official job's failure evidence.
- Tests reproduce an actual PostgreSQL unclean restart and request ID collision,
  concurrent dispatch, retry health, empty reviews, backup connection failures
  and preservation of successful backup records after an RPO assurance failure.
  Full lint, type checking, all 213 test files and the API authorization audit
  passed on Node 24. The additional bounded-history integration test passed with
  50,000 skips and 50,000 successes for registered jobs. Production health query
  execution was measured at 267 ms (676 ms including network) after optimization.
- Macro, US master-filter and gold snapshots recovered with HTTP 200. Indicator
  recovery also completed with HTTP 200. KR performance shards 0 and 1 completed
  successfully on retry; historical failures are never manually erased.
- The final performance-resume change passed independent review and full lint,
  type checking, all 215 test files and the API authorization audit.

## Limits

Historical missed final recommendations must not be regenerated with current
prices or marked successful by a dry-run. Their failure remains visible until
valid new work succeeds. Weekly report dry-run currently responds successfully,
but weekly D5 sample sufficiency remains a separate data-readiness requirement.
Continuous local processing requires the Mac to remain powered on.
