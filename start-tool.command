#!/bin/zsh
# AgentFlow — Main Tool (Canvas) · double-click to run
# Port 5173 · frontend/vite · http://localhost:5173/ (tool at / and /tool, judge-key at /judge-key)
# Separate Cloudflare Pages: agentflow-hackathon.pages.dev

set -e
PROJECT_DIR="/Users/varma/Downloads/WEBMCP/agentflow/frontend"
PORT=5173

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AgentFlow Tool — localhost:$PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Project: $PROJECT_DIR"
echo ""

# Kill stale Vite on this port
echo "→ Checking port $PORT..."
lsof -ti:$PORT | xargs kill -9 2>/dev/null && echo "  killed old process" || echo "  port free"
sleep 1

cd "$PROJECT_DIR"

# Ensure deps
if [ ! -d "node_modules" ]; then
  echo "→ Installing deps..."
  npm install
fi

echo ""
echo "→ Starting Vite on http://localhost:$PORT/"
echo "  Tool:      http://localhost:$PORT/  (or /tool)"
echo "  JudgeKey:  http://localhost:$PORT/judge-key"
echo "  Callback:  http://localhost:$PORT/auth/callback (bridged from auth)"
echo "  Prod Tool: https://agentflow-hackathon.pages.dev"
echo "  (Auth is separate: https://agentflow-auth.pages.dev — run start-auth.command)"
echo ""

# Open browser after short delay
(sleep 2 && open "http://localhost:$PORT/" 2>/dev/null &)

# Start dev server (blocks Terminal — Ctrl+C to stop)
npm run dev
