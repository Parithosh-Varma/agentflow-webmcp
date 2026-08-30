// Cloudflare Workers — AgentFlow prod with P0/P1/P2 optimizations
import { z } from "zod";

const ALLOWED_IPS = ['122.171.20.180', '2401:4900:894c:d56d:6db7:9211:c0ae:ec56'];
const ACCESS_CODE = '7c29f34ff320ed1dd8be77c9b0fa2c9e671062f7c613b0178b3e94ce0a132316';

interface Env {
  DB: D1Database;
  AUTH: Fetcher;
  JWT_SECRET: string;
  ENVIRONMENT: string;
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
        try { await fetch(job.payload.url, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(job.payload.data), signal: AbortSignal.timeout(5000) }); } catch {}
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

    // CORS headers with compression hint
    const headers: Record<string,string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Access-Token',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
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
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function verifyToken(token: string, secret: string): Promise<string | null> {
  try {
    const [header, payload, signature] = token.split('.');
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(signature), c => c.charCodeAt(0)), encoder.encode(`${header}.${payload}`));
    if (!valid) return null;
    const data = JSON.parse(atob(payload));
    if (data.exp < Date.now() / 1000) return null;
    return data.sub;
  } catch { return null; }
}
async function createToken(userId: string, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 86400 }));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function createAccessToken(secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ typ: 'access', exp: Math.floor(Date.now() / 1000) + 86400 * 7, iat: Math.floor(Date.now() / 1000) }));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}
async function verifyAccessToken(token: string, secret: string): Promise<boolean> {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return false;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, Uint8Array.from(atob(signature), c => c.charCodeAt(0)), encoder.encode(`${header}.${payload}`));
    if (!valid) return false;
    const data = JSON.parse(atob(payload));
    if (data.typ !== 'access') return false;
    if (data.exp < Date.now() / 1000) return false;
    return true;
  } catch { return false; }
}
async function handleVerifyAccess(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  const body = (await request.json().catch(() => ({} as any))) as any;
  const code = String(body.code ?? body.accessCode ?? '').trim();
  let ok = timingSafeEqual(code, ACCESS_CODE);
  if (!ok && code.length > 0) {
    try {
      const encoder = new TextEncoder();
      const hash = await crypto.subtle.digest('SHA-256', encoder.encode(code));
      const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (timingSafeEqual(hex, ACCESS_CODE)) ok = true;
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
  const passwordHash = await hashPassword(password);
  const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE email = ? AND password_hash = ?').bind(email, passwordHash).first<User>();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
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
  await env.DB.prepare('UPDATE workflows SET name = ?, description = ?, nodes = ?, edges = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(name, description || '', JSON.stringify(nodes || []), JSON.stringify(edges || []), id, userId).run();
  return new Response(JSON.stringify({ message: 'Workflow updated' }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function deleteWorkflow(id: string, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  await env.DB.prepare('DELETE FROM workflows WHERE id = ? AND user_id = ?').bind(id, userId).run();
  return new Response(JSON.stringify({ message: 'Workflow deleted' }), { headers: { ...headers, 'Content-Type': 'application/json' } });
}
async function executeWorkflow(request: Request, userId: string, env: Env, headers: Record<string, string>): Promise<Response> {
  const { workflowId, input } = await request.json() as any;
  // P1: only fetch nodes/edges needed
  const workflow = await env.DB.prepare('SELECT nodes, edges FROM workflows WHERE id = ? AND user_id = ?').bind(workflowId, userId).first<{nodes:string, edges:string}>();
  if (!workflow) {
    return new Response(JSON.stringify({ error: 'Workflow not found' }), { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } });
  }
  const startTime = Date.now();
  const nodes = JSON.parse(workflow.nodes as any);
  const edges = JSON.parse(workflow.edges as any);
  const result = { success: true, output: { message: 'Workflow executed', nodes: nodes.length } };
  const durationMs = Date.now() - startTime;
  const logId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO execution_logs (id, workflow_id, user_id, input, output, duration_ms, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(logId, workflowId, userId, JSON.stringify(input), JSON.stringify(result), durationMs, 'success').run();
  // P2: offload heavy post-processing to queue
  enqueue('post-execution', { workflowId, userId, durationMs });
  return new Response(JSON.stringify({ ...result, executionId: logId, durationMs }), { headers: { ...headers, 'Content-Type': 'application/json' } });
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
