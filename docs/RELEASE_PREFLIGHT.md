# MTN Release Preflight

Production schedules have one owner: Supabase Cron. Vercel only hosts the
protected HTTP handlers. The release preflight fails when a second Vercel
schedule, an unclassified route, a missing migration, an untracked
release-critical file, or an unexpected unauthenticated response is found.

## Source of truth

- `infra/release/production-scheduler-manifest.json` declares all 35 production
  jobs, their reviewed schedules, route ownership, explicit route exemptions,
  and scheduler-critical migrations.
- `supabase/migrations/20260801133000_supabase_scheduler_control_plane.sql`
  establishes the database schedule registry, and later files in the manifest's
  ordered `scheduleMigrations` list apply reviewed incremental upserts. Preflight
  composes those registry rows in migration order and requires the result to
  match the JSON manifest exactly. Internal database-only `cron.schedule` jobs
  are not HTTP registry jobs and are therefore excluded from this count.
- `vercel.json` must not contain a `crons` key.
- `/api/release` exposes only the deployed Git SHA. Git-based Vercel deployments
  use `VERCEL_GIT_COMMIT_SHA`; an explicitly controlled deployment may provide
  `MTN_RELEASE_SHA` instead. A deployment without either value fails provenance
  verification.

## Development-only structural check

This command can inspect an in-progress working tree. It can never declare a
dirty tree release eligible.

```bash
node scripts/release/verify-release.mjs --allow-dirty
```

Add `--base-url=https://mttcs.vercel.app` to check all 35 production job URLs.
Every request is deliberately unauthenticated and must return HTTP 401 before
any side effect occurs.

## Pre-deployment gate

Run from a clean, reviewed commit. The clean-clone option clones only `HEAD`
into a temporary directory and repeats the complete structural check there.

```bash
release_sha="$(git rev-parse HEAD)"
node scripts/release/verify-release.mjs \
  --verify-clean-clone \
  --expected-sha="$release_sha" \
  --output="/tmp/mtn-release-$release_sha.json"
```

The output records the Git SHA, Vercel configuration hash, scheduler manifest
hash, every scheduler migration hash, and a deterministic SHA-256 manifest for every
Supabase migration. `--output` refuses to overwrite an existing artifact.

## Post-deployment gate

After the exact commit is deployed, verify both provenance and the live 401
contract:

```bash
release_sha="$(git rev-parse HEAD)"
node scripts/release/verify-release.mjs \
  --expected-sha="$release_sha" \
  --base-url=https://mttcs.vercel.app
```

Successful output must contain:

- `releaseEligible: true`
- `vercel.cronCount: 0`
- `scheduler.jobCount: 35`
- `live.checkedJobCount: 35`
- `live.statusCounts.401: 35`
- `live.deploymentShaVerified: true`

Do not deploy from `--allow-dirty` output. Do not bypass a manifest mismatch by
editing generated hashes; update the reviewed schedule or explicit exemption,
run the tests, and commit the complete change as one release unit.
