#!/usr/bin/env bash
set -euo pipefail

if [[ "${DRY_RUN:-false}" == "true" ]]; then
  echo "DRY_RUN=true: export one repeatable-read snapshot, create a public-schema custom dump, reconcile every restored table row count, encrypt it with age, and emit only ciphertext."
  exit 0
fi

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MTN_BACKUP_AGE_RECIPIENT:?MTN_BACKUP_AGE_RECIPIENT is required}"

if [[ -z "${MTN_POSTGRES_BIN_DIR:-}" && -x /opt/homebrew/opt/postgresql@17/bin/pg_dump ]]; then
  MTN_POSTGRES_BIN_DIR=/opt/homebrew/opt/postgresql@17/bin
fi
PG_DUMP_BIN="${MTN_POSTGRES_BIN_DIR:+$MTN_POSTGRES_BIN_DIR/}pg_dump"
PG_RESTORE_BIN="${MTN_POSTGRES_BIN_DIR:+$MTN_POSTGRES_BIN_DIR/}pg_restore"
PSQL_BIN="${MTN_POSTGRES_BIN_DIR:+$MTN_POSTGRES_BIN_DIR/}psql"

for command_name in "$PG_DUMP_BIN" "$PG_RESTORE_BIN" "$PSQL_BIN" age node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  fi
done

OUTPUT_DIR="${MTN_BACKUP_OUTPUT_DIR:-$PWD/backup-output}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_PATH="$OUTPUT_DIR/mtn-public-$STAMP.dump.age"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mtn-backup.XXXXXX")"
DUMP_PATH="$TEMP_DIR/mtn.dump"
LIST_PATH="$TEMP_DIR/mtn.restore-list.txt"
SOURCE_ROWS_PATH="$TEMP_DIR/mtn.source-row-counts.tsv"
RESTORED_ROWS_PATH="$TEMP_DIR/mtn.restored-row-counts.tsv"
SNAPSHOT_PIPE="$TEMP_DIR/mtn.snapshot.pipe"
PG_SERVICE_FILE="$TEMP_DIR/pg_service.conf"
PG_PASS_FILE="$TEMP_DIR/pgpass"
SOURCE_DB_SERVICE='service=mtn_backup_source'
SNAPSHOT_PID=''
SNAPSHOT_FD_OPEN='false'

cleanup() {
  if [[ -n "$SNAPSHOT_PID" ]] && kill -0 "$SNAPSHOT_PID" >/dev/null 2>&1; then
    kill "$SNAPSHOT_PID" >/dev/null 2>&1 || true
    wait "$SNAPSHOT_PID" >/dev/null 2>&1 || true
  fi
  if [[ "$SNAPSHOT_FD_OPEN" == "true" ]]; then
    exec 9<&-
  fi
  case "$TEMP_DIR" in
    "${TMPDIR:-/tmp}"/mtn-backup.*) rm -rf -- "$TEMP_DIR" ;;
    *) echo "Refusing to remove unexpected temporary path: $TEMP_DIR" >&2 ;;
  esac
}
trap cleanup EXIT INT TERM

mkdir -p "$OUTPUT_DIR"
umask 077

MTN_PG_SERVICE_DATABASE_URL="$DATABASE_URL" \
  node "$SCRIPT_DIR/write-pg-service-file.mjs" "$PG_SERVICE_FILE" "$PG_PASS_FILE" mtn_backup_source
unset DATABASE_URL
export PGSERVICEFILE="$PG_SERVICE_FILE"
export PGPASSFILE="$PG_PASS_FILE"

collect_public_row_counts() {
  local database_url="$1"
  local output_path="$2"
  local snapshot_id="${3:-}"
  local snapshot_statement=''

  if [[ -n "$snapshot_id" ]]; then
    snapshot_statement="set transaction snapshot :'mtn_snapshot_id';"
  fi

  "$PSQL_BIN" "$database_url" \
    --no-psqlrc \
    --quiet \
    --tuples-only \
    --no-align \
    --field-separator=$'\t' \
    --set ON_ERROR_STOP=1 \
    --set="mtn_snapshot_id=$snapshot_id" <<SQL | LC_ALL=C sort > "$output_path"
begin transaction isolation level repeatable read read only;
$snapshot_statement
select pg_catalog.format(
  'select %L, pg_catalog.count(*)::bigint from %I.%I;',
  namespace.nspname || '.' || relation.relname,
  namespace.nspname,
  relation.relname
)
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace
  on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relkind in ('r', 'p')
order by relation.relname
\gexec
rollback;
SQL

  if [[ ! -s "$output_path" ]]; then
    echo "Public-table row-count manifest is empty." >&2
    exit 1
  fi
}

