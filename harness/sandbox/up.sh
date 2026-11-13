#!/usr/bin/env bash
# Start the sandbox Postgres (compose project isokron-payload-mcp-2026-11), loopback only.
set -euo pipefail
cd "$(dirname "$0")"; . ./env.sh
docker compose -f compose.yaml up -d --wait
