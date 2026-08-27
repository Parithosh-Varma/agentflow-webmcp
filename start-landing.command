#!/bin/zsh
# AgentFlow — Landing Page (static) · double-click to run
# Port 5175 · landing/index.html · http://localhost:5175/
# Separate Pages: agentflow-landing.pages.dev — Go→auth (5174), Skip→tool (5173)

set -e
PROJECT_DIR="/Users/varma/Downloads/WEBMCP/agentflow/landing"
PORT=5175

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AgentFlow Landing — localhost:$PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Project: $PROJECT_DIR"
echo ""

echo "→ Checking port $PORT..."
lsof -ti:$PORT | xargs kill -9 2>/dev/null && echo "  killed old process" || echo "  port free"
sleep 1

cd "$PROJECT_DIR/.."

echo ""
echo "→ Starting static server on http://localhost:$PORT/"
echo "  Landing: http://localhost:$PORT/"
echo "  Go button → http://localhost:5174/auth (auth service)"
echo "  Skip      → http://localhost:5173/tool (tool, anon)"
echo "  Prod:     https://agentflow-landing.pages.dev/"
echo "  Tool:     run start-tool.command (5173)"
echo "  Auth:     run start-auth.command (5174)"
echo ""

(sleep 1 && open "http://localhost:$PORT/" 2>/dev/null &)

# Use Python http.server (always available on macOS) — no npm needed
# Serves landing/ at /  (index.html at http://localhost:5175/)
python3 -m http.server $PORT --directory "$PROJECT_DIR"
