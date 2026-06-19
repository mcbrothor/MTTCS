#!/bin/zsh
set -euo pipefail

cd /Users/mantori/vibecoding/MTN

SECRET_FILE="${MTN_TOSS_PROXY_SECRET_FILE:-/Users/mantori/.config/mtn/toss-proxy-secret}"
if [[ ! -f "$SECRET_FILE" ]]; then
  echo "Missing Toss proxy secret file: $SECRET_FILE" >&2
  exit 1
fi

export TOSS_PROXY_SECRET="$(cat "$SECRET_FILE")"
exec npm run dev
