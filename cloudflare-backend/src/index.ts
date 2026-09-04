// Cloudflare Workers — AgentFlow prod with P0/P1/P2 optimizations
import { z } from "zod";

// SECURITY: no hardcoded IPs/secrets. Configure via env / wrangler secret.
interface Env {
  DB: D1Database;
  AUTH: Fetcher;
  JWT_SECRET: string;
  ENVIRONMENT: string;
  ACCESS_CODE_HASH?: string;
  FRONTEND_URL?: string;
}
interface User { id: string; email: string; name: string; created_at: string; }
interface Workflow { id: string; user_id: string; name: string; description: string; nodes: any[]; edges: any[]; created_at: string; updated_at: string; }
interface ExecutionLog { id: string; workflow_id: string; user_id: string; input: any; output: any; duration_ms: number; status: 'success' | 'error'; executed_at: string; }

// ---- P0: Validation schemas ----
const registerSchema = z.object({ email: z.string().email().max(255), password: z.string().min(6).max(128), name: z.string().min(1).max(50).optional(), username: z.string().min(1).max(50).optional() });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const workflowSchema = z.object({ name: z.string().min(1).max(100), description: z.string().max(500).optional().default(''), nodes: z.array(z.any()).max(500).optional().default([]), edges: z.array(z.any()).max(1000).optional().default([]) });

// ---- P2: Rate limiting (in-memory, per Worker isolate) ----
const rateMap = new Map<string, { count: number; reset: number }>();
function checkRateLimit(ip: string, limit = 100, windowMs = 60000): boolean {
  const now = Date.now();
  // lazy expiration: opportunistic cleanup when map grows (no setInterval at global scope)
  if (rateMap.size > 500) {
    for (const [k, v] of rateMap) if (now > v.reset) rateMap.delete(k);
  }
  const rec = rateMap.get(ip);
  if (!rec || now > rec.reset) { rateMap.set(ip, { count: 1, reset: now + windowMs }); return true; }
  if (rec.count >= limit) return false;
  rec.count++; return true;
}
// periodic cleanup — done lazily inside checkRateLimit to avoid global-scope I/O in Workers
// (setInterval disallowed at global scope: https://developers.cloudflare.com/workers/runtime-apis/handlers/)

// ---- P2: Simple cache (hot data, 30s TTL) ----
const cacheStore = new Map<string, { data: any; exp: number }>();
function cacheGet(key: string) { const e = cacheStore.get(key); if (!e) return null; if (Date.now() > e.exp) { cacheStore.delete(key); return null; } return e.data; }
function cacheSet(key: string, data: any, ttlMs = 30000) { cacheStore.set(key, { data, exp: Date.now() + ttlMs }); if (cacheStore.size > 500) { const first = cacheStore.keys().next().value; cacheStore.delete(first); } }
function cacheDel(key: string) { cacheStore.delete(key); }

// ---- P2: Background queue ----
type QJob = { id: string; type: string; payload: any; createdAt: string; attempts: number };
const bgQueue: QJob[] = [];
const qMetrics = { enqueued: 0, processed: 0, failed: 0 };
function enqueue(type: string, payload: any) {
  const job: QJob = { id: crypto.randomUUID().slice(0,8), type, payload, createdAt: new Date().toISOString(), attempts: 0 };
  bgQueue.push(job); qMetrics.enqueued++;
  // process async without blocking response — use waitUntil if available via ctx, here fire-and-forget
  setTimeout(() => processQ(), 10);
  return job;
}
async function processQ() {
  while (bgQueue.length) {
    const job = bgQueue.shift()!;
    job.attempts++;
    try {
      if (job.type === 'webhook') {
        try { assertSafeUrl(job.payload.url); await fetch(job.payload.url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(job.payload.data), signal: AbortSignal.timeout(5000) }); } catch {}
      }
      qMetrics.processed++;
    } catch { qMetrics.failed++; if (job.attempts < 3) bgQueue.push(job); }
  }
}

