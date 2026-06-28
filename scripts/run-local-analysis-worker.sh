#!/bin/zsh
set -euo pipefail

cd /Users/mantori/vibecoding/MTN

LOCAL_POSTGRES_URL_FILE="${MTN_LOCAL_POSTGRES_URL_FILE:-/Users/mantori/.config/mtn/local-postgres-url}"
if [[ -f "$LOCAL_POSTGRES_URL_FILE" ]]; then
  export LOCAL_POSTGRES_URL="$(cat "$LOCAL_POSTGRES_URL_FILE")"
fi

exec node --env-file=.env.local scripts/local-analysis-worker.mjs "$@"