# Keep the exporting transaction alive until both the row-count manifest and
# pg_dump have consumed the exact same MVCC snapshot. This prevents normal
# production writes from creating false restore-reconciliation failures.
mkfifo "$SNAPSHOT_PIPE"
"$PSQL_BIN" "$SOURCE_DB_SERVICE" \
  --no-psqlrc \
  --quiet \
  --tuples-only \
  --no-align \
  --set ON_ERROR_STOP=1 \
  > "$SNAPSHOT_PIPE" <<'SQL' &
begin transaction isolation level repeatable read read only;
select pg_catalog.pg_export_snapshot();
select pg_catalog.pg_sleep(900);
rollback;
SQL
SNAPSHOT_PID=$!
exec 9<"$SNAPSHOT_PIPE"
SNAPSHOT_FD_OPEN='true'
IFS= read -r SNAPSHOT_ID <&9
if [[ ! "$SNAPSHOT_ID" =~ ^[0-9A-Fa-f-]+$ ]]; then
  echo "PostgreSQL did not return a valid exported snapshot identifier." >&2
  exit 1
fi

collect_public_row_counts "$SOURCE_DB_SERVICE" "$SOURCE_ROWS_PATH" "$SNAPSHOT_ID"

"$PG_DUMP_BIN" "$SOURCE_DB_SERVICE" \
  --format=custom \
  --schema=public \
  --snapshot="$SNAPSHOT_ID" \
  --no-owner \
  --no-acl \
  --file="$DUMP_PATH"

kill "$SNAPSHOT_PID" >/dev/null 2>&1 || true
wait "$SNAPSHOT_PID" >/dev/null 2>&1 || true
SNAPSHOT_PID=''

"$PG_RESTORE_BIN" --list "$DUMP_PATH" > "$LIST_PATH"
if [[ ! -s "$LIST_PATH" ]]; then
  echo "Backup catalog is empty." >&2
  exit 1
fi

if [[ -n "${RESTORE_DRILL_DATABASE_URL:-}" ]]; then
  if [[ "${MTN_RESTORE_DRILL_CONFIRM:-}" != "EMPTY_TARGET_ONLY" ]]; then
    echo "Restore drill requires MTN_RESTORE_DRILL_CONFIRM=EMPTY_TARGET_ONLY." >&2
    exit 1
  fi
  RESTORE_DATABASE_NAME="$(
    "$PSQL_BIN" "$RESTORE_DRILL_DATABASE_URL" \
      --no-psqlrc \
      --tuples-only \
      --no-align \
      --command='select current_database()'
  )"
  case "$RESTORE_DATABASE_NAME" in
    mtn_restore_drill*) ;;
    *)
      echo "Refusing restore drill into unexpected database: $RESTORE_DATABASE_NAME" >&2
      exit 1
      ;;
  esac
  "$PSQL_BIN" "$RESTORE_DRILL_DATABASE_URL" \
    --no-psqlrc \
    --file="$SCRIPT_DIR/restore-drill-supabase-compat.sql"
  "$PG_RESTORE_BIN" \
    --exit-on-error \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --section=pre-data \
    --dbname="$RESTORE_DRILL_DATABASE_URL" \
    "$DUMP_PATH"
  "$PG_RESTORE_BIN" \
    --exit-on-error \
    --no-owner \
    --no-acl \
    --section=data \
    --dbname="$RESTORE_DRILL_DATABASE_URL" \
    "$DUMP_PATH"
  "$PSQL_BIN" "$RESTORE_DRILL_DATABASE_URL" \
    --no-psqlrc \
    --file="$SCRIPT_DIR/restore-drill-supabase-compat.sql"
  "$PG_RESTORE_BIN" \
    --exit-on-error \
    --no-owner \
    --no-acl \
    --section=post-data \
    --dbname="$RESTORE_DRILL_DATABASE_URL" \
    "$DUMP_PATH"

  collect_public_row_counts "$RESTORE_DRILL_DATABASE_URL" "$RESTORED_ROWS_PATH"
  if ! cmp -s "$SOURCE_ROWS_PATH" "$RESTORED_ROWS_PATH"; then
    echo "Restore drill row-count reconciliation failed." >&2
    diff --unified "$SOURCE_ROWS_PATH" "$RESTORED_ROWS_PATH" >&2 || true
    exit 1
  fi
fi

age --recipient "$MTN_BACKUP_AGE_RECIPIENT" --output "$OUTPUT_PATH" "$DUMP_PATH"
if [[ ! -s "$OUTPUT_PATH" ]]; then
  echo "Encrypted backup was not created." >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUTPUT_PATH" > "$OUTPUT_PATH.sha256"
else
  shasum -a 256 "$OUTPUT_PATH" > "$OUTPUT_PATH.sha256"
fi

echo "$OUTPUT_PATH"