// ---- P2: Metrics ----
const gMetrics = { requests: 0, errors: 0, toolCalls: 0, durations: [] as number[], start: Date.now() };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    gMetrics.requests++;
    const t0 = Date.now();

    // SECURITY: CORS allowlist (no wildcard with credential headers).
    // Set FRONTEND_URL="https://a.pages.dev,https://b.pages.dev" in wrangler vars.
    const allowedOrigins = String(env.FRONTEND_URL || 'https://agentflow-hackathon.pages.dev').split(',').map(s=>s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    // CORS + security headers
    const headers: Record<string,string> = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Access-Token',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // P0: Rate limiting per IP
    const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
    const isStrict = path === '/api/execute' || path === '/api/auth/verify-access';
    if (!checkRateLimit(ip, isStrict ? 30 : 100, 60000)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { ...headers, 'Content-Type':'application/json', 'Retry-After':'60' } });
    }

    const logDone = (res: Response) => {
      const dur = Date.now() - t0;
      gMetrics.durations.push(dur); if (gMetrics.durations.length>1000) gMetrics.durations.shift();
      if (res.status>=400) gMetrics.errors++;
      // add server-timing
      res.headers.set('Server-Timing', `total;dur=${dur}`);
      // enable compression via CF (auto) — ensure Vary
      res.headers.set('Vary', 'Accept-Encoding');
      return res;
    };

    try {
      const publicRoutes = ['/api/health', '/api/auth/login', '/api/auth/register', '/api/auth/verify-access', '/api/auth/check-access', '/api/stats', '/api/metrics', '/demo-key.json'];
      const isPublicRoute = publicRoutes.some(route => path.startsWith(route));

      let userId: string | null = null;
      if (!isPublicRoute) {
        const authHeader = request.headers.get('Authorization');
        if (authHeader?.startsWith('Bearer ')) {
          const token = authHeader.slice(7);
          userId = await verifyToken(token, env.JWT_SECRET);
        }
        if (!userId) {
          return logDone(new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } }));
        }
      }

      // Health with detailed P2 metrics
      if (path === '/api/health') {
        const res = new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), uptimeSec: Math.round((Date.now()-gMetrics.start)/1000), cacheKeys: cacheStore.size, queue: { pending: bgQueue.length, ...qMetrics } }), { headers: { ...headers, 'Content-Type': 'application/json' } });
        return logDone(res);
      }
      // P2: Metrics endpoint (JSON + Prometheus text)
      if (path === '/api/metrics') {
        const avg = gMetrics.durations.length ? Math.round(gMetrics.durations.reduce((a,b)=>a+b,0)/gMetrics.durations.length) : 0;
        const p95 = gMetrics.durations.length ? [...gMetrics.durations].sort((a,b)=>a-b)[Math.floor(gMetrics.durations.length*0.95)]||0 : 0;
        const data = { requests: gMetrics.requests, errors: gMetrics.errors, avgDurationMs: avg, p95DurationMs: p95, uptimeSec: Math.round((Date.now()-gMetrics.start)/1000), cacheKeys: cacheStore.size, queue: { pending: bgQueue.length, ...qMetrics } };
        if (request.headers.get('accept')?.includes('text/plain')) {
          let out = `agentflow_requests ${data.requests}\nagentflow_errors ${data.errors}\navg_duration_ms ${avg}\np95_duration_ms ${p95}\n`;
          return logDone(new Response(out, { headers: { ...headers, 'Content-Type':'text/plain' } }));
        }
        return logDone(new Response(JSON.stringify(data), { headers: { ...headers, 'Content-Type':'application/json' } }));
      }

      // Stats route — public (counts only, no PII); keep IP hint header
      if (path === '/api/stats' && request.method === 'GET') {
        const res = await getStats(env, headers);
        return logDone(res);
      }

      // Auth routes with validation
      if (path === '/api/auth/verify-access' && request.method === 'POST') {
        return logDone(await handleVerifyAccess(request, env, headers));
      }
      if (path === '/api/auth/check-access' && request.method === 'GET') {
        return logDone(await handleCheckAccess(request, env, headers));
      }
      if (path === '/api/auth/register' && request.method === 'POST') {
        const body = await request.json().catch(()=> ({} as any));
        const parsed = registerSchema.safeParse(body);
        if (!parsed.success) { const issues=(parsed.error as any).issues || (parsed.error as any).errors || []; return logDone(new Response(JSON.stringify({ error: issues.map((e:any)=>e.message).join(', ') || (parsed.error as any).message }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } })); }
        return logDone(await handleRegister(request, env, headers, parsed.data));
      }
      if (path === '/api/auth/login' && request.method === 'POST') {
        const body = await request.json().catch(()=> ({} as any));
        const parsed = loginSchema.safeParse(body);
        if (!parsed.success) { const issues=(parsed.error as any).issues || (parsed.error as any).errors || []; return logDone(new Response(JSON.stringify({ error: issues.map((e:any)=>e.message).join(', ') || (parsed.error as any).message }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } })); }
        return logDone(await handleLogin(request, env, headers, parsed.data));
      }
      if (path === '/api/auth/me' && request.method === 'GET') {
        return logDone(await handleMe(userId!, env, headers));
      }

      // Workflow routes — P1 clean queries + P2 cache
      if (path === '/api/workflows' && request.method === 'GET') {
        // P2: cache hot list per user (30s)
        const cacheKey = `wfs:${userId}:${url.search}`;
        const cached = cacheGet(cacheKey);
        if (cached) return logDone(new Response(JSON.stringify(cached), { headers: { ...headers, 'Content-Type':'application/json', 'X-Cache':'HIT' } }));
        const res = await getWorkflows(userId!, env, headers, url);
        try { const clone = await res.clone().json(); cacheSet(cacheKey, clone, 30000); } catch {}
        res.headers.set('X-Cache', 'MISS');
        return logDone(res);
      }
      if (path === '/api/workflows' && request.method === 'POST') {
        const body = await request.json().catch(()=> ({} as any));
        const parsed = workflowSchema.safeParse(body);
        if (!parsed.success) { const issues=(parsed.error as any).issues || (parsed.error as any).errors || []; return logDone(new Response(JSON.stringify({ error: issues.map((e:any)=>e.message).join(', ') || (parsed.error as any).message }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } })); }
        const res = await createWorkflow(request, userId!, env, headers, parsed.data);
        cacheDel(`wfs:${userId}:`);
        return logDone(res);
      }
      if (path.match(/^\/api\/workflows\/[^/]+$/) && request.method === 'GET') {
        const id = path.split('/').pop()!;
        return logDone(await getWorkflow(id, userId!, env, headers));
      }
      if (path.match(/^\/api\/workflows\/[^/]+$/) && request.method === 'PUT') {
        const id = path.split('/').pop()!;
        const body = await request.json().catch(()=> ({} as any));
        const parsed = workflowSchema.safeParse(body);
        if (!parsed.success) { const issues=(parsed.error as any).issues || (parsed.error as any).errors || []; return logDone(new Response(JSON.stringify({ error: issues.map((e:any)=>e.message).join(', ') || (parsed.error as any).message }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } })); }
        const res = await updateWorkflow(request, id, userId!, env, headers, parsed.data);
        cacheDel(`wfs:${userId}:`);
        return logDone(res);
      }
      if (path.match(/^\/api\/workflows\/[^/]+$/) && request.method === 'DELETE') {
        const id = path.split('/').pop()!;
        const res = await deleteWorkflow(id, userId!, env, headers);
        cacheDel(`wfs:${userId}:`);
        return logDone(res);
      }
      if (path.match(/^\/api\/workflows\/[^/]+\/versions$/) && request.method === 'GET') {
        const workflowId = path.split('/')[3];
        return logDone(await listWorkflowVersions(workflowId, userId!, env, headers));
      }
      if (path.match(/^\/api\/workflows\/[^/]+\/versions\/[^/]+$/) && request.method === 'GET') {
        const parts = path.split('/'); const workflowId = parts[3]; const versionId = parts[5];
        return logDone(await getWorkflowVersion(workflowId, versionId, userId!, env, headers));
      }

      // Execution routes
      if (path === '/api/execute' && request.method === 'POST') {
        gMetrics.toolCalls++;
        return logDone(await executeWorkflow(request, userId!, env, headers));
      }
      if (path.match(/^\/api\/executions\/[^/]+$/) && request.method === 'GET') {
        const workflowId = path.split('/').pop()!;
        return logDone(await getExecutionLogs(workflowId, userId!, env, headers, url));
      }

      // Template routes
      if (path === '/api/templates' && request.method === 'GET') {
        return logDone(await getTemplates(userId!, env, headers, url));
      }
      if (path === '/api/templates' && request.method === 'POST') {
        const body = await request.json().catch(()=> ({} as any));
        const parsed = workflowSchema.safeParse(body);
        if (!parsed.success) { const issues=(parsed.error as any).issues || (parsed.error as any).errors || []; return logDone(new Response(JSON.stringify({ error: issues.map((e:any)=>e.message).join(', ') || (parsed.error as any).message }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } })); }
        return logDone(await createTemplate(request, userId!, env, headers, parsed.data));
      }

      // Custom nodes — D1 prod
      if (path === '/api/custom-nodes' && request.method === 'GET') {
        return logDone(await listCustomNodes(userId!, env, headers));
      }
      if (path === '/api/custom-nodes' && request.method === 'POST') {
        const body = await request.json().catch(()=> ({} as any));
        // bulk sync: { nodes: [...] } or single { type, displayName, ... }
        if (Array.isArray(body.nodes)) {
          return logDone(await bulkSyncCustomNodes(userId!, env, headers, body.nodes));
        }
        return logDone(await createCustomNode(userId!, env, headers, body));
      }
      if (path.match(/^\/api\/custom-nodes\/[^/]+$/) && request.method === 'PUT') {
        const type = decodeURIComponent(path.split('/').pop()!);
        const body = await request.json().catch(()=> ({} as any));
        return logDone(await updateCustomNode(type, userId!, env, headers, body));
      }
      if (path.match(/^\/api\/custom-nodes\/[^/]+$/) && request.method === 'DELETE') {
        const type = decodeURIComponent(path.split('/').pop()!);
        return logDone(await deleteCustomNode(type, userId!, env, headers));
      }
      if (path === '/api/custom-nodes' && request.method === 'DELETE') {
        // bulk delete via query? not needed
        return logDone(new Response(JSON.stringify({ error: 'Use DELETE /api/custom-nodes/:type' }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } }));
      }

      if (path === '/' || path === '') {
        return logDone(new Response(JSON.stringify({ status: 'ok', message: 'AgentFlow Worker running', timestamp: new Date().toISOString() }), { headers: { ...headers, 'Content-Type': 'application/json' } }));
      }

      return logDone(new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } }));
    } catch (error) {
      console.error('Worker error:', error);
      gMetrics.errors++;
      return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } });
    }
  },
};

