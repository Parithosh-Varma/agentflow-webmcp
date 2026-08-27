#!/bin/zsh
# AgentFlow — Auth Service (separate Cloudflare Pages) · double-click to run
# Port 5174 · auth/vite · http://localhost:5174/auth
# Separate Pages: agentflow-auth.pages.dev — bridges token to tool via /auth/callback

set -e
PROJECT_DIR="/Users/varma/Downloads/WEBMCP/agentflow/auth"
PORT=5174

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AgentFlow Auth — localhost:$PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Project: $PROJECT_DIR"
echo ""

echo "→ Checking port $PORT..."
lsof -ti:$PORT | xargs kill -9 2>/dev/null && echo "  killed old process" || echo "  port free"
sleep 1

cd "$PROJECT_DIR"

if [ ! -d "node_modules" ]; then
  echo "→ Installing deps..."
  npm install
fi

echo ""
echo "→ Starting Vite on http://localhost:$PORT/"
echo "  Auth:    http://localhost:$PORT/auth  (Sign In / Create Account)"
echo "  Gate:    http://localhost:$PORT/access (64-char access code → bridges to tool)"
echo "  Root:    http://localhost:$PORT/ → redirects to /auth"
echo "  Prod:    https://agentflow-auth.pages.dev/auth"
echo "  Bridges: token + accessToken → http://localhost:5173/auth/callback?token=…"
echo "  (Tool is separate on :5173 — run start-tool.command)"
echo ""

(sleep 2 && open "http://localhost:$PORT/auth" 2>/dev/null &)

npm run dev
