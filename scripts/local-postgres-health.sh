#!/bin/zsh
set -euo pipefail

cd /Users/mantori/vibecoding/MTN

LOCAL_POSTGRES_URL_FILE="${MTN_LOCAL_POSTGRES_URL_FILE:-/Users/mantori/.config/mtn/local-postgres-url}"
if [[ -z "${LOCAL_POSTGRES_URL:-}" && -f "$LOCAL_POSTGRES_URL_FILE" ]]; then
  export LOCAL_POSTGRES_URL="$(cat "$LOCAL_POSTGRES_URL_FILE")"
fi

if [[ -z "${LOCAL_POSTGRES_URL:-}" ]]; then
  echo "LOCAL_POSTGRES_URL is not set and $LOCAL_POSTGRES_URL_FILE does not exist." >&2
  exit 1
fi

PG_BIN_DIR="${MTN_POSTGRES_BIN_DIR:-/opt/homebrew/opt/postgresql@16/bin}"
PSQL_BIN="${PG_BIN_DIR}/psql"
if [[ ! -x "$PSQL_BIN" ]]; then
  PSQL_BIN="psql"
fi

"$PSQL_BIN" "$LOCAL_POSTGRES_URL" -v ON_ERROR_STOP=1 -Atc "select 'local_postgres_ok';"
