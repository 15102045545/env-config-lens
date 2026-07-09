#!/bin/zsh
set -euo pipefail

ROOT_DIR="/Users/chongwen002/project/env-config-lens"
LOG_DIR="$ROOT_DIR/.local/logs"
OUT_LOG="$LOG_DIR/env-config-lens.launchd.out.log"
ERR_LOG="$LOG_DIR/env-config-lens.launchd.err.log"

mkdir -p "$LOG_DIR"
: > "$OUT_LOG"
: > "$ERR_LOG"

exec > >(tee "$OUT_LOG")
exec 2> >(tee "$ERR_LOG" >&2)

cd "$ROOT_DIR"

echo "Env Config Lens LaunchAgent starting at $(date '+%Y-%m-%d %H:%M:%S %z')"
echo "Working directory: $ROOT_DIR"
echo "Output log: $OUT_LOG"
echo "Error log: $ERR_LOG"
echo "Service entry: pnpm exec tsx src/server/main.ts"

exec pnpm exec tsx src/server/main.ts
