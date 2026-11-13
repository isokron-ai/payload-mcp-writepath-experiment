#!/usr/bin/env bash
# Run a sandbox Payload app on loopback (next dev: Postgres schema push; loopback only).
#   MCP_BUILD=baseline sandbox/serve.sh   app/ (vendor @payloadcms/plugin-mcp 3.93.0) on 127.0.0.1:3093
#   MCP_BUILD=research sandbox/serve.sh   build/app-research/ (build/build-research.sh) on 127.0.0.1:3094
#   MCP_BUILD=research-v2 sandbox/serve.sh   build/app-research-v2/ (build.sh app research-v2) on 127.0.0.1:3095
#   MCP_BUILD=research-v2-1 sandbox/serve.sh build/app-research-v2-1/ (build.sh app research-v2-1) on 127.0.0.1:3096
# Both use the same Postgres; runs are sequential and every run reseeds.
set -euo pipefail
cd "$(dirname "$0")"; . ./env.sh
export NEXT_TELEMETRY_DISABLED=1
case "${MCP_BUILD:-baseline}" in
  baseline) cd ../app; PORT=3093 ;;
  research) cd ../build/app-research; PORT=3094 ;;
  research-v2) cd ../build/app-research-v2; PORT=3095 ;;
  research-v2-1) cd ../build/app-research-v2-1; PORT=3096 ;;
  *) echo "MCP_BUILD must be baseline, research, research-v2 or research-v2-1" >&2; exit 2 ;;
esac
exec node_modules/.bin/next dev -H 127.0.0.1 -p "$PORT"
