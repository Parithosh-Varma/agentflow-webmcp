# AgentFlow Auth — Separate Cloudflare Pages

> **Auth is a standalone Cloudflare Pages** (`agentflow-auth.pages.dev`), separate from the tool (`agentflow-hackathon.pages.dev`). This satisfies the requirement “separate the auth and the main tool to be in 2 dif separate pages — a separate page for auth in Cloudflare a new page”.

## Deploy

```bash
cd auth
npm install
npm run dev     # http://localhost:5174  (/auth, /access)
npm run build   # → dist/
npx wrangler pages deploy dist --project-name=agentflow-auth
```

## Routes

- `/` → redirect to `/auth`
- `/auth` → `AuthPage` (Sign In / Create Account) — 480px card, `Save your workflow in the database` callout, bridges `agentflow_token` to tool via `TOOL_URL/auth/callback?token=…`
- `/access` → `AccessGate` (enter 64-char access code) — verifies via `POST /api/auth/verify-access` (Worker public route), bridges `agentflow_access_token` via same callback

## Bridge

Auth and tool are **different origins** (`*.pages.dev` subdomains do not share localStorage). After success, auth does:

```ts
const token = localStorage.getItem('agentflow_token')
const accessToken = getAccessToken()
window.location.href = `${TOOL_URL}/auth/callback?token=${token}&accessToken=${accessToken}&redirect=${redirect}`
```

Tool’s `/auth/callback` (`frontend/src/pages/AuthCallback.tsx`) stores both tokens in **its own localStorage** then navigates to `/tool`:

```ts
localStorage.setItem('agentflow_token', token)
localStorage.setItem('agentflow_access_token', accessToken)
navigate('/tool')
```

`AccessContext` + `AuthContext` on the tool listen for `auth-callback` + `storage` events and re-validate via `GET /api/auth/check-access` (now public — fix in `cloudflare-backend/src/index.ts:65`) and `GET /api/auth/me`.

## Config

| Var | Default |
|---|---|
| `VITE_TOOL_URL` | `https://agentflow-hackathon.pages.dev` |
| `VITE_AUTH_URL` (tool side) | `https://agentflow-auth.pages.dev` |

## SPA fallback

`public/_redirects` contains `/* /index.html 200` — required for Cloudflare Pages SPA routing.

## Shared code

Copied from `frontend/` (same Worker API):

- `src/api.ts` (`https://agentflow.parithosh.workers.dev`)
- `src/context/AuthContext.tsx`, `AccessContext.tsx`
- `src/pages/AuthPage.tsx`, `AccessGate.tsx` + CSS
- `src/App.css` / `index.css` tokens

Tool’s `frontend/src/App.tsx` now hosts **only the tool** (`/`, `/tool`, `/auth/callback`; `/auth` & `/access` redirect externally to this Pages). `RequireAccess` shows “Unlock on auth site →” interstitial instead of inline gate.
