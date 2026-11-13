#!/usr/bin/env bash
# Build and check the plugin builds from this repository alone (bash 3.2 or later, git, Node).
#
#   harness/build/build.sh check-upstream        tag upstream-v3.93.0 holds upstream's packages/plugin-mcp and LICENSE.md
#                                                 unmodified (tree and blob ids equal upstream's at 77425c50)
#   harness/build/build.sh check-patches         git am patches/ onto upstream-v3.93.0, one build at a time, and compare
#                                                 packages/plugin-mcp with the build tags and with this branch (tree ids)
#   harness/build/build.sh transpile [BUILD] [OUT]
#                                                 transpile every .ts file the build changes against upstream-v3.93.0
#                                                 (esbuild 0.25.12, ESM, no bundling) into OUT/<build>/dist and compare
#                                                 the sha256 list with the measured build's list in results/builds/.
#                                                 BUILD: v1, v2, v2.1 or all (default all)
#   harness/build/build.sh app baseline|research|research-v2|research-v2-1
#                                                 baseline: nothing to build (harness/app runs the npm package unmodified).
#                                                 The others copy harness/app to harness/build/app-<name> and replace the
#                                                 matching dist/*.js of its installed @payloadcms/plugin-mcp 3.93.0 with
#                                                 the transpiled files (MCP_BUILD=<name> harness/sandbox/serve.sh)
#
# Builds: upstream = tag upstream-v3.93.0; v1 = research-v1-v3.93.0 (patches 0001-0005, the benchmarked build);
# v2 = research-v2-v3.93.0 (+0006); v2.1 = research-v2.1-v3.93.0 (+0007; packages/plugin-mcp on main is v2.1).
# ESBUILD may point at an esbuild 0.25.12 binary; otherwise harness/app's copy is used (after `pnpm install` in
# harness/app), then `npx esbuild@0.25.12`. Nothing here needs network access except pnpm/npx, and nothing writes outside
# this repository, OUT and TMPDIR. The build tags must be present (`git fetch --tags` if the clone has none).
set -euo pipefail
REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
HARNESS="$REPO/harness"
BASE_TAG=upstream-v3.93.0
UPSTREAM_PLUGIN_TREE=d5843d4a9baf977379c6ec74694b17f51824b377   # payloadcms/payload 77425c50:packages/plugin-mcp
UPSTREAM_LICENSE_BLOB=b31f1fb3a1fdfb07ea047b17323b864f8542224e  # payloadcms/payload 77425c50:LICENSE.md

build_tag() { case "$1" in v1) echo research-v1-v3.93.0;; v2) echo research-v2-v3.93.0;; v2.1) echo research-v2.1-v3.93.0;; *) echo "unknown build $1 (v1, v2, v2.1)" >&2; exit 2;; esac; }
build_list() { case "$1" in v1) echo "$REPO/results/builds/research-files.txt";; v2) echo "$REPO/results/builds/research-v2-files.txt";; v2.1) echo "$REPO/results/builds/research-v2-1-files.txt";; esac; }
build_patches() { case "$1" in v1) echo "0001 0002 0003 0004 0005";; v2) echo "0006";; v2.1) echo "0007";; esac; }

need_tags() {
  local t; for t in "$BASE_TAG" research-v1-v3.93.0 research-v2-v3.93.0 research-v2.1-v3.93.0; do
    git -C "$REPO" rev-parse -q --verify "refs/tags/$t" >/dev/null || { echo "missing tag $t: run 'git fetch --tags'" >&2; exit 2; }
  done
}

esbuild_cmd() {
  if [ -n "${ESBUILD:-}" ]; then echo "$ESBUILD"; return; fi
  local p="$HARNESS/app/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/bin/esbuild"
  if [ -x "$p" ]; then echo "$p"; return; fi
  echo "npx --yes esbuild@0.25.12"
}

tmp_worktree() { # $1 ref -> prints a fresh detached worktree path
  local d; mkdir -p "${TMPDIR:-/tmp}"; d="$(mktemp -d "${TMPDIR:-/tmp}/payload-exp.XXXXXX")"; rmdir "$d"
  git -C "$REPO" worktree add -q --detach "$d" "$1"; echo "$d"
}

check_upstream() {
  need_tags
  local t l m
  t="$(git -C "$REPO" rev-parse "$BASE_TAG:packages/plugin-mcp")"; l="$(git -C "$REPO" rev-parse "$BASE_TAG:LICENSE.md")"
  m="$(git -C "$REPO" rev-parse HEAD:LICENSE.md)"
  echo "$BASE_TAG:packages/plugin-mcp $t (upstream $UPSTREAM_PLUGIN_TREE)"
  echo "$BASE_TAG:LICENSE.md          $l (upstream $UPSTREAM_LICENSE_BLOB; HEAD $m)"
  if [ "$t" = "$UPSTREAM_PLUGIN_TREE" ] && [ "$l" = "$UPSTREAM_LICENSE_BLOB" ] && [ "$m" = "$UPSTREAM_LICENSE_BLOB" ]; then
    echo "OK: the upstream build is payloadcms/payload v3.93.0, unmodified"
  else
    echo "MISMATCH" >&2; exit 1
  fi
}

