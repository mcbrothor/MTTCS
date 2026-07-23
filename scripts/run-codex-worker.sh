#!/bin/zsh
set -euo pipefail

cd /Users/mantori/vibecoding/MTN

NODE24_BIN="/opt/homebrew/opt/node@24/bin/node"
if [[ ! -x "$NODE24_BIN" ]]; then
  print -u2 "Required Node 24 runtime is missing: $NODE24_BIN"
  exit 1
fi

export PATH="/opt/homebrew/opt/node@24/bin:/Users/mantori/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export CODEX_CLI_BIN="${CODEX_CLI_BIN:-/Users/mantori/.local/node/bin/codex}"

exec "$NODE24_BIN" --env-file=.env.local scripts/local-llm-worker.mjs "$@"
