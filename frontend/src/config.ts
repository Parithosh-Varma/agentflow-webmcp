// Separate Cloudflare Pages — auth lives on agentflow-auth, tool on agentflow-hackathon
export const AUTH_URL =
  (import.meta as any).env?.VITE_AUTH_URL?.replace(/\/$/, '') ||
  'https://agentflow-auth.pages.dev'

export const TOOL_URL =
  (import.meta as any).env?.VITE_TOOL_URL?.replace(/\/$/, '') ||
  'https://agentflow-hackathon.pages.dev'
