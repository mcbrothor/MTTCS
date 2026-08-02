# R2 Encrypted Backup Retention

The R2 backup prefix is a ciphertext-only boundary. The planner rejects every
object that is not named exactly
`mtn-public-YYYYMMDDTHHMMSSZ.dump.age`, including plaintext dumps, checksum
sidecars, age key files, nested keys, and objects outside the configured prefix.
Local upload inputs must also be regular, non-symlink files whose content starts
with the age v1 ciphertext header.

The storage safety limit is 8,000,000,000 bytes. Before every upload, the CLI
lists the entire dedicated bucket, adds the candidate size to every existing
object, and checks the total. It fails before `put-object` when the limit would
be exceeded. This leaves headroom below the R2 free storage allowance and does
not assume that future retention deletions will succeed.

## Retention policy

The planner sorts the timestamp embedded in each validated key, newest first,
and retains the union of:

- the newest backup in each of the 7 newest UTC days;
- the newest backup in each of the 8 newest ISO weeks;
- the newest backup in each of the 12 newest UTC months.

Key ordering breaks timestamp ties, so the result is independent of the order
returned by R2. A backup can satisfy more than one tier. Objects outside the
union are deletion candidates, but `retention` is always a dry run unless both
the CLI flag and exact environment confirmation are present:

```bash
node scripts/r2-backup-retention.mjs retention

APPLY_BACKUP_RETENTION=DELETE_EXPIRED_CIPHERTEXT \
  node scripts/r2-backup-retention.mjs retention --apply-retention
```

Every candidate key is validated again immediately before deletion.

## Required environment

Use an R2 S3 API token with **Object Read & Write**, restricted to the single
backup bucket. The CLI only calls `ListObjectsV2`, `PutObject`, and
`DeleteObject`; account-level or bucket-administration permission is not
required. Actual token scope cannot be introspected from S3 credentials, so it
must be restricted when the token is created.

| Variable               | Purpose                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `R2_ENDPOINT_URL`      | `https://<ACCOUNT_ID>[.<JURISDICTION>].r2.cloudflarestorage.com` |
| `R2_BUCKET_NAME`       | Dedicated, private backup bucket                                 |
| `R2_BACKUP_PREFIX`     | Dedicated safe prefix such as `mtn/supabase/`                    |
| `R2_ACCESS_KEY_ID`     | Bucket-scoped S3 access key ID                                   |
| `R2_SECRET_ACCESS_KEY` | Bucket-scoped S3 secret access key                               |
| `R2_SESSION_TOKEN`     | Optional temporary-credential session token                      |

The optional jurisdiction segment is `eu` or `fedramp`; omit it for the
default jurisdiction.

Credentials are passed to the AWS CLI only through its environment. Reports
never serialize the endpoint configuration or credentials, and R2 command
failures suppress child-process output.

Cloudflare documents the R2 S3 endpoint, `auto` region, jurisdiction-specific
hostnames, and bucket-scoped Object Read & Write tokens in its
[S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/) and
[authentication](https://developers.cloudflare.com/r2/api/tokens/) guides.

## Workflow integration contract

The existing backup generator and workflow remain independent. A workflow that
integrates this CLI must:

1. Use a concurrency group with `cancel-in-progress: false` so only one writer
   can evaluate capacity and upload at a time.
2. Install or verify AWS CLI v2, and expose the five required values above as
   environment variables. Store access credentials in GitHub Secrets.
3. Resolve exactly one local `*.dump.age` output; never pass the `.sha256`
   sidecar to this CLI.
4. Optionally apply retention to existing ciphertext, then run the pre-upload
   plan and upload as separate fail-closed steps:

```bash
mapfile -t backup_paths < <(find backup-output -type f -name 'mtn-public-*.dump.age' -print)
test "${#backup_paths[@]}" -eq 1
backup_path="${backup_paths[0]}"

APPLY_BACKUP_RETENTION=DELETE_EXPIRED_CIPHERTEXT \
  node scripts/r2-backup-retention.mjs retention --apply-retention
node scripts/r2-backup-retention.mjs plan-upload --file="$backup_path"
node scripts/r2-backup-retention.mjs upload --file="$backup_path"
APPLY_BACKUP_RETENTION=DELETE_EXPIRED_CIPHERTEXT \
  node scripts/r2-backup-retention.mjs retention --apply-retention
```

The first retention pass creates headroom without weakening the upload check;
the second recomputes the tiers with the newly uploaded backup. If the planner
still reports that existing bytes plus the candidate exceed the hard cap, the
upload must remain failed. The upload uses `If-None-Match: *`, so an existing
timestamped key cannot be overwritten.

The bucket and configured prefix must be dedicated to these ciphertext objects.
Any object outside the prefix, or any unexpected object inside it, intentionally
blocks planning, uploading, and deletion until an operator investigates rather
than letting automation guess.
