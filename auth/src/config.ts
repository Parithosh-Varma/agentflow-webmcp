// Separate Cloudflare Pages URLs — tool lives on agentflow-hackathon, auth lives on agentflow-auth.
// Overridable via Vite env: VITE_TOOL_URL / VITE_AUTH_URL
export const TOOL_URL =
  (import.meta as any).env?.VITE_TOOL_URL?.replace(/\/$/, '') ||
  'https://agentflow-hackathon.pages.dev'

export const AUTH_URL =
  (import.meta as any).env?.VITE_AUTH_URL?.replace(/\/$/, '') ||
  'https://agentflow-auth.pages.dev'

export const GOOGLE_CLIENT_ID =
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  (import.meta as any).env?.GOOGLE_CLIENT_ID ||
  ''

// After auth success, redirect to tool with tokens in query (cross-origin bridge via /auth/callback)
export function buildToolCallbackUrl(params: { token?: string | null; accessToken?: string | null; redirect?: string | null }) {
  const url = new URL(`${TOOL_URL}/auth/callback`)
  if (params.token) url.searchParams.set('token', params.token)
  if (params.accessToken) url.searchParams.set('accessToken', params.accessToken)
  if (params.redirect) url.searchParams.set('redirect', params.redirect)
  return url.toString()
}