// Auth helpers
// SECURITY: salted PBKDF2-SHA256 (100k iters) stored as `saltHex:hashHex`.
// Legacy unsalted SHA-256 hashes still verify (migration path) but new passwords use salt.
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (stored.includes(':')) {
      const [saltHex, hashHex] = stored.split(':');
      const salt = Uint8Array.from(saltHex.match(/../g)!.map(h => parseInt(h, 16)));
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
      const hex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
      return timingSafeEqual(hex, hashHex);
    }
    // legacy unsalted SHA-256
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
    const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    return timingSafeEqual(hex, stored);
  } catch { return false; }
}
function b64urlEncode(data: string | ArrayBuffer): string {
  const bin = typeof data === 'string' ? btoa(data) : btoa(String.fromCharCode(...new Uint8Array(data)));
  return bin.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64);
}
async function verifyToken(token: string, secret: string): Promise<string | null> {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return null;
    const hdr = JSON.parse(b64urlDecode(header));
    if (hdr.alg !== 'HS256') return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(b64urlDecode(signature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(`${header}.${payload}`));
    if (!valid) return null;
    const data = JSON.parse(b64urlDecode(payload));
    if (data.exp < Date.now() / 1000) return null;
    return data.sub;
  } catch { return null; }
}
async function createToken(userId: string, secret: string): Promise<string> {
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64urlEncode(JSON.stringify({ sub: userId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 }));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64urlEncode(signature)}`;
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function createAccessToken(secret: string): Promise<string> {
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64urlEncode(JSON.stringify({ typ: 'access', exp: Math.floor(Date.now() / 1000) + 86400 * 7, iat: Math.floor(Date.now() / 1000) }));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64urlEncode(signature)}`;
}
async function verifyAccessToken(token: string, secret: string): Promise<boolean> {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return false;
    const hdr = JSON.parse(b64urlDecode(header));
    if (hdr.alg !== 'HS256') return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(b64urlDecode(signature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(`${header}.${payload}`));
    if (!valid) return false;
    const data = JSON.parse(b64urlDecode(payload));
    if (data.typ !== 'access') return false;
    if (data.exp < Date.now() / 1000) return false;
    return true;
  } catch { return false; }
}
// SECURITY: SSRF guard shared by api_call/webhook/graphql/probe.
function assertSafeUrl(raw: string): string {
  let u: URL;
  try { u = new URL(String(raw)); } catch { throw new Error('invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('URL must be http(s)');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '[::]' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === '169.254.169.254' || host === 'metadata.google.internal') {
    throw new Error('URL host not allowed');
  }
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const o = m.slice(1).map(Number);
    if (o[0] === 10 || o[0] === 127 || (o[0] === 169 && o[1] === 254) || (o[0] === 192 && o[1] === 168) || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || o[0] === 0) {
      throw new Error('URL resolves to private address range');
    }
  }
  return u.toString();
}
async function handleVerifyAccess(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const body = (await request.json().catch(() => ({} as any))) as any;
  const code = String(body.code ?? body.accessCode ?? '').trim();
  // SECURITY: access code never hardcoded — compare SHA-256 hex from env.
  const expectedHash = String(env.ACCESS_CODE_HASH || '').toLowerCase();
  let ok = false;
  if (code.length > 0 && expectedHash) {
    try {
      const encoder = new TextEncoder();
      const hash = await crypto.subtle.digest('SHA-256', encoder.encode(code));
      const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (timingSafeEqual(hex, expectedHash)) ok = true;
    } catch {}
  }
  if (!ok) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid access code' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  const accessToken = await createAccessToken(env.JWT_SECRET);
  return new Response(JSON.stringify({ success: true, accessToken, message: 'Access granted' }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function handleCheckAccess(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const token = request.headers.get('X-Access-Token') || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) {
    return new Response(JSON.stringify({ hasAccess: false }), { headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  const valid = await verifyAccessToken(token, env.JWT_SECRET);
  return new Response(JSON.stringify({ hasAccess: valid }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function handleRegister(request: Request, env: Env, headers: Record<string, string>, data: any): Promise<Response> {
  const { email, password, name, username } = data;
  const displayName = name || username || email.split('@')[0];
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  try {
    await env.DB.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)').bind(id, email, displayName, passwordHash).run();
    const token = await createToken(id, env.JWT_SECRET);
    return new Response(JSON.stringify({ user: { id, email, name: displayName }, token }), { headers: { ...headers, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Email already exists' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
}
async function handleLogin(request: Request, env: Env, headers: Record<string, string>, data: any): Promise<Response> {
  const { email, password } = data;
  const row = await env.DB.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').bind(email).first<User & { password_hash: string }>();
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  const user = { id: row.id, email: row.email, name: row.name };
  const token = await createToken(user.id, env.JWT_SECRET);
  return new Response(JSON.stringify({ user, token }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function handleMe(userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?').bind(userId).first<User>();
  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ user }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
// P1: clean queries — only select needed columns, pagination
async function getWorkflows(userId: string, env: Env, headers: Record<string, string>, url: URL): Promise<Response> {
  const page = Math.max(1, parseInt(url.searchParams.get('page')||'1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit')||'20')));
  const offset = (page-1)*limit;
  // P1: avoid SELECT * — only id,name,updated_at for list (nodes/edges fetched on detail)
  const workflows = await env.DB.prepare('SELECT id, name, description, updated_at, created_at FROM workflows WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?').bind(userId, limit, offset).all<Workflow>();
  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM workflows WHERE user_id = ?').bind(userId).first<{count:number}>();
  return new Response(JSON.stringify({ workflows: workflows.results, total: total?.count||0, page, limit }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function createWorkflow(request: Request, userId: string, env: Env, headers: Record<string, string>, data: any): Promise<Response> {
  const { name, description, nodes, edges } = data;
  if ((nodes||[]).length > 100) return new Response(JSON.stringify({ error: 'quota exceeded: max 100 nodes per workflow' }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } });
  const cnt = await env.DB.prepare('SELECT COUNT(*) as c FROM workflows WHERE user_id = ?').bind(userId).first<{c:number}>();
  if ((cnt?.c||0) >= 50) return new Response(JSON.stringify({ error: 'quota exceeded: max 50 workflows per user' }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } });
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO workflows (id, user_id, name, description, nodes, edges) VALUES (?, ?, ?, ?, ?, ?)').bind(id, userId, name, description || '', JSON.stringify(nodes || []), JSON.stringify(edges || [])).run();
  return new Response(JSON.stringify({ id, name, message: 'Workflow created' }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function getWorkflow(id: string, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const workflow = await env.DB.prepare('SELECT * FROM workflows WHERE id = ? AND user_id = ?').bind(id, userId).first<Workflow>();
  if (!workflow) {
    return new Response(JSON.stringify({ error: 'Workflow not found' }), { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ...workflow, nodes: JSON.parse(workflow.nodes as any), edges: JSON.parse(workflow.edges as any) }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function updateWorkflow(request: Request, id: string, userId: string, env: Env, headers: Record<string, string>, data: any): Promise<Response> {
  const { name, description, nodes, edges } = data;
  if ((nodes||[]).length > 100) return new Response(JSON.stringify({ error: 'quota exceeded: max 100 nodes per workflow' }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } });
  await env.DB.prepare('UPDATE workflows SET name = ?, description = ?, nodes = ?, edges = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(name, description || '', JSON.stringify(nodes || []), JSON.stringify(edges || []), id, userId).run();
  try { await env.DB.prepare('INSERT INTO workflow_versions (id, workflow_id, user_id, nodes, edges) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, userId, JSON.stringify(nodes||[]), JSON.stringify(edges||[])).run(); } catch {}
  // prune old versions keep 20
  try { const rows = await env.DB.prepare('SELECT id FROM workflow_versions WHERE workflow_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET 20').bind(id, userId).all(); if (rows.results && rows.results.length) { const ids = (rows.results as any[]).map(r=>r.id); for (const delId of ids) await env.DB.prepare('DELETE FROM workflow_versions WHERE id = ?').bind(delId).run(); } } catch {}
  return new Response(JSON.stringify({ message: 'Workflow updated' }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function deleteWorkflow(id: string, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  await env.DB.prepare('DELETE FROM workflows WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return new Response(JSON.stringify({ message: 'Workflow deleted' }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function executeWorkflow(request: Request, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const { workflowId, input } = await request.json() as any;
  if (!workflowId) return new Response(JSON.stringify({ error: 'workflowId required' }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } });
  const workflow = await env.DB.prepare('SELECT nodes, edges FROM workflows WHERE id = ? AND user_id = ?').bind(workflowId, userId).first<{nodes:string, edges:string}>();
  if (!workflow) return new Response(JSON.stringify({ error: 'Workflow not found' }), { status: 404, headers: { ...headers, 'Content-Type':'application/json' } });
  const nodes = JSON.parse(workflow.nodes as any) as any[];
  const edges = JSON.parse(workflow.edges as any) as any[];
  // Load custom nodes for user
  const customRes = await env.DB.prepare('SELECT type, code, fields FROM custom_nodes WHERE user_id = ?').bind(userId).all();
  const customMap = new Map<string, any>();
  for (const r of (customRes.results || [])) {
    try { customMap.set(r.type, { type: r.type, code: r.code, fields: JSON.parse(r.fields||'[]') }); } catch {}
  }
  const t0 = Date.now();
  // --- helpers (mirrors backend/index.js engine) ---
  const sleep = (ms:number)=> new Promise(r=>setTimeout(r, Math.max(0, ms)));
  const getPath = (obj:any, p:string)=> p.split('.').filter(Boolean).reduce((o,k)=> o==null?undefined:o[k], obj);
  const parseMaybeJson = (t:string)=> { try{ return JSON.parse(t); }catch{ return t; } };
  const AsyncFunction: any = Object.getPrototypeOf(async function(){}).constructor;
  const BLOCKED = [/require\s*\(/, /process\s*[./\[]/, /child_process/, /fs\s*[./\[]/, /eval\s*\(/, /Function\s*\(/, /AsyncFunction/, /constructor\s*\(/, /__proto__/, /prototype\s*\./, /globalThis/, /localStorage|sessionStorage|indexedDB/, /document\s*\./, /window\s*\./, /navigator\s*\./, /import\s*\(/, /fetch\s*\(/, /XMLHttpRequest|WebSocket|EventSource/, /while\s*\(\s*true\s*\)/, /for\s*\(\s*;\s*;\s*\)/];
  const validateCode = (c:string)=> { if(typeof c !== 'string' || c.length>10000) throw new Error('code too large (max 10KB)'); for(const pat of BLOCKED) if(pat.test(c)) throw new Error(`blocked ${pat}`); };
  // NOTE: Worker cannot safely run arbitrary user JS — validate ALL expression
  // paths (transform/condition/filter/validator/switch/code/function/custom).
  // fetch() is blocked in user code; network must use api_call/webhook nodes
  // which enforce assertSafeUrl().
  async function runCustom(data:any, cfg:any, def:any){
    const code = cfg.code || def.code;
    if(!code) throw new Error(`custom ${def.type} missing code`);
    validateCode(code);
    // In Workers, new Function is blocked, so we simulate execution by returning code + data
    // For real execution, the frontend's engine will handle it client-side
    // Here we just return a simulated result that shows the code would run
    return { simulated: true, note: `custom ${def.type} executed in Worker (simulated)`, code: code.slice(0,200), data, config: cfg };
  }
  // topological order
  const adj: Record<string,string[]> = {}; const indeg: Record<string,number> = {};
  nodes.forEach((n:any)=>{ adj[n.id]=[]; indeg[n.id]=0; });
  edges.forEach((e:any)=>{ if(adj[e.source]!==undefined && indeg[e.target]!==undefined){ adj[e.source].push(e.target); indeg[e.target]++; } });
  const q = nodes.filter((n:any)=> indeg[n.id]===0).map((n:any)=>n.id);
  const order: string[] = [];
  while(q.length){ const cur=q.shift()!; order.push(cur); for(const nb of adj[cur]){ indeg[nb]--; if(indeg[nb]===0) q.push(nb); } }
  nodes.forEach((n:any)=>{ if(!order.includes(n.id)) order.push(n.id); });
  const byId = new Map(nodes.map((n:any)=>[n.id,n]));
  const status: Record<string,string> = {}; const outputs: Record<string,any> = {};
  let lastCondition: boolean|null = null; let hadError=false;
  for(const id of order){
    const node = byId.get(id) as any; if(!node) continue;
    const incoming = edges.filter((e:any)=>e.target===id);
    let blocked: string|null=null;
    for(const e of incoming){
      if(hadError && status[e.source]==='fault'){ blocked=`upstream ${e.source} faulted`; break; }
      if(status[e.source]==='skipped'){ blocked=`upstream ${e.source} skipped`; break; }
      const lbl = String(e.label||'').trim().toLowerCase();
      if((lbl==='true'||lbl==='false') && lastCondition!==null){ if((lbl==='true')!==lastCondition){ blocked=`branch ${lastCondition} vs ${lbl}`; break; } }
    }
    if(blocked){ status[id]='skipped'; outputs[id]={skipped:true, reason:blocked}; continue; }
    try{
      let result:any; const upstreamData = incoming.length ? outputs[incoming[incoming.length-1].source] : undefined;
      const data = upstreamData!==undefined ? upstreamData : (node.type==='start'||node.type==='manual_trigger' ? (input||{}) : (input||{}));
      const cfg = node.config||{};
      const t = node.type;
      if(t==='start'||t==='manual_trigger') result = input||{};
      else if(t==='api_call'){
        const url=cfg.url; if(!url) throw new Error('no URL'); assertSafeUrl(url); const method=String(cfg.method||'GET').toUpperCase(); const headers2={...(cfg.headers||{})}; let body:any; if(method!=='GET'&&method!=='HEAD'){ const raw=cfg.body ?? input; if(raw!==undefined&&raw!==null&&raw!==''){ body=typeof raw==='string'?raw:JSON.stringify(raw); if(!headers2['Content-Type']) headers2['Content-Type']='application/json'; } }
        const res=await fetch(url,{method, headers:headers2, body, signal: AbortSignal.timeout(8000)}); const text=await res.text(); const parsed=parseMaybeJson(text); if(!res.ok) throw new Error(`HTTP ${res.status}`); result=parsed;
      } else if(t==='transform'){
        const op=cfg.op||'passthrough';
        if(op==='pick'){ const keys=String(cfg.keys||'').split(',').map((k:string)=>k.trim()).filter(Boolean); const out:any={}; for(const k of keys) out[k]=getPath(data,k); result=out; }
        else if(op==='count') result= Array.isArray(data)?{count:data.length}:{count:Object.keys(data||{}).length};
        else if(op==='first') result= Array.isArray(data)?data[0]:data;
        else if(op==='expression'){ if(!cfg.expression) throw new Error('no expression'); validateCode(String(cfg.expression)); try { const fn=new AsyncFunction('data', `"use strict"; return (${String(cfg.expression).trim()})(data);`); result=await fn(data); } catch(e:any){ if(String(e.message).includes('Code generation')) result={ simulated:true, expression: cfg.expression, data }; else throw e; } }
        else result=data;
      } else if(t==='condition'){ let passed:boolean; if(cfg.expression){ validateCode(String(cfg.expression)); try { const fn=new AsyncFunction('data', `"use strict"; return Boolean(await (${cfg.expression})(data));`); passed=await fn(data); } catch(e:any){ if(String(e.message).includes('Code generation')) passed=true; else throw e; } } else { passed = cfg.path ? getPath(data,cfg.path)=== (cfg.equals===undefined?true:cfg.equals) : true; } lastCondition=passed; result={passed, checked: node.label}; }
      else if(t==='delay'){ await sleep(Number(cfg.ms||1000)); result={waitedMs:Number(cfg.ms||1000)}; }
      else if(t==='output'){ result={delivered:'console', data}; }
      else if(t==='filter'){ if(!cfg.expression) throw new Error('filter requires expression'); validateCode(String(cfg.expression)); let pass:boolean; try { const fn=new AsyncFunction('data', `"use strict"; return Boolean(await (${cfg.expression})(data));`); pass=await fn(data); } catch(e:any){ if(String(e.message).includes('Code generation')) pass=true; else throw e; } result={passed:pass, data}; }
      else if(t==='split'){ if(Array.isArray(data)){ const bs=Number(cfg.batchSize||1); const batches=[]; for(let i=0;i<data.length;i+=bs) batches.push(data.slice(i,i+bs)); result={batches, count:batches.length}; } else if(typeof data==='object'&&data!==null){ const ks=Object.keys(data); result={items:ks.map(k=>({key:k,value:data[k]})), count:ks.length}; } else result={items:[data],count:1}; }
      else if(t==='merge'){ if(Array.isArray(data)) result=data.reduce((a:any,it:any)=> Array.isArray(it)?a.concat(it): (typeof it==='object'&&it!==null?{...a,...it}:a),{}); else result=data; }
      else if(t==='loop'){ const items=Array.isArray(data)?data:data?.items||data?.batches||[data]; const max=Number(cfg.maxIterations||10); const res=[]; for(let i=0;i<Math.min(items.length,max);i++) res.push({index:i,value:items[i]}); result={iterations:res,total:items.length}; }
      else if(t==='code'){ const code=cfg.code||cfg.expression; if(!code) throw new Error('code requires code'); validateCode(code); try { const fn=new AsyncFunction('data', `"use strict"; ${code}`); result=await fn(data); } catch(e:any){ if(String(e.message).includes('Code generation')) result={ simulated:true, code: code.slice(0,200), data }; else throw e; } }
      else if(t==='webhook'){ const url=cfg.url; if(!url) throw new Error('webhook requires URL'); assertSafeUrl(url); const method=String(cfg.method||'POST').toUpperCase(); const h={'Content-Type':'application/json',...(cfg.headers||{})}; const res=await fetch(url,{method, headers:h, body:JSON.stringify(data), signal: AbortSignal.timeout(8000)}); const txt=await res.text(); const parsed=parseMaybeJson(txt); if(!res.ok) throw new Error(`webhook ${res.status}`); result={status:res.status, data:parsed}; }
      else if(t==='ai'){ const prompt=cfg.prompt||'Summarize'; const apiKey=cfg.apiKey; if(!apiKey) result={prompt, response:`[AI simulated] ${prompt}`}; else { const res=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`}, body: JSON.stringify({model:cfg.model||'gpt-3.5-turbo', messages:[{role:'user', content:`${prompt}\n\n${JSON.stringify(data,null,2)}`}]}), signal: AbortSignal.timeout(10000)}); if(!res.ok) throw new Error(`AI ${res.status}`); const j:any=await res.json(); result={response:j.choices?.[0]?.message?.content||''}; } }
      else if(t==='validator'){ const r=cfg.rules||cfg.expression; if(r){ validateCode(String(r)); let v:boolean; try { const fn=new AsyncFunction('data', `"use strict"; return await (${r})(data);`); v=Boolean(await fn(data)); } catch(e:any){ if(String(e.message).includes('Code generation')) v=true; else throw e; } result={valid:v, data}; } else result={valid:!!data, data}; }
      else if(t==='logger'){ result={level:cfg.level||'info', message:cfg.message||'', data, timestamp:new Date().toISOString()}; }
      else if(t==='file'){ result={operation:cfg.operation||'read', path:cfg.path||'output.json'}; }
      else if(t==='schedule'){ const intervalMs=cfg.intervalMs||cfg.ms||0; if(intervalMs) await sleep(Number(intervalMs)); result={scheduled:true, cron:cfg.cron||'*/5 * * * *'}; }
      else if(t==='graphql'){ const url=cfg.url||cfg.endpoint; if(!url) throw new Error('GraphQL requires url'); assertSafeUrl(url); const res=await fetch(url,{method:'POST', headers:{'Content-Type':'application/json',...(cfg.headers||{})}, body: JSON.stringify({query:cfg.query||'{ __typename }', variables: typeof cfg.variables==='string'?JSON.parse(cfg.variables):cfg.variables||{}}), signal: AbortSignal.timeout(8000)}); const txt=await res.text(); const parsed=parseMaybeJson(txt); if(!res.ok) throw new Error(`GraphQL ${res.status}`); result=parsed; }
      else if(t==='set'){ const keepOnly=cfg.keepOnlySet||cfg.keepOnly||false; const fields=cfg.fields||cfg.set||cfg.values||{}; let parsedFields:any={}; if(typeof fields==='string') try{parsedFields=JSON.parse(fields);}catch{parsedFields={}} else if(typeof fields==='object') parsedFields=fields; if(Object.keys(parsedFields).length===0){ const reserved=new Set(['keepOnlySet','keepOnly','fields','set','values']); for(const [k,v] of Object.entries(cfg)) if(!reserved.has(k)) parsedFields[k]=v; } const base= keepOnly?{}: (typeof data==='object'&&data!==null?{...data}:{}); for(const [k,v] of Object.entries(parsedFields)){ if(typeof v==='string'&& (v as string).includes('{{')) (base as any)[k]=(v as string).replace(/\{\{\s*\$json\.([\w.]+)\s*\}\}/g, (_m,p)=>String(getPath(data,p)??'')); else (base as any)[k]=v; } result=base; }
      else if(t==='switch'){ const rules=cfg.rules||cfg.cases||[]; const expr=cfg.expression||cfg.code; let matched='default'; if(expr){ validateCode(String(expr)); try { const fn=new AsyncFunction('data', `"use strict"; return await (${expr})(data);`); matched=String(await fn(data)); } catch(e:any){ if(String(e.message).includes('Code generation')) matched='default'; else throw e; } } else if(Array.isArray(rules)&&rules.length){ for(const rule of rules){ const ex=rule.expression||rule.condition; if(ex){ validateCode(String(ex)); try { const fn=new AsyncFunction('data', `"use strict"; return Boolean(await (${ex})(data));`); if(await fn(data)){ matched=rule.value||rule.case||'true'; break; } } catch(e:any){ if(String(e.message).includes('Code generation')) { matched=rule.value||'true'; break; } else throw e; } } } } else if(cfg.value!==undefined) matched=String(cfg.value); result={case:matched, data, matchedCase:matched}; }
      else if(t==='aggregate'){ const field=cfg.field||cfg.groupBy||''; const op=cfg.operation||cfg.aggregate||'count'; const items=Array.isArray(data)?data:data?.items||data?.data||[data]; if(op==='count') result={count:items.length, field, operation:op}; else if(op==='sum'&&field){ const sum=items.reduce((s:number,it:any)=> s+Number(getPath(it,field)??it[field]??0),0); result={sum, field, count:items.length}; } else if(op==='avg'&&field){ const sum=items.reduce((s:number,it:any)=> s+Number(getPath(it,field)??0),0); result={avg: items.length? sum/items.length:0, field, count:items.length}; } else if(field){ const groups:Record<string,any[]>={}; for(const it of items){ const key=String(getPath(it,field)??it[field]??'null'); if(!groups[key]) groups[key]=[]; groups[key].push(it); } result={groups, count:items.length, field}; } else result={count:items.length, items}; }
      else if(t==='sort'){ const field=cfg.field||cfg.sortBy||''; const order=String(cfg.order||cfg.direction||'asc').toLowerCase(); const items=Array.isArray(data)?[...data]:data?.items?[...data.items]:[data]; if(!field) items.sort(); else items.sort((a:any,b:any)=>{ const av=getPath(a,field)??a[field]; const bv=getPath(b,field)??b[field]; if(av===bv) return 0; const cmp= av>bv?1:-1; return order==='desc'?-cmp:cmp; }); result={sorted:items, count:items.length, field, order}; }
      else if(t==='limit'){ const max=Number(cfg.max||cfg.limit||10); const offset=Number(cfg.offset||0); const items=Array.isArray(data)?data:data?.items||data?.data||[data]; const sliced=items.slice(offset, offset+max); result={limited:sliced, count:sliced.length, total:items.length, offset, max}; }
      else if(t==='item_lists'){ const op=cfg.operation||'union'; const a=Array.isArray(data)?data:data?.a||data?.items||[data]; const b=Array.isArray(cfg.list)?cfg.list:cfg.b? (Array.isArray(cfg.b)?cfg.b:[cfg.b]):[]; if(op==='union') result={result:[...a,...b], count:a.length+b.length}; else if(op==='intersect'){ const setB=new Set(b.map((x:any)=>JSON.stringify(x))); result={result:a.filter((x:any)=>setB.has(JSON.stringify(x))), operation:op}; } else if(op==='difference'){ const setB=new Set(b.map((x:any)=>JSON.stringify(x))); result={result:a.filter((x:any)=>!setB.has(JSON.stringify(x))), operation:op}; } else result={result:a, operation:op}; }
      else if(t==='function'){ const code=cfg.code||cfg.functionCode||cfg.expression||'return data;'; validateCode(code); try { const fn=new AsyncFunction('data','items', `"use strict"; ${code}`); const items=Array.isArray(data)?data:[data]; if(cfg.perItem){ const out=[]; for(const it of items) out.push(await fn(it,items)); result={results:out, count:out.length}; } else result=await fn(data,items); } catch(e:any){ if(String(e.message).includes('Code generation')) result={ simulated:true, code: code.slice(0,200), data }; else throw e; } }
      else if(t==='noop'){ result=data; }
      else if(t==='webhook_response'){ result={status:Number(cfg.status||200), body: cfg.body||data, headers:cfg.headers||{}, simulated:true}; }
      else if(t==='html'){ const op=cfg.operation||'extract'; const html=String(cfg.html||data.html||data||''); const selector=cfg.selector||cfg.css||''; const attr=cfg.attribute||'textContent'; if(op==='extract'&&selector) result={html:html.slice(0,5000), selector, note:'HTML extract requires DOMParser in Worker — returning raw'}; else result={html:html.slice(0,5000), operation:op, selector}; }
      else if(t==='date_time'){ const op=cfg.operation||'now'; const inp=cfg.date||cfg.value||data; const fmt=cfg.format||'iso'; const parse=(v:any)=>{ if(v instanceof Date) return v; if(typeof v==='number') return new Date(v); if(typeof v==='string'){ const d=new Date(v); if(!isNaN(d.getTime())) return d; } return new Date(); }; if(op==='now') result={now:new Date().toISOString(), timestamp:Date.now()}; else if(op==='format'){ const d=parse(inp); result={formatted: fmt==='iso'?d.toISOString():d.toLocaleString(), input:inp}; } else if(op==='add'){ const d=parse(inp); const amt=Number(cfg.amount||1); const unit=cfg.unit||'days'; const mul:Record<string,number>={ms:1,seconds:1000,minutes:60000,hours:3600000,days:86400000}; result={result:new Date(d.getTime()+amt*(mul[unit]||86400000)).toISOString(), operation:op, amount:amt, unit}; } else result={result:parse(inp).toISOString(), operation:op}; }
      else if(['slack','discord','github','gmail','google_sheets','notion','airtable','postgres','mysql','mongodb','redis','stripe','shopify','aws_s3'].includes(t)){ const url=cfg.url||cfg.webhookUrl||cfg.endpoint; if(url) assertSafeUrl(url); if(!url){ result={app:t, simulated:true, note:`simulated ${t} — configure url`}; } else { const method=String(cfg.method||'POST').toUpperCase(); const h={'Content-Type':'application/json',...(cfg.headers||{})}; const body=cfg.body??cfg.payload??data; const res=await fetch(url,{method, headers:h, body: method==='GET'?undefined:JSON.stringify(body), signal: AbortSignal.timeout(8000)}); const txt=await res.text(); const parsed=parseMaybeJson(txt); if(!res.ok) throw new Error(`${t} HTTP ${res.status}`); result={app:t, status:res.status, data:parsed, simulated:false}; } }
      else if(t==='openai'){ const prompt=cfg.prompt||cfg.message||'Hello'; const model=cfg.model||'gpt-4o-mini'; const apiKey=cfg.apiKey; if(!apiKey) result={app:'openai', model, prompt, response:`[OpenAI simulated] ${prompt}`, note:'No API key'}; else { const res=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`}, body: JSON.stringify({model, messages:[{role:'user', content:`${prompt}\n\n${JSON.stringify(data,null,2)}`}]}), signal: AbortSignal.timeout(10000)}); if(!res.ok) throw new Error(`OpenAI ${res.status}`); const j:any=await res.json(); result={app:'openai', model, response:j.choices?.[0]?.message?.content||'', prompt}; } }
      else if(t.startsWith('custom_')){
        const def = customMap.get(t);
        if(!def) throw new Error(`custom node ${t} not found`);
        result = await runCustom(data, cfg, def);
      } else throw new Error(`unknown type ${t}`);
      status[id]='done'; outputs[id]=result;
    } catch(err:any){ hadError=true; status[id]='fault'; outputs[id]={error:err.message, stack:String(err.stack||'').slice(0,800), nodeType: (byId.get(id) as any).type}; }
  }
  const durationMs = Date.now()-t0;
  const success = !hadError;
  const logId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO execution_logs (id, workflow_id, user_id, input, output, duration_ms, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(logId, workflowId, userId, JSON.stringify(input||{}), JSON.stringify({outputs, status, order}), durationMs, success?'success':'error').run();
  enqueue('post-execution', { workflowId, userId, durationMs });
  return new Response(JSON.stringify({ success, executedAt: new Date().toISOString(), durationMs, order, status, outputs, executionId: logId }), { headers: { ...headers, 'Content-Type':'application/json' } });
}
async function getExecutionLogs(workflowId: string, userId: string, env: Env, headers: Record<string, string>, url: URL): Promise<Response> {
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit')||'20')));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset')||'0'));
  // P1: pagination + only needed columns
  const logs = await env.DB.prepare('SELECT id, workflow_id, status, duration_ms, executed_at FROM execution_logs WHERE workflow_id = ? AND user_id = ? ORDER BY executed_at DESC LIMIT ? OFFSET ?').bind(workflowId, userId, limit, offset).all<ExecutionLog>();
  return new Response(JSON.stringify(logs.results), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function getTemplates(userId: string, env: Env, headers: Record<string, string>, url: URL): Promise<Response> {
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit')||'20')));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset')||'0'));
  const templates = await env.DB.prepare('SELECT id, name, description, created_at FROM templates WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(userId, limit, offset).all();
  return new Response(JSON.stringify(templates.results), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function createTemplate(request: Request, userId: string, env: Env, headers: Record<string, string>, data: any): Promise<Response> {
  const { name, description, nodes, edges } = data;
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO templates (id, user_id, name, description, nodes, edges) VALUES (?, ?, ?, ?, ?, ?)').bind(id, userId, name, description || '', JSON.stringify(nodes), JSON.stringify(edges)).run();
  return new Response(JSON.stringify({ id, name, message: 'Template created' }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function getStats(env: Env, headers: Record<string, string>): Promise<Response> {
  const [users, workflows, executions, recentExecutions, templates, successCount, errorCount, avgDuration, uniqueWorkflowUsers] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM workflows').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM execution_logs').first<{ count: number }>(),
    env.DB.prepare(`SELECT id, workflow_id, status, duration_ms, executed_at FROM execution_logs ORDER BY executed_at DESC LIMIT 20`).all<ExecutionLog>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM templates').first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) as count FROM execution_logs WHERE status = 'success'").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) as count FROM execution_logs WHERE status = 'error'").first<{ count: number }>(),
    env.DB.prepare('SELECT AVG(duration_ms) as avg_ms FROM execution_logs').first<{ avg_ms: number }>(),
    env.DB.prepare('SELECT COUNT(DISTINCT user_id) as count FROM workflows').first<{ count: number }>(),
  ]);
  const execCount = executions?.count ?? 0;
  return new Response(JSON.stringify({
    users: users?.count ?? 0, workflows: workflows?.count ?? 0, executions: execCount, templates: templates?.count ?? 0, uniqueWorkflowUsers: uniqueWorkflowUsers?.count ?? 0,
    successRate: execCount ? Math.round(((successCount?.count ?? 0) / execCount) * 100) : 0,
    successCount: successCount?.count ?? 0, errorCount: errorCount?.count ?? 0, avgDurationMs: Math.round(avgDuration?.avg_ms ?? 0),
    recentExecutions: recentExecutions?.results ?? [], timestamp: new Date().toISOString(),
    cacheKeys: cacheStore.size, queue: { pending: bgQueue.length, ...qMetrics },
  }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function listCustomNodes(userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const res = await env.DB.prepare('SELECT type, display_name, description, color, icon, fields, code, created_at, updated_at FROM custom_nodes WHERE user_id = ? ORDER BY updated_at DESC').bind(userId).all();
  const nodes = (res.results || []).map((r: any) => ({
    type: r.type, displayName: r.display_name, description: r.description, color: r.color, icon: r.icon,
    fields: JSON.parse(r.fields || '[]'), code: r.code, createdAt: r.created_at, updatedAt: r.updated_at
  }));
  return new Response(JSON.stringify({ nodes, count: nodes.length }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function createCustomNode(userId: string, env: Env, headers: Record<string, string>, body: any): Promise<Response> {
  const { type, displayName, description, color, icon, fields, code } = body;
  if (!code) return new Response(JSON.stringify({ error: 'code required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  let t = String(type || displayName || 'custom_node').toLowerCase().replace(/[^a-z0-9_]/g,'_').replace(/__+/g,'_').replace(/^_+|_+$/g,'');
  if (!t.startsWith('custom_')) t = `custom_${t}`;
  if (t.length>32) t=t.slice(0,32);
  const builtIn = new Set(['start','manual_trigger','api_call','transform','condition','output','delay','filter','split','merge','loop','code','webhook','ai','validator','logger','file','schedule','graphql','set','switch','aggregate','sort','limit','item_lists','function','noop','webhook_response','html','date_time','slack','discord','github','gmail','google_sheets','notion','airtable','postgres','mysql','mongodb','redis','stripe','shopify','aws_s3','openai']);
  if (builtIn.has(t) || builtIn.has(t.replace('custom_',''))) return new Response(JSON.stringify({ error: `type ${t} conflicts with built-in` }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  const cnt = await env.DB.prepare('SELECT COUNT(*) as c FROM custom_nodes WHERE user_id = ?').bind(userId).first<{c:number}>();
  if ((cnt?.c||0) >= 20) return new Response(JSON.stringify({ error: 'quota exceeded: max 20 custom nodes per user' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  const BLOCKED_PATTERNS = [/require\s*\(/, /process\./, /child_process/, /fs\./, /eval\s*\(/, /Function\s*\(/, /while\s*\(\s*true\s*\)/, /for\s*\(\s*;\s*;\s*\)/];
  for (const pat of BLOCKED_PATTERNS) if (pat.test(code)) return new Response(JSON.stringify({ error: `blocked pattern: ${pat}` }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  if (code.length > 10000) return new Response(JSON.stringify({ error: 'code too large' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  const exists = await env.DB.prepare('SELECT type FROM custom_nodes WHERE user_id = ? AND type = ?').bind(userId, t).first();
  if (exists) return new Response(JSON.stringify({ error: `custom node ${t} already exists, use PUT` }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } });
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO custom_nodes (type, user_id, display_name, description, color, icon, fields, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(t, userId, String(displayName||t.replace('custom_','')).slice(0,40), String(description||'Custom node').slice(0,120), color||'#a8d8a8', icon||'CodeIcon', JSON.stringify(Array.isArray(fields)?fields.slice(0,12):[]), code, now, now).run();
  return new Response(JSON.stringify({ type: t, displayName, message: `Created custom node ${t}` }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function bulkSyncCustomNodes(userId: string, env: Env, headers: Record<string, string>, nodes: any[]): Promise<Response> {
  if (!Array.isArray(nodes)) return new Response(JSON.stringify({ error: 'nodes must be array' }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } });
  // replace all for user with provided list (upsert)
  for (const n of nodes.slice(0,50)) {
    const t = String(n.type||'').toLowerCase();
    if (!t.startsWith('custom_')) continue;
    const BLOCKED2 = [/require\s*\(/, /process\./, /child_process/, /fs\./, /eval\s*\(/, /Function\s*\(/, /while\s*\(\s*true\s*\)/, /for\s*\(\s*;\s*;\s*\)/];
    let blocked=false; for(const pat of BLOCKED2) if(pat.test(n.code||'')) { blocked=true; break; } if(blocked) continue;
    await env.DB.prepare('INSERT OR REPLACE INTO custom_nodes (type, user_id, display_name, description, color, icon, fields, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(t, userId, String(n.displayName||t).slice(0,40), String(n.description||'').slice(0,120), n.color||'#a8d8a8', n.icon||'CodeIcon', JSON.stringify(n.fields||[]), n.code, n.createdAt||new Date().toISOString(), new Date().toISOString()).run();
  }
  return new Response(JSON.stringify({ success: true, count: nodes.length }), { headers: { ...headers, 'Content-Type':'application/json' } });
}
async function updateCustomNode(type: string, userId: string, env: Env, headers: Record<string, string>, body: any): Promise<Response> {
  const existing = await env.DB.prepare('SELECT * FROM custom_nodes WHERE user_id = ? AND type = ?').bind(userId, type).first();
  if (!existing) return new Response(JSON.stringify({ error: `not found ${type}` }), { status: 404, headers: { ...headers, 'Content-Type':'application/json' } });
  const { code, displayName, description, color, icon, fields } = body;
  if (code) {
    const BLOCKED3 = [/require\s*\(/, /process\./, /child_process/, /fs\./, /eval\s*\(/, /Function\s*\(/, /while\s*\(\s*true\s*\)/, /for\s*\(\s*;\s*;\s*\)/];
    for (const pat of BLOCKED3) if(pat.test(code)) return new Response(JSON.stringify({ error: `blocked pattern: ${pat}` }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } });
    if (code.length > 10000) return new Response(JSON.stringify({ error: 'code too large' }), { status: 400, headers: { ...headers, 'Content-Type':'application/json' } });
  }
  await env.DB.prepare('UPDATE custom_nodes SET display_name = COALESCE(?, display_name), description = COALESCE(?, description), color = COALESCE(?, color), icon = COALESCE(?, icon), fields = COALESCE(?, fields), code = COALESCE(?, code), updated_at = ? WHERE user_id = ? AND type = ?')
    .bind(displayName||null, description||null, color||null, icon||null, fields?JSON.stringify(fields):null, code||null, new Date().toISOString(), userId, type).run();
  return new Response(JSON.stringify({ success: true, type }), { headers: { ...headers, 'Content-Type':'application/json' } });
}
async function deleteCustomNode(type: string, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  await env.DB.prepare('DELETE FROM custom_nodes WHERE user_id = ? AND type = ?').bind(userId, type).run();
  return new Response(JSON.stringify({ success: true, deleted: type }), { headers: { ...headers, 'Content-Type':'application/json' } });
}
async function listWorkflowVersions(workflowId: string, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const res = await env.DB.prepare('SELECT id, workflow_id, created_at FROM workflow_versions WHERE workflow_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 20').bind(workflowId, userId).all();
  return new Response(JSON.stringify({ versions: res.results || [] }), { headers: { ...headers, 'Content-Type':'application/json' } });
}
async function getWorkflowVersion(workflowId: string, versionId: string, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const row = await env.DB.prepare('SELECT * FROM workflow_versions WHERE id = ? AND workflow_id = ? AND user_id = ?').bind(versionId, workflowId, userId).first();
  if (!row) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { ...headers, 'Content-Type':'application/json' } });
  return new Response(JSON.stringify({ version: { ...row, nodes: JSON.parse((row as any).nodes), edges: JSON.parse((row as any).edges) } }), { headers: { ...headers, 'Content-Type':'application/json' } });
}
