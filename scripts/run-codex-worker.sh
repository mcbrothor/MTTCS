#!/bin/zsh
set -euo pipefail

cd /Users/mantori/vibecoding/MTN

export PATH="/Users/mantori/.local/node/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export CODEX_CLI_BIN="${CODEX_CLI_BIN:-/Users/mantori/.local/node/bin/codex}"

exec /Users/mantori/.local/node/bin/npm run codex:worker
