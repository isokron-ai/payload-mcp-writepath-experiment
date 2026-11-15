#!/usr/bin/env bash
# Type-check packages/plugin-mcp/src (strict, no emit) against the packages harness/app installs: payload 3.93.0 and
# the plugin's own dependencies as @payloadcms/plugin-mcp 3.93.0 resolves them, with TypeScript 5.7.3. Run
# `pnpm install --frozen-lockfile` in harness/app first. Tests and test fixtures are left out. Writes nothing in the
# repository except a temporary node_modules link and tsconfig in packages/plugin-mcp, both removed on exit.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"; APP="$REPO/harness/app/node_modules"
[ -d "$APP/payload" ] || { echo "run 'pnpm install --frozen-lockfile' in harness/app first" >&2; exit 2; }
PLUGIN_DEPS="$(cd "$APP/@payloadcms/plugin-mcp" && pwd -P)/../.."
NM="$(mktemp -d "${TMPDIR:-/tmp}/plugin-mcp-types.XXXXXX")"; PKG="$REPO/packages/plugin-mcp"; LINK="$PKG/node_modules"
OLD="$(readlink "$LINK" 2>/dev/null || true)"
cleanup() { rm -f "$PKG/tsconfig.typecheck.json" "$LINK"; [ -n "$OLD" ] && ln -s "$OLD" "$LINK"; rm -rf "$NM"; }
trap cleanup EXIT
mkdir -p "$NM/@modelcontextprotocol" "$NM/@types"
ln -s "$(cd "$APP/payload" && pwd -P)" "$NM/payload"
ln -s "$(cd "$APP/typescript" && pwd -P)" "$NM/typescript"
for d in zod json-schema-to-zod mcp-handler @modelcontextprotocol/sdk @types/json-schema; do ln -s "$(cd "$PLUGIN_DEPS/$d" && pwd -P)" "$NM/$d"; done
rm -f "$LINK"; ln -s "$NM" "$LINK"
cat > "$PKG/tsconfig.typecheck.json" <<'JSON'
{ "compilerOptions": { "target": "es2022", "module": "nodenext", "moduleResolution": "nodenext", "strict": true,
    "noEmit": true, "skipLibCheck": true, "esModuleInterop": true, "types": [] },
  "include": ["src/**/*.ts"], "exclude": ["src/**/*.spec.ts", "src/**/*.spec-utils.ts"] }
JSON
"$APP/.bin/tsc" -p "$PKG/tsconfig.typecheck.json" && echo "OK: packages/plugin-mcp/src type-checks (0 errors)"
