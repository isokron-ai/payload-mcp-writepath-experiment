# Source to export the sandbox's settings (secret values come from ~/.payload-mcp-exp/app.env; never printed).
set -a; . "$HOME/.payload-mcp-exp/app.env"; set +a
export PAYLOAD_URL=http://127.0.0.1:3093
