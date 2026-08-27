#!/bin/zsh
# AgentFlow — Start All Services · double-click to run
# Launches in background:
#  5173 Tool (frontend/vite)       → http://localhost:5173/
#  5174 Auth (auth/vite)           → http://localhost:5174/auth
#  5175 Landing (static)           → http://localhost:5175/
#  8788 Judge Key (wrangler pages)→ http://localhost:8788/
# plus Worker logs
# Logs → /tmp/agentflow-*.log

set -e
ROOT="/Users/varma/Downloads/WEBMCP/agentflow"
TOOL_DIR="$ROOT/frontend"
AUTH_DIR="$ROOT/auth"
LANDING_DIR="$ROOT/landing"
JUDGE_DIR="$ROOT/judge-key-service"

PORT_TOOL=5173
PORT_AUTH=5174
PORT_LANDING=5175
PORT_JUDGE=8788

LOG_TOOL="/tmp/agentflow-tool.log"
LOG_AUTH="/tmp/agentflow-auth.log"
LOG_LANDING="/tmp/agentflow-landing.log"
LOG_JUDGE="/tmp/agentflow-judge.log"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " AgentFlow — Starting ALL services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Kill any stale processes
for p in $PORT_TOOL $PORT_AUTH $PORT_LANDING $PORT_JUDGE; do
  lsof -ti:$p 2>/dev/null | xargs kill -9 2>/dev/null || true
done
pkill -f "vite --port $PORT_TOOL" 2>/dev/null || true
pkill -f "vite --port $PORT_AUTH" 2>/dev/null || true
echo "✓ cleared old ports"

# Choose wrangler
FRONT_WRANGLER="$TOOL_DIR/node_modules/.bin/wrangler"
if [ -x "$FRONT_WRANGLER" ]; then
  WRANGLER="$FRONT_WRANGLER"
else
  WRANGLER="npx --yes wrangler"
fi

# TOOL
echo "→ Starting TOOL on http://localhost:$PORT_TOOL/"
nohup bash -c "cd '$TOOL_DIR' && npm run dev" > "$LOG_TOOL" 2>&1 &
echo "  log: $LOG_TOOL"

# AUTH
echo "→ Starting AUTH on http://localhost:$PORT_AUTH/"
nohup bash -c "cd '$AUTH_DIR' && npm run dev" > "$LOG_AUTH" 2>&1 &
echo "  log: $LOG_AUTH"

# LANDING
echo "→ Starting LANDING on http://localhost:$PORT_LANDING/"
nohup bash -c "cd '$ROOT' && python3 -m http.server $PORT_LANDING --directory '$LANDING_DIR'" > "$LOG_LANDING" 2>&1 &
echo "  log: $LOG_LANDING"

# JUDGE KEY
echo "→ Starting JUDGE KEY on http://localhost:$PORT_JUDGE/"
nohup bash -c "cd '$JUDGE_DIR' && $WRANGLER pages dev public --port $PORT_JUDGE" > "$LOG_JUDGE" 2>&1 &
echo "  log: $LOG_JUDGE"

# Wait for Vite to become ready
echo ""
echo "Waiting for services to boot..."
for i in {1..30}; do
  if curl -s -o /dev/null -I "http://localhost:$PORT_TOOL/"; then break; fi
  sleep 1
done

# Open browsers
sleep 2
open "http://localhost:$PORT_LANDING/" 2>/dev/null &
open "http://localhost:$PORT_AUTH/auth" 2>/dev/null &
open "http://localhost:$PORT_TOOL/" 2>/dev/null &
open "http://localhost:$PORT_JUDGE/" 2>/dev/null &

cat <<'BANNER'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 AgentFlow — All services started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

 Landing : http://localhost:5175/      → start-landing.command
 Auth    : http://localhost:5174/auth  → start-auth.command
 Tool    : http://localhost:5173/      → start-tool.command  (/tool, /judge-key)
 Judge   : http://localhost:8788/      → start-judge-key.command
 Worker  : https://agentflow.parithosh.workers.dev/api/health (prod)

 Logs:
   /tmp/agentflow-tool.log
   /tmp/agentflow-auth.log
   /tmp/agentflow-landing.log
   /tmp/agentflow-judge.log

 Prod:
   Landing  https://agentflow-landing.pages.dev/
   Auth     https://agentflow-auth.pages.dev/auth
   Tool     https://agentflow-hackathon.pages.dev/
   Judge    https://agentflow-judge-key.pages.dev/  (wrangler pages deploy)

 Stop:
   pkill -f "vite --port 5173"; pkill -f "vite --port 5174"
   lsof -ti:5175 | xargs kill; lsof -ti:8788 | xargs kill

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BANNER

tail -f "$LOG_TOOL" "$LOG_AUTH" "$LOG_LANDING" "$LOG_JUDGE" 2>/dev/null || true