check_patches() {
  need_tags
  local wt b p got want fail=0
  wt="$(tmp_worktree "$BASE_TAG")"
  for b in v1 v2 v2.1; do
    for p in $(build_patches "$b"); do
      git -C "$wt" -c user.name=check -c user.email=check@example.invalid am -q "$REPO"/patches/"$p"-*.patch
    done
    got="$(git -C "$wt" rev-parse HEAD:packages/plugin-mcp)"; want="$(git -C "$REPO" rev-parse "$(build_tag "$b"):packages/plugin-mcp")"
    if [ "$got" = "$want" ]; then echo "OK: patches -> $b: tree $got = $(build_tag "$b")"; else echo "MISMATCH: patches -> $b: $got, tag $want" >&2; fail=1; fi
  done
  want="$(git -C "$REPO" rev-parse HEAD:packages/plugin-mcp)"
  if [ "$got" = "$want" ]; then echo "OK: packages/plugin-mcp on HEAD = v2.1 ($want)"; else echo "MISMATCH: HEAD packages/plugin-mcp $want" >&2; fail=1; fi
  git -C "$REPO" worktree remove --force "$wt"
  [ "$fail" = 0 ]
}

transpile_one() { # $1 build (v1|v2|v2.1), $2 OUT root
  local b="$1" out="$2/$1" ref measured es wt f rel o list
  ref="$(build_tag "$b")"; measured="$(build_list "$b")"
  es="$(esbuild_cmd)"; mkdir -p "$out/dist"; list="$out/files.txt"; : > "$list"
  wt="$(tmp_worktree "$ref")"
  for f in $(git -C "$REPO" diff --name-only "$BASE_TAG" "$ref" -- packages/plugin-mcp/src | grep '\.ts$' | grep -v '\.spec\.ts$' | sort); do
    rel="${f#packages/plugin-mcp/src/}"; o="$out/dist/${rel%.ts}.js"; mkdir -p "$(dirname "$o")"; rm -f "$o"
    # The upstream tsconfig extends a monorepo file that is not in this repository; esbuild warns and the output
    # is unaffected (the hashes match the measured build).
    (cd "$wt" && $es "$f" --format=esm --platform=node --target=es2022 --log-level=error --outfile="$o")
    printf '%s %s\n' "$(shasum -a 256 "$o" | cut -d' ' -f1)" "dist/${rel%.ts}.js" >> "$list"
  done
  git -C "$REPO" worktree remove --force "$wt"
  sort -k2 "$list" -o "$list"
  echo "$b: transpiled $(wc -l < "$list" | tr -d ' ') files from $ref into $out/dist"
  if sort -k2 "$measured" | diff - "$list" >/dev/null; then
    echo "OK: $b identical to the measured build (${measured#"$REPO"/})"
  else
    echo "DIFFERENT from the measured build:" >&2; sort -k2 "$measured" | diff - "$list" >&2 || true; return 1
  fi
}

transpile() { # $1 build or all, $2 OUT root
  need_tags
  local b fail=0
  if [ "$1" = all ]; then for b in v1 v2 v2.1; do transpile_one "$b" "$2" || fail=1; done; else transpile_one "$1" "$2" || fail=1; fi
  [ "$fail" = 0 ]
}

app_research() { # $1 build (v1|v2|v2.1), $2 app name
  [ -d "$HARNESS/app/node_modules" ] || { echo "run 'pnpm install --frozen-lockfile' in harness/app first" >&2; exit 2; }
  local app="$HARNESS/build/app-$2" plugin out
  rm -rf "$app"; cp -R "$HARNESS/app" "$app"
  plugin="$(cd "$app/node_modules/@payloadcms/plugin-mcp" && pwd -P)"
  case "$plugin" in "$app"/*) ;; *) echo "refused: plugin resolves outside $app: $plugin" >&2; exit 2;; esac
  out="$(mktemp -d "${TMPDIR:-/tmp}/payload-exp-out.XXXXXX")"
  transpile "$1" "$out"
  # pnpm installs packages as hard links into its store: remove each target before writing, never edit in place.
  (cd "$out/$1/dist" && find . -name '*.js' | while read -r js; do rm -f "$plugin/dist/$js" "$plugin/dist/$js.map"; mkdir -p "$(dirname "$plugin/dist/$js")"; cp "$js" "$plugin/dist/$js"; done)
  rm -rf "$out"
  echo "$2 build ready in harness/build/app-$2 (MCP_BUILD=$2 harness/sandbox/serve.sh)"
}

case "${1:-}" in
  check-upstream) check_upstream ;;
  check-patches) check_patches ;;
  transpile) transpile "${2:-all}" "${3:-$HARNESS/build/out}" ;;
  app) case "${2:-}" in
         baseline) echo "baseline: harness/app runs @payloadcms/plugin-mcp 3.93.0 from npm, unmodified (pnpm-lock.yaml pins its integrity)" ;;
         research) app_research v1 research ;;
         research-v2) app_research v2 research-v2 ;;
         research-v2-1) app_research v2.1 research-v2-1 ;;
         *) echo "usage: build.sh app baseline|research|research-v2|research-v2-1" >&2; exit 2;;
       esac ;;
  *) sed -n '2,23p' "$0"; exit 2 ;;
esac
