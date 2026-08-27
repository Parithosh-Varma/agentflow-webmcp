# AgentFlow — Human × Agent Canvas × WebMCP

> **One canvas. Two operators.** A visual workflow instrument where you and your browser agent (Chrome · ChatGPT in-app) build the same machine.

[![Live: App](https://img.shields.io/badge/app-agentflow--hackathon.pages.dev-%23e8a33d?style=flat-square)](https://agentflow-hackathon.pages.dev)
[![Live: Landing](https://img.shields.io/badge/landing-agentflow--landing.pages.dev-56cdbd?style=flat-square)](https://agentflow-landing.pages.dev)
[![Paper](https://img.shields.io/badge/paper-PAPER.md%20(KaTeX)-8f9fdd?style=flat-square)](./PAPER.md)
[![Paper PDF](https://img.shields.io/badge/paper-PAPER.pdf-ff6b9d?style=flat-square)](./PAPER.pdf)
[![License: MIT](https://img.shields.io/badge/license-MIT-ede8dc?style=flat-square)](./LICENSE)

<p align="center">
  <img src="https://d112y698adiu2z.cloudfront.net/photos/production/challenge_photos/005/137/486/datas/full_width.png" alt="Challenge — AgentFlow WebMCP" style="max-width:800px; width:100%; background:transparent;" />
</p>

---

## What it does

Drag 15 typed modules (API Call, Transform, Condition, AI, …) onto a grid-aware canvas, wire pins, and press **RUN**. Or tell your browser agent:

> *“Add an API Call to GitHub, connect it to Start, and run the workflow”*

The agent calls the same 19 structured WebMCP tools you would — `add_node`, `connect_nodes`, `run` — and you watch amber → cyan signals march across the same wires. No DOM scraping, no guessing.

**Live:**

| Surface | URL | Cloudflare Pages | Notes |
|---|---|---|---|
| **Landing** | `https://agentflow-landing.pages.dev` | `agentflow-landing` | Hero → `Go to auth` (`agentflow-auth/auth` via bridge) + `Skip → tool` + transparent hero |
| **Auth** | `https://agentflow-auth.pages.dev` (`/auth`, `/access`) | `agentflow-auth` **NEW — separate Pages** | Spacious 480px card, `Save your workflow…` callout, bridges `token`/`accessToken` to tool via `/auth/callback` |
| **Tool** | `https://agentflow-hackathon.pages.dev` (`/`, `/tool` + `/auth/callback`) | `agentflow-hackathon` | Canvas + Sidebar + Run panel · gated via `accessToken` from auth Pages |
| **Stats** | `https://agentflow-stats.pages.dev` / `landing/dashboard.html` | `agentflow-stats` | Mission control |

**Flow:** `Landing (landing.pages.dev)` —*Go to auth*→ `Auth (auth.pages.dev/auth)` —*Sign in*→ `Tool (hackathon.pages.dev/auth/callback?token=…) → /tool` **or** `Skip` → `Tool` anonymously. Anonymous can run; persistence requires sign-in (D1). Auth and tool are **2 separate Cloudflare Pages** bridged cross-origin via `/auth/callback` (tool stores `agentflow_token`/`agentflow_access_token` in its own localStorage).

---

## Why WebMCP?

The page *declares* tools; the browser *mediates* them.

```ts
await document.modelContext.registerTool({
  name: "add_node",
  description: "Add a workflow node…",
  inputSchema: { type: "object", properties: { type: { enum: ["api_call", …] } } },
  execute: async ({ type, label }) => { /* add to canvas */ }
}, { signal: controller.signal });
```

* **Human →** drag, wire, `RUN` (amber)
* **Agent →** `get_available_tools` → `add_node` → `connect_nodes` → `execute_workflow` (cyan) — same engine, same `ToolLog`

**Chrome + ChatGPT in-app only** (per product scope). Enable one setting in Chrome:

```
chrome://flags → search “WebMCP” → Enabled → Relaunch
# or launch with --enable-features=WebMCP
```

In-app ChatGPT: enable `WebMCP / Agent Mode` in its settings. The toast (`AgentToast.tsx`) detects `document.modelContext.registerTool` and shows `WebMCP detected` vs `Requires one setting` with a `Copy` for `chrome://flags/#webmcp`.

---

## Features

- **Polished sidebar** (`Sidebar.tsx`): `Connect / Logic / Transform / Output` groups (3/5/5/2), search (`/`), pills, drag-to-canvas (`application/agentflow` JSON), interactive `On Canvas` list (focus ⊙, duplicate ⧉, delete ×, `liveStatus` dot).
- **Grid-aware layout** (`utils/grid.ts`): snap `X0=80,Y0=80, Δx=280,Δy=90`, spiral `findNearestOpenSlot`, downstream push on `connect_nodes` with `MIN_GAP_y=86`.
- **Dedicated auth page** (`pages/AuthPage.tsx`): 1080px grid (`1fr 480px`), `Save your workflow in the database — Sign in to persist… Skip to try without saving` callout, `Skip for now` ghost + `Skip → Go to tool without signing in`.
- **Landing outside `frontend/`** (`landing/index.html`): `Go to the tool → /auth` + `Skip` + `Database • Sync` highlight + transparent challenge hero (`background:transparent` integrated).
- **Agent toast** (`AgentToast.tsx`): Chrome + ChatGPT only, `chrome://flags` copy, `Got it` / `Don’t show again` (`localStorage`).
- **Challenge banner** (`ChallengeBanner.tsx`): full-width hero, `max-height:260px`, `object-fit:contain`, `background:transparent` on both landing and tool.
- **Execution engine** (`engine.ts`): DAG `G=(V,E)` → topological order → per-node `f_v`, `O(|V|+|E|)`; `beforeunload` guard if `|V|>1 ∨ |E|>0 ∨ isExecuting`.

---

## WebMCP — 19 Tools

| # | Tool | Input |
|---|---|---|
| 1 | `add_node` | `{type, label, x?, y?}` |
| 2 | `connect_nodes` | `{sourceNodeId, targetNodeId, label?}` |
| 3 | `execute_workflow` | `{input?}` |
| 4 | `get_available_tools` | `{}` |
| 5 | `get_node_details` | `{nodeId}` |
| 6 | `update_node_config` | `{nodeId, config}` |
| 7 | `get_workflow_status` | `{}` |
| 8 | `validate_workflow` | `{}` |
| 9 | `delete_node` | `{nodeId}` |
| 10 | `clone_node` | `{nodeId, offsetX?, offsetY?}` |
| 11 | `get_node_connections` | `{nodeId}` |
| 12 | `save_workflow` | `{name}` |
| 13 | `load_workflow` | `{name}` |
| 14 | `run_node` | `{nodeId, input?}` |
| 15 | `set_node_position` | `{nodeId, x, y}` |
| 16 | `get_workflow_history` | `{}` |
| 17 | `create_template` | `{name, description?}` |
| 18 | `export_workflow` | `{pretty?}` |
| 19 | `import_workflow` | `{json, merge?}` |

All registered via `document.modelContext.registerTool` with `AbortSignal` lifecycle (`webmcp.ts:40`), exposed on `window.__agentflow` for `callTool`/`listTools` and `window.__webmcpReady`.

Formal model (see `PAPER.md` for KaTeX):

$$
G=(V,E),\quad \text{topo}(G)=\langle v_{\pi(1)},\dots,v_{\pi(n)}\rangle,\quad
y_{\pi(k)} = f_{v_{\pi(k)}}\!\left(\bigoplus_{j:(v_j,v_{\pi(k)})\in E} y_j, I\right)
$$

$$
x' = X_0 + \Delta_x\cdot\operatorname{round}\!\left(\frac{x-X_0}{\Delta_x}\right),\quad
T(G)=O(|V|+|E|+\sum_{v}c(v)),\quad
\rho=\frac{|\{r:s(r)=\text{success}\}|}{|R|}
$$

---

## Architecture

```
Landing (static)                Auth (separate Pages)              Tool (React Flow)
agentflow-landing.pages.dev ──→ agentflow-auth.pages.dev ──/callback?token──→ agentflow-hackathon.pages.dev ──registerTool──→ Chrome / ChatGPT
     │  Go→auth (auth host)          │ /auth + /access · JWT            │ Sidebar + Canvas + Run panel
     │  Skip→tool                    │ bridges via /auth/callback ──────┘
     └───────────────────────────────┴────→ Engine (topo) ──→ Workers/D1 (/api/*)
                                    ↑ separate deploy, shared API, CORS allows X-Access-Token
```

*Frontend (tool)* `frontend/` — React 19 + TypeScript + `@xyflow/react` 12 + `react-router-dom` 7 + `uuid` + `webmcp-types` → deploys to `agentflow-hackathon.pages.dev` (tool-only, `/auth` redirects to auth Pages, gated via `RequireAccess` → external `agentflow-auth/access`).  
*Auth* `auth/` **NEW** — React 19 + TypeScript + `react-router-dom` → deploys to `agentflow-auth.pages.dev` (auth-only, `/auth` + `/access`, bridges `token`/`accessToken` via `TOOL_URL/auth/callback`).  
*Backend* `cloudflare-backend/` — Cloudflare Workers + D1 (`/api/auth` public: `/verify-access` + `/check-access` added, `/api/workflows` etc).  
*Deploy* — `frontend/dist` → `agentflow-hackathon.pages.dev`, `auth/dist` → `agentflow-auth.pages.dev`, `landing/` → `agentflow-landing.pages.dev`, each SPA fallback `/* /index.html 200`.

---

## Getting Started

```bash
# Auth — separate Cloudflare Pages (NEW)
cd auth
npm install
npm run dev          # http://localhost:5174/  (auth at /auth, gate at /access)
npm run build        # tsc -b && vite build → dist/
npx wrangler pages deploy dist --project-name=agentflow-auth  # → https://agentflow-auth.pages.dev

# Tool — standalone (auth redirects externally, no internal /auth UI)
cd ../frontend
npm install
npm run dev          # http://localhost:5173/  (canvas at / and /tool, /auth/callback for bridging)
npm run build
npx wrangler pages deploy dist --project-name=agentflow-hackathon  # → https://agentflow-hackathon.pages.dev

# Landing (static, now links to auth host)
npx wrangler pages deploy landing --project-name=agentflow-landing  # → https://agentflow-landing.pages.dev
# Landing Go→auth now points to https://agentflow-auth.pages.dev/auth, Skip→ https://agentflow-hackathon.pages.dev/tool

# Enable WebMCP in Chrome (for agent demo)
# 1. chrome://flags → search "WebMCP" → Enabled → Relaunch
# 2. or: chrome --enable-features=WebMCP
# 3. In ChatGPT in-app browser: Settings → Enable WebMCP / Agent Mode
```

Try: add `API Call` → `Transform` → `Condition` → `Output`, wire `Start → API → Transform → Condition` (`true`/`false` labels), press **RUN**, watch `ToolLog`.

---

## Science Paper

Full KaTeX paper: [`./PAPER.md`](./PAPER.md) — *AgentFlow: A Human–Agent Collaborative Visual Workflow Instrument via WebMCP* (abstract → architecture → formal DAG → 19 tools → grid → evaluation). Render with any KaTeX viewer:

```bash
pandoc PAPER.md -o PAPER.pdf --pdf-engine=xelatex
# or VS Code Markdown+Math
```

---

## License

MIT — see `LICENSE`. Built for the WebMCP Hackathon.

