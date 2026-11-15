#!/usr/bin/env bash
# Unit tests of packages/plugin-mcp (vitest 3.2.4, Node 22 or later). No database, no network after the install.
#   harness/test/run.sh            install the pinned dependencies (npm ci) if needed, then run every *.spec.ts
#   harness/test/run.sh <filter>   run the spec files whose path contains <filter>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
[ -d "$HERE/node_modules/vitest" ] || (cd "$HERE" && npm ci --no-audit --no-fund)
LINK="$REPO/packages/plugin-mcp/node_modules"
if [ ! -e "$LINK" ]; then ln -s ../../harness/test/node_modules "$LINK"; fi
cd "$HERE" && exec ./node_modules/.bin/vitest run --config vitest.config.mjs "$@"
