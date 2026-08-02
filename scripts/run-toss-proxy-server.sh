#!/bin/zsh
set -euo pipefail

cd /Users/mantori/vibecoding/MTN

SECRET_FILE="${MTN_TOSS_PROXY_SECRET_FILE:-/Users/mantori/.config/mtn/toss-proxy-secret}"
if [[ ! -f "$SECRET_FILE" ]]; then
  echo "Missing Toss proxy secret file: $SECRET_FILE" >&2
  exit 1
fi

export TOSS_PROXY_SECRET="$(cat "$SECRET_FILE")"

BUILD_ID_FILE="${MTN_TOSS_BUILD_ID_FILE:-/Users/mantori/vibecoding/MTN/.next/BUILD_ID}"
if [[ ! -s "$BUILD_ID_FILE" ]]; then
  echo "Missing pinned production build: $BUILD_ID_FILE" >&2
  echo "Run npm run build after the release preflight, then restart this service." >&2
  exit 1
fi

export NODE_ENV=production
exec npm run start -- --hostname 127.0.0.1 --port "${MTN_TOSS_PROXY_PORT:-3000}"
