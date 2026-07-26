#!/bin/zsh
set -euo pipefail

cd /Users/mantori/vibecoding/MTN

NODE24_BIN="/opt/homebrew/opt/node@24/bin/node"
if [[ ! -x "$NODE24_BIN" ]]; then
  print -u2 "Required Node 24 runtime is missing: $NODE24_BIN"
  exit 1
fi

LOCAL_POSTGRES_URL_FILE="${MTN_LOCAL_POSTGRES_URL_FILE:-/Users/mantori/.config/mtn/local-postgres-url}"
if [[ -f "$LOCAL_POSTGRES_URL_FILE" ]]; then
  export LOCAL_POSTGRES_URL="$(cat "$LOCAL_POSTGRES_URL_FILE")"
fi

exec "$NODE24_BIN" --env-file=.env.local scripts/local-analysis-worker.mjs "$@"
