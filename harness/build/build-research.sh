#!/usr/bin/env bash
# Build the research plugin into build/app-research (a clone of app/ with its own node_modules, git-ignored).
#   build/build-research.sh [SRC]
# SRC: a full payloadcms/payload clone with the research commits checked out (required). Every .ts file that
# differs from v3.93.0 (git diff) is transpiled with esbuild (ESM, no bundling, import paths kept) and REPLACES the
# matching dist/*.js of the installed @payloadcms/plugin-mcp 3.93.0 in build/app-research (rm then write: the
# installed files are pnpm hard links, never edited in place). Writes build/out/research/BUILD.json.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLONE="${1:?usage: build/build-research.sh <payload clone with the research commits>}"
APP="$ROOT/build/app-research"
[ -d "$APP/node_modules" ] || { echo "no $APP (cp -c -R app build/app-research first)" >&2; exit 2; }
PLUGIN="$(cd "$APP/node_modules/@payloadcms/plugin-mcp" && pwd -P)"
case "$PLUGIN" in "$APP"/*) ;; *) echo "refused: plugin resolves outside build/app-research: $PLUGIN" >&2; exit 2;; esac
ESBUILD="$(ls -d "$ROOT"/app/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/bin/esbuild)"
cd "$CLONE"
BRANCH_HEAD="$(git rev-parse HEAD)"
mapfile -t FILES < <( { git diff --name-only v3.93.0 -- packages/plugin-mcp/src; git ls-files --others --exclude-standard packages/plugin-mcp/src; } | grep '\.ts$' | grep -v '\.spec\.ts$' | sort -u)
mkdir -p "$ROOT/build/out/research"
: > "$ROOT/build/out/research/files.txt"
for f in "${FILES[@]}"; do
  rel="${f#packages/plugin-mcp/src/}"
  out="$PLUGIN/dist/${rel%.ts}.js"
  mkdir -p "$(dirname "$out")"
  rm -f "$out" "$out.map"
  "$ESBUILD" "$f" --format=esm --platform=node --target=es2022 --log-level=warning --outfile="$out"
  printf '%s %s\n' "$(shasum -a 256 "$out" | cut -d' ' -f1)" "dist/${rel%.ts}.js" >> "$ROOT/build/out/research/files.txt"
done
cat > "$ROOT/build/out/research/BUILD.json" <<EOF
{ "build": "research", "base": "@payloadcms/plugin-mcp 3.93.0 (npm) / v3.93.0 77425c50", "source_commit": "$BRANCH_HEAD",
  "dirty_source": $( [ -z "$(git status --porcelain -- packages/plugin-mcp/src)" ] && echo false || echo true ),
  "files": $(wc -l < "$ROOT/build/out/research/files.txt" | tr -d ' '), "esbuild": "$("$ESBUILD" --version)", "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" }
EOF
cat "$ROOT/build/out/research/BUILD.json"
