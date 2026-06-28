#!/bin/zsh
set -euo pipefail

cd /Users/mantori/vibecoding/MTN

LOCAL_POSTGRES_URL_FILE="${MTN_LOCAL_POSTGRES_URL_FILE:-/Users/mantori/.config/mtn/local-postgres-url}"
if [[ -z "${LOCAL_POSTGRES_URL:-}" && -f "$LOCAL_POSTGRES_URL_FILE" ]]; then
  export LOCAL_POSTGRES_URL="$(cat "$LOCAL_POSTGRES_URL_FILE")"
fi

BACKUP_DIR="${MTN_LOCAL_POSTGRES_BACKUP_DIR:-/Users/mantori/.local/share/mtn/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/mtn_local_$STAMP.dump"

if [[ "${DRY_RUN:-false}" == "true" ]]; then
  echo "DRY_RUN=true pg_dump --format=custom --file=$OUT <LOCAL_POSTGRES_URL>"
  exit 0
fi

if [[ -z "${LOCAL_POSTGRES_URL:-}" ]]; then
  echo "LOCAL_POSTGRES_URL is not set and $LOCAL_POSTGRES_URL_FILE does not exist." >&2
  exit 1
fi

PG_BIN_DIR="${MTN_POSTGRES_BIN_DIR:-/opt/homebrew/opt/postgresql@16/bin}"
PG_DUMP_BIN="${PG_BIN_DIR}/pg_dump"
if [[ ! -x "$PG_DUMP_BIN" ]]; then
  PG_DUMP_BIN="pg_dump"
fi

mkdir -p "$BACKUP_DIR"

"$PG_DUMP_BIN" "$LOCAL_POSTGRES_URL" --format=custom --file="$OUT"
gzip -f "$OUT"
echo "$OUT.gz"
