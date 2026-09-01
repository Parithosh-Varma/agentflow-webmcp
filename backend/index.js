require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');
const NodeCache = require('node-cache');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('./auth');
const { runSandboxed, validateCode } = require('./sandbox');
const { isEnabled: isSupabaseEnabled, dbLoadWorkflows, dbPersistWorkflows, dbLoadCustomNodes, dbPersistCustomNodes } = require('./supabase');

// ================================================================
// AgentFlow Backend — P0/P1/P2 optimized
// P0: validation (zod), rate limiting, compression, real engine
// P1: clean queries, indexes, file persistence
// P2: cache (NodeCache), background queue, monitoring/metrics
// ================================================================

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();

// ---- Security & Performance Middleware ----
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Access-Token'],
}));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(compression({ level: 6, threshold: 512 }));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

// ---- Rate Limiting ----
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Rate limit exceeded for tool execution.' },
});
app.use('/api/', globalLimiter);
app.use('/api/execute-tool', strictLimiter);
app.use('/api', authMiddleware);

// Serve static frontend in production
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// ---- In-Memory Stores + Indexes (P1: connection pooling = reuse Maps) ----
const workflows = new Map();
const executionLogs = new Map();
const templates = new Map();

// Indexes for O(1) lookups instead of scanning
const nodeIndex = new Map(); // nodeId -> workflowId
const edgeIndex = new Map(); // edgeId -> workflowId

// Mutation history for undo/redo (P0)
const mutationHistory = [];
const redoStack = [];
const MAX_HISTORY = 50;

// ---- Caching (P2: hot data) ----
const cache = new NodeCache({ stdTTL: 30, checkperiod: 60, useClones: false });
const CACHE_KEYS = {
  workflowStatus: (id) => `ws:${id}`,
  availableTools: 'tools:all',
  executionDetails: (id) => `exec:${id}`,
};

// ---- Background Queue (P2: offload heavy tasks) ----
const backgroundQueue = [];
let queueProcessing = false;
const queueMetrics = { enqueued: 0, processed: 0, failed: 0 };

function enqueueJob(type, payload) {
  const job = { id: uuidv4().slice(0, 8), type, payload, createdAt: new Date().toISOString(), attempts: 0 };
  backgroundQueue.push(job);
  queueMetrics.enqueued++;
  logger.info({ jobId: job.id, type }, 'job enqueued');
  processQueue();
  return job;
}

async function processQueue() {
  if (queueProcessing || backgroundQueue.length === 0) return;
  queueProcessing = true;
  while (backgroundQueue.length > 0) {
    const job = backgroundQueue.shift();
    job.attempts++;
    try {
      // Simulate heavy work: email, file processing, webhook delivery
      if (job.type === 'email') await new Promise(r => setTimeout(r, 100));
      if (job.type === 'file') await new Promise(r => setTimeout(r, 150));
      if (job.type === 'webhook') {
        // probe delivery without blocking main request
        try { await fetch(job.payload.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job.payload.data), signal: AbortSignal.timeout(5000) }); } catch {}
      }
      queueMetrics.processed++;
      logger.info({ jobId: job.id, type: job.type }, 'job processed');
    } catch (err) {
      queueMetrics.failed++;
      logger.error({ jobId: job.id, err: err.message }, 'job failed');
      if (job.attempts < 3) backgroundQueue.push(job);
    }
  }
  queueProcessing = false;
}

// ---- Metrics (P2: monitoring) ----
const metrics = {
  requests: 0,
  toolCalls: {},
  errors: 0,
  startTime: Date.now(),
  durations: [],
};
app.use((req, res, next) => {
  metrics.requests++;
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    metrics.durations.push(dur);
    if (metrics.durations.length > 1000) metrics.durations.shift();
    if (res.statusCode >= 400) metrics.errors++;
  });
  next();
});

// ---- All valid node types (mirrors frontend/src/components/nodes/index.tsx) ----
const ALL_NODE_TYPES = ['start','manual_trigger','api_call','transform','condition','output','delay','filter','split','merge','loop','code','webhook','ai','validator','logger','file','schedule','graphql','set','switch','aggregate','sort','limit','item_lists','function','noop','webhook_response','html','date_time','slack','discord','github','gmail','google_sheets','notion','airtable','postgres','mysql','mongodb','redis','stripe','shopify','aws_s3','openai'];

function isCustomType(t) { return typeof t === 'string' && t.startsWith('custom_'); }
// ---- Validation Schemas (P0: zod) ----
const addNodeSchema = z.object({
  type: z.string().min(1).max(40).refine(v => ALL_NODE_TYPES.includes(v) || isCustomType(v), { message: "Invalid node type. Must be built-in or custom_..." }),
  label: z.string().min(1).max(100),
  config: z.record(z.any()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});
const connectNodesSchema = z.object({
  sourceNodeId: z.string().min(1).optional(),
  targetNodeId: z.string().min(1).optional(),
  source: z.string().optional(),
  target: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  label: z.string().optional(),
});
const updateNodeConfigSchema = z.object({
  nodeId: z.string().optional(),
  label: z.string().optional(),
  config: z.record(z.any()),
});
const nodeIdSchema = z.object({ nodeId: z.string().min(1) }).or(z.object({ label: z.string().min(1) }));
const probeApiSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET','POST','PUT','PATCH','DELETE']).optional().default('GET'),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  timeoutMs: z.number().min(1000).max(15000).optional().default(8000),
});

// ---- Expanded Tool Definitions (27 tools) ----
const TOOL_DEFINITIONS = [
  { name: 'add_node', description: 'Add a new node to the workflow canvas', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ALL_NODE_TYPES }, label: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['type','label'] } },
  { name: 'connect_nodes', description: 'Connect two nodes with a directed edge', inputSchema: { type: 'object', properties: { sourceNodeId: { type: 'string' }, targetNodeId: { type: 'string' }, label: { type: 'string' } }, required: ['sourceNodeId','targetNodeId'] } },
  { name: 'execute_workflow', description: 'Execute the current workflow in topological order', inputSchema: { type: 'object', properties: { input: { type: 'object' } } } },
  { name: 'get_available_tools', description: 'List all available tool definitions', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_node_details', description: 'Get detailed information about a specific node', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] } },
  { name: 'update_node_config', description: 'Update the configuration of an existing node', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, config: { type: 'object' } }, required: ['nodeId','config'] } },
  { name: 'get_workflow_status', description: 'Get the current state of the workflow', inputSchema: { type: 'object', properties: {} } },
  { name: 'validate_workflow', description: 'Validate the workflow for errors', inputSchema: { type: 'object', properties: {} } },
  { name: 'delete_node', description: 'Remove a node from the canvas', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } } } },
  { name: 'clone_node', description: 'Duplicate an existing node', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, offsetX: { type: 'number' }, offsetY: { type: 'number' } }, required: ['nodeId'] } },
  { name: 'get_node_connections', description: 'Get all incoming and outgoing connections for a node', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' } }, required: ['nodeId'] } },
  { name: 'save_workflow', description: 'Save the current workflow to storage', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'load_workflow', description: 'Load a saved workflow from storage', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'run_node', description: 'Execute a single node in isolation for debugging', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, input: { type: 'object' } }, required: ['nodeId'] } },
  { name: 'set_node_position', description: 'Programmatically move a node', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['nodeId','x','y'] } },
  { name: 'get_workflow_history', description: 'Get the execution history: past runs', inputSchema: { type: 'object', properties: {} } },
  { name: 'create_template', description: 'Save the current workflow as a reusable template', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } },
  { name: 'export_workflow', description: 'Export the current workflow as JSON', inputSchema: { type: 'object', properties: { pretty: { type: 'boolean' } } } },
  { name: 'import_workflow', description: 'Import a workflow from JSON', inputSchema: { type: 'object', properties: { json: { type: 'string' }, merge: { type: 'boolean' } }, required: ['json'] } },
  { name: 'find_nodes', description: 'Search nodes by label/type substring', inputSchema: { type: 'object', properties: { query: { type: 'string' }, type: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'get_execution_details', description: 'Return full per-node outputs from last run', inputSchema: { type: 'object', properties: { includeOutputs: { type: 'boolean' }, truncateAt: { type: 'number' } } } },
  { name: 'get_node_output', description: 'Get one node output from last execution', inputSchema: { type: 'object', properties: { nodeId: { type: 'string' }, label: { type: 'string' } } } },
  { name: 'get_canvas_snapshot', description: 'Textual description of canvas layout', inputSchema: { type: 'object', properties: { includeConfig: { type: 'boolean' } } } },
  { name: 'probe_api', description: 'Fetch any URL and return status + preview', inputSchema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string' }, headers: { type: 'object' }, body: { type: 'string' }, timeoutMs: { type: 'number' } }, required: ['url'] } },
  { name: 'undo_last_action', description: 'Undo the last canvas mutation', inputSchema: { type: 'object', properties: {} } },
  { name: 'redo_last_action', description: 'Redo the last undone mutation', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_undo_history', description: 'List undoable mutations', inputSchema: { type: 'object', properties: {} } },
  { name: 'create_custom_node', description: 'Create a new custom node type. code is JS body for async (data,config) => { ...; return result; } . type auto-prefixed with custom_', inputSchema: { type: 'object', properties: { type: {type:'string'}, displayName:{type:'string'}, description:{type:'string'}, color:{type:'string'}, icon:{type:'string'}, fields:{type:'array'}, code:{type:'string'} }, required:['code'] } },
  { name: 'list_custom_nodes', description: 'List all custom node definitions', inputSchema: { type: 'object', properties: {} } },
  { name: 'delete_custom_node', description: 'Delete a custom node type', inputSchema: { type: 'object', properties: { type: {type:'string'} }, required:['type'] } },
  { name: 'update_custom_node', description: 'Update a custom node code/fields', inputSchema: { type: 'object', properties: { type:{type:'string'}, code:{type:'string'}, fields:{type:'array'}, displayName:{type:'string'}, description:{type:'string'}, color:{type:'string'}, icon:{type:'string'} }, required:['type'] } },
];

// ---- Persistence Helpers (P1: file persistence + indexes) ----
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'workflows.json');
function ensureDataDir() {
  try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}
function persistWorkflows() {
  try {
    ensureDataDir();
    const data = { workflows: Array.from(workflows.entries()), templates: Array.from(templates.entries()), at: new Date().toISOString() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
  } catch (e) { logger.warn({ err: e.message }, 'persist failed'); }
  // Also persist to Supabase if enabled (fire-and-forget)
  if (isSupabaseEnabled()) {
    dbPersistWorkflows(workflows, templates).catch(e=> logger.warn({err:e.message}, 'supabase persist failed'));
  }
}
function loadPersisted() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (data.workflows) data.workflows.forEach(([k,v]) => { workflows.set(k,v); (v.nodes||[]).forEach(n => nodeIndex.set(n.id, k)); (v.edges||[]).forEach(e => edgeIndex.set(e.id, k)); });
      if (data.templates) data.templates.forEach(([k,v]) => templates.set(k,v));
      logger.info({ count: workflows.size }, 'loaded persisted workflows');
    }
  } catch (e) { logger.warn({ err: e.message }, 'load persisted failed'); }
}
loadPersisted();
// If Supabase configured, also load from Supabase (merge, Supabase wins for newer)
if (isSupabaseEnabled()) {
  dbLoadWorkflows(workflows, templates, nodeIndex, edgeIndex).then(()=> {
    logger.info({ count: workflows.size }, 'supabase workflows merged');
  }).catch(e=> logger.warn({err:e.message}, 'supabase load failed'));
}

function getWorkflowKey(userId, id) {
  if (isSupabaseEnabled() && userId && userId !== 'dev-anon' && userId !== 'anonymous') return `${userId}:${id}`;
  return id;
}
function createDefaultWorkflow(userId = 'dev-anon') {
  const id = 'default';
  const key = getWorkflowKey(userId, id);
  if (!workflows.has(key)) {
    workflows.set(key, { id, userId, nodes: [{ id: 'start', type: 'start', label: 'Start', config: {}, position: { x: 40, y: 200 } }], edges: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    persistWorkflows();
  }
  return workflows.get(key);
}
function invalidateCache(workflowId) {
  cache.del(CACHE_KEYS.workflowStatus(workflowId));
  cache.del(CACHE_KEYS.executionDetails(workflowId));
}
function pushHistory(label, workflow) {
  try {
    const snap = JSON.parse(JSON.stringify({ nodes: workflow.nodes, edges: workflow.edges }));
    mutationHistory.push({ ...snap, label, at: new Date().toISOString() });
    if (mutationHistory.length > MAX_HISTORY) mutationHistory.shift();
    redoStack.length = 0;
  } catch {}
}

// ---- Real Engine (P0: replace simulate with real fetch) ----
const sleep = (ms) => new Promise(r => setTimeout(r, Math.max(0, ms)));
function getPath(obj, pathStr) { return pathStr.split('.').filter(Boolean).reduce((o,k) => (o==null?undefined:o[k]), obj); }
function parseMaybeJson(t) { try { return JSON.parse(t); } catch { return t; } }
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

async function runApiCall(cfg, input) {
  const url = cfg?.url;
  if (!url) throw new Error('no URL configured');
  const method = String(cfg?.method || 'GET').toUpperCase();
  const headers = { ...(cfg?.headers || {}) };
  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    const raw = cfg?.body ?? (method !== 'GET' ? input : undefined);
    if (raw !== undefined && raw !== null && raw !== '') {
      body = typeof raw === 'string' ? raw : JSON.stringify(raw);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
  }
  const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  const parsed = parseMaybeJson(text);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${String(text).slice(0,200)}`);
  return parsed;
}
async function runTransform(data, cfg) {
  const op = cfg?.op || 'passthrough';
  switch(op) {
    case 'pick': { const keys = String(cfg?.keys||'').split(',').map(k=>k.trim()).filter(Boolean); const out={}; for(const k of keys) out[k]=getPath(data,k); return out; }
    case 'count': return Array.isArray(data) ? {count:data.length} : {count:Object.keys(data||{}).length};
    case 'first': return Array.isArray(data) ? data[0] : data;
    case 'expression': {
      if (!cfg?.expression) throw new Error('no expression set');
      const fn = new AsyncFunction('data', `"use strict"; return (${String(cfg.expression).trim()})(data);`);
      return await fn(data);
    }
    default: return data;
  }
}
async function evalCondition(data, cfg) {
  if (cfg?.expression) { const fn = new AsyncFunction('data', `"use strict"; return Boolean(await (${cfg.expression})(data));`); return await fn(data); }
  if (cfg?.path !== undefined && cfg?.path !== '') return getPath(data, cfg.path) === (cfg.equals===undefined?true:cfg.equals);
  return true;
}
async function runCode(data, cfg) {
  const code = cfg?.code || cfg?.expression;
  if (!code) throw new Error('code node requires code');
  const fn = new AsyncFunction('data', `"use strict"; ${code}`);
  return await fn(data);
}
async function runWebhook(data, cfg) {
  const url = cfg?.url; if (!url) throw new Error('webhook requires URL');
  const method = String(cfg?.method||'POST').toUpperCase();
  const headers = { 'Content-Type':'application/json', ...(cfg?.headers||{}) };
  const res = await fetch(url, { method, headers, body: JSON.stringify(data), signal: AbortSignal.timeout(8000) });
  const text = await res.text(); const parsed = parseMaybeJson(text);
  if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
  return { status: res.status, data: parsed };
}
async function runAi(data, cfg) {
  const prompt = cfg?.prompt || 'Summarize';
  const apiKey = cfg?.apiKey;
  if (!apiKey) return { prompt, response: `[AI simulated] Prompt:${prompt} Data:${JSON.stringify(data).slice(0,200)}` };
  const res = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`}, body: JSON.stringify({ model: cfg?.model||'gpt-3.5-turbo', messages:[{role:'system', content:'You are helpful'}, {role:'user', content:`${prompt}\n\nInput:\n${JSON.stringify(data,null,2)}`}]}), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`AI API ${res.status}`);
  const j = await res.json(); return { response: j.choices?.[0]?.message?.content || 'no response' };
}


// ---- New major n8n nodes (mirrors frontend/src/engine.ts) ----
async function runSchedule(_data, cfg) {
  const cron = cfg?.cron || cfg?.schedule || '*/5 * * * *';
  const intervalMs = cfg?.intervalMs ?? cfg?.ms ?? 0;
  if (intervalMs) await sleep(Number(intervalMs));
  return { scheduled: true, cron, nextRun: new Date(Date.now() + Number(intervalMs || 60000)).toISOString() };
}
async function runGraphQL(_data, cfg) {
  const url = cfg?.url || cfg?.endpoint;
  const query = cfg?.query || cfg?.graphql || '{ __typename }';
  const variables = cfg?.variables || {};
  const headers = cfg?.headers || {};
  if (!url) throw new Error('GraphQL requires url/endpoint');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ query, variables: typeof variables === 'string' ? JSON.parse(variables) : variables }), signal: AbortSignal.timeout(8000) });
  const text = await res.text(); const parsed = parseMaybeJson(text);
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${String(text).slice(0,400)}`);
  return parsed;
}
function runSet(data, cfg) {
  const keepOnlySet = cfg?.keepOnlySet ?? cfg?.keepOnly ?? false;
  const fields = cfg?.fields || cfg?.set || cfg?.values || {};
  let parsedFields = {};
  if (typeof fields === 'string') { try { parsedFields = JSON.parse(fields); } catch { parsedFields = {}; } }
  else if (typeof fields === 'object') parsedFields = fields;
  if (Object.keys(parsedFields).length === 0) {
    const reserved = new Set(['keepOnlySet','keepOnly','fields','set','values']);
    for (const [k,v] of Object.entries(cfg)) if (!reserved.has(k)) parsedFields[k]=v;
  }
  const base = keepOnlySet ? {} : (typeof data === 'object' && data!==null ? { ...data } : {});
  for (const [k,v] of Object.entries(parsedFields)) {
    if (typeof v === 'string' && v.includes('{{')) base[k]=v.replace(/\{\{\s*\$json\.([\w.]+)\s*\}\}/g, (_m,p)=>String(getPath(data,p)??''));
    else base[k]=v;
  }
  return base;
}
async function runSwitch(data, cfg) {
  const rules = cfg?.rules || cfg?.cases || cfg?.switch || [];
  const expression = cfg?.expression || cfg?.code;
  let matched = 'default';
  if (expression) { const fn = new AsyncFunction('data', `"use strict"; return await (${expression})(data);`); const res = await fn(data); matched = String(res); }
  else if (Array.isArray(rules) && rules.length) {
    for (const rule of rules) {
      const expr = rule.expression || rule.condition;
      if (expr) { const fn = new AsyncFunction('data', `"use strict"; return Boolean(await (${expr})(data));`); if (await fn(data)) { matched = rule.value ?? rule.case ?? 'true'; break; } }
    }
  } else if (cfg?.value !== undefined) matched = String(cfg.value);
  return { case: matched, data, matchedCase: matched };
}
function runAggregate(data, cfg) {
  const field = cfg?.field || cfg?.groupBy || '';
  const operation = cfg?.operation || cfg?.aggregate || 'count';
  const items = Array.isArray(data) ? data : data?.items || data?.data || [data];
  if (operation === 'count') return { count: items.length, field, operation };
  if (operation === 'sum' && field) { const sum = items.reduce((s,it)=> s + Number(getPath(it, field) ?? it[field] ?? 0),0); return { sum, field, count: items.length }; }
  if (operation === 'avg' && field) { const sum = items.reduce((s,it)=> s + Number(getPath(it, field) ?? 0),0); return { avg: items.length ? sum / items.length : 0, field, count: items.length }; }
  if (field) { const groups={}; for(const it of items){ const key=String(getPath(it, field) ?? it[field] ?? 'null'); if(!groups[key]) groups[key]=[]; groups[key].push(it); } return { groups, count: items.length, field }; }
  return { count: items.length, items };
}
function runSort(data, cfg) {
  const field = cfg?.field || cfg?.sortBy || '';
  const order = String(cfg?.order || cfg?.direction || 'asc').toLowerCase();
  const items = Array.isArray(data) ? [...data] : data?.items ? [...data.items] : [data];
  if (!field) items.sort();
  else items.sort((a,b)=>{ const av=getPath(a,field)??a[field]; const bv=getPath(b,field)??b[field]; if(av===bv) return 0; const cmp= av > bv ? 1 : -1; return order==='desc'?-cmp:cmp; });
  return { sorted: items, count: items.length, field, order };
}
function runLimit(data, cfg) {
  const max = Number(cfg?.max ?? cfg?.limit ?? 10);
  const offset = Number(cfg?.offset ?? 0);
  const items = Array.isArray(data) ? data : data?.items || data?.data || [data];
  const sliced = items.slice(offset, offset+max);
  return { limited: sliced, count: sliced.length, total: items.length, offset, max };
}
function runItemLists(data, cfg) {
  const operation = cfg?.operation || 'union';
  const a = Array.isArray(data) ? data : data?.a || data?.items || [data];
  const b = Array.isArray(cfg?.list) ? cfg.list : cfg?.b ? (Array.isArray(cfg.b) ? cfg.b : [cfg.b]) : [];
  if (operation === 'union') return { result: [...a, ...b], count: a.length + b.length };
  if (operation === 'intersect') { const setB=new Set(b.map(x=>JSON.stringify(x))); return { result: a.filter(x=>setB.has(JSON.stringify(x))), operation }; }
  if (operation === 'difference') { const setB=new Set(b.map(x=>JSON.stringify(x))); return { result: a.filter(x=>!setB.has(JSON.stringify(x))), operation }; }
  return { result: a, operation };
}
async function runFunction(data, cfg) {
  const code = cfg?.code || cfg?.functionCode || cfg?.expression || 'return data;';
  const fn = new AsyncFunction('data', 'items', `"use strict"; ${code}`);
  const items = Array.isArray(data) ? data : [data];
  if (cfg?.perItem) { const out=[]; for(const it of items) out.push(await fn(it, items)); return { results: out, count: out.length }; }
  return await fn(data, items);
}
function runNoOp(data, _cfg) { return data; }
async function runWebhookResponse(data, cfg) {
  const status = Number(cfg?.status ?? 200);
  const body = cfg?.body ?? data;
  const headers = cfg?.headers || {};
  return { status, body: typeof body === 'string' ? body : JSON.stringify(body).slice(0,2000), headers, simulated: true };
}
async function runHtml(data, cfg) {
  const operation = cfg?.operation || 'extract';
  const html = String(cfg?.html ?? data?.html ?? data ?? '');
  const selector = cfg?.selector || cfg?.css || '';
  const attribute = cfg?.attribute || 'textContent';
  if (operation === 'extract' && selector) {
    return { html: html.slice(0,5000), selector, attribute, note: 'HTML extract requires browser DOMParser — returning raw. Configure selector to parse client-side.' };
  }
  return { html: html.slice(0,5000), operation, selector };
}
function runDateTime(data, cfg) {
  const operation = cfg?.operation || 'now';
  const input = cfg?.date ?? cfg?.value ?? data;
  const format = cfg?.format || 'iso';
  const parse = (v)=>{ if(v instanceof Date) return v; if(typeof v==='number') return new Date(v); if(typeof v==='string'){ const d=new Date(v); if(!isNaN(d.getTime())) return d; } return new Date(); };
  if (operation === 'now') return { now: new Date().toISOString(), timestamp: Date.now() };
  if (operation === 'format') { const d=parse(input); if(format==='iso') return { formatted:d.toISOString(), input }; if(format==='locale') return { formatted:d.toLocaleString(), input }; return { formatted:d.toISOString(), format, input }; }
  if (operation === 'add') { const d=parse(input); const amount=Number(cfg?.amount??1); const unit=cfg?.unit||'days'; const mul={ ms:1, seconds:1000, minutes:60000, hours:3600000, days:86400000 }; return { result: new Date(d.getTime()+amount*(mul[unit]??86400000)).toISOString(), operation, amount, unit }; }
  return { result: parse(input).toISOString(), operation };
}
async function runGenericApp(app, data, cfg) {
  const url = cfg?.url || cfg?.webhookUrl || cfg?.endpoint;
  const method = String(cfg?.method || 'POST').toUpperCase();
  const headers = cfg?.headers || {};
  const body = cfg?.body ?? cfg?.payload ?? data;
  const simulatedNote = `simulated ${app} — configure url/webhookUrl to send for real`;
  if (!url) { return { app, simulated: true, note: simulatedNote, dataPreview: String(JSON.stringify(data)).slice(0,500), config: cfg }; }
  const res = await fetch(url, { method, headers: { 'Content-Type':'application/json', ...headers }, body: method==='GET'?undefined:JSON.stringify(body), signal: AbortSignal.timeout(8000) });
  const text = await res.text(); const parsed = parseMaybeJson(text);
  if (!res.ok) throw new Error(`${app} HTTP ${res.status}: ${String(text).slice(0,400)}`);
  return { app, status: res.status, data: parsed, simulated:false };
}
async function runSlack(data,cfg){ return runGenericApp('slack',data,cfg); }
async function runDiscord(data,cfg){ return runGenericApp('discord',data,cfg); }
async function runGithub(data,cfg){ return runGenericApp('github',data,cfg); }
async function runGmail(data,cfg){ return runGenericApp('gmail',data,cfg); }
async function runGoogleSheets(data,cfg){ return runGenericApp('google_sheets',data,cfg); }
async function runNotion(data,cfg){ return runGenericApp('notion',data,cfg); }
async function runAirtable(data,cfg){ return runGenericApp('airtable',data,cfg); }
async function runPostgres(data,cfg){ const query=cfg?.query||cfg?.sql||'SELECT 1'; if(cfg?.url) return runGenericApp('postgres',data,{...cfg, query}); return { app:'postgres', query, simulated:true, note:'simulated — configure url to query real DB', rowCount: Array.isArray(data)?data.length:1 }; }
async function runMySQL(data,cfg){ const query=cfg?.query||cfg?.sql||'SELECT 1'; if(cfg?.url) return runGenericApp('mysql',data,{...cfg, query}); return { app:'mysql', query, simulated:true, note:'simulated — configure url' }; }
async function runMongoDB(data,cfg){ const operation=cfg?.operation||'find'; if(cfg?.url) return runGenericApp('mongodb',data,cfg); return { app:'mongodb', operation, simulated:true, note:'simulated — configure url' }; }
async function runRedis(data,cfg){ const operation=cfg?.operation||'get'; const key=cfg?.key||'default'; if(cfg?.url) return runGenericApp('redis',data,cfg); return { app:'redis', operation, key, simulated:true, note:'simulated in backend — no persistent store' }; }
async function runStripe(data,cfg){ return runGenericApp('stripe',data,cfg); }
async function runShopify(data,cfg){ return runGenericApp('shopify',data,cfg); }
async function runAwsS3(data,cfg){ return runGenericApp('aws_s3',data,cfg); }
async function runOpenAI(data,cfg){
  const prompt=cfg?.prompt||cfg?.message||'Hello'; const model=cfg?.model||'gpt-4o-mini'; const apiKey=cfg?.apiKey;
  if(!apiKey) return { app:'openai', model, prompt, response:`[OpenAI simulated] ${prompt} | Data: ${String(JSON.stringify(data)).slice(0,200)}`, note:'No API key — simulated' };
  const res=await fetch('https://api.openai.com/v1/chat/completions',{ method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${apiKey}`}, body: JSON.stringify({ model, messages:[{role:'user', content:`${prompt}\n\nData:\n${JSON.stringify(data,null,2)}`}]}), signal: AbortSignal.timeout(10000) });
  if(!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0,400)}`);
  const json=await res.json(); return { app:'openai', model, response: json.choices?.[0]?.message?.content||'', prompt };
}

const CUSTOM_NODES_FILE = path.join(DATA_DIR, 'custom_nodes.json');
let customNodesCache = [];
function loadCustomNodes() {
  try {
    if (fs.existsSync(CUSTOM_NODES_FILE)) {
      const raw = fs.readFileSync(CUSTOM_NODES_FILE, 'utf8');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) customNodesCache = arr;
    }
  } catch (e) { logger.warn({err:e.message}, 'load custom nodes failed'); }
  if (isSupabaseEnabled()) {
    dbLoadCustomNodes().then(nodes=> {
      if (Array.isArray(nodes) && nodes.length) {
        const map = new Map(customNodesCache.map(n=>[n.type,n]));
        for (const n of nodes) if (!map.has(n.type)) customNodesCache.push(n);
        logger.info({count: customNodesCache.length}, 'supabase custom nodes merged');
      }
    }).catch(e=> logger.warn({err:e.message}, 'supabase load custom failed'));
  }
}
function saveCustomNodes() {
  try {
    ensureDataDir();
    fs.writeFileSync(CUSTOM_NODES_FILE, JSON.stringify(customNodesCache, null, 2), 'utf8');
  } catch (e) { logger.warn({err:e.message}, 'save custom nodes failed'); }
  if (isSupabaseEnabled()) {
    dbPersistCustomNodes(customNodesCache).catch(e=> logger.warn({err:e.message}, 'supabase persist custom failed'));
  }
}
function getCustomDefBackend(type) { return customNodesCache.find(n=>n.type===type); }
async function runCustomBackend(data, cfg, def) {
  const code = cfg.code || def.code;
  if (!code) throw new Error(`custom node ${def.type} missing code`);
  return await runSandboxed(code, data, cfg, { timeoutMs: 2000 });
}
loadCustomNodes();

function topologicalSort(nodes, edges) {
  const adj = {}; const indeg = {};
  nodes.forEach(n => { adj[n.id]=[]; indeg[n.id]=0; });
  edges.forEach(e => { if (adj[e.source] && indeg[e.target]!==undefined) { adj[e.source].push(e.target); indeg[e.target]++; } });
  const q = nodes.filter(n=>indeg[n.id]===0).map(n=>n.id);
  const order=[]; while(q.length){ const cur=q.shift(); order.push(cur); for(const nb of adj[cur]){ indeg[nb]--; if(indeg[nb]===0) q.push(nb); } }
  nodes.forEach(n=>{ if(!order.includes(n.id)) order.push(n.id); });
  return order;
}

async function executeWorkflowReal(nodes, edges, input) {
  const t0 = Date.now();
  const statusMap = {}; const outputs = {}; const byId = new Map(nodes.map(n=>[n.id,n]));
  let lastCondition = null; let hadError = false;
  const order = topologicalSort(nodes, edges);
  for (const id of order) {
    const node = byId.get(id); if (!node) continue;
    const incoming = edges.filter(e=>e.target===id);
    let blocked=null;
    for (const e of incoming) {
      if (hadError && statusMap[e.source]==='fault') { blocked=`upstream ${e.source} faulted`; break; }
      if (statusMap[e.source]==='skipped') { blocked=`upstream ${e.source} skipped`; break; }
      const lbl = String(e.label||'').trim().toLowerCase();
      if ((lbl==='true'||lbl==='false') && lastCondition!==null) { if ((lbl==='true')!==lastCondition) { blocked=`branch ${lastCondition} vs ${lbl}`; break; } }
    }
    if (blocked) { statusMap[id]='skipped'; outputs[id]={skipped:true, reason:blocked}; continue; }
    try {
      let result; const upstreamData = incoming.length ? outputs[incoming[incoming.length-1].source] : undefined;
      const data = upstreamData!==undefined ? upstreamData : input||{};
      switch(node.type) {
        case 'start': result = input||{}; break;
        case 'api_call': result = await runApiCall(node.config, data); break;
        case 'transform': result = await runTransform(data, node.config); break;
        case 'condition': { const passed=await evalCondition(data, node.config); lastCondition=passed; result={passed, checked:node.label}; break; }
        case 'delay': await sleep(Number(node.config?.ms ?? node.config?.duration ?? 1000)); result={waitedMs: Number(node.config?.ms ?? 1000)}; break;
        case 'output': { result={delivered:'console', data}; console.log('[output]', data); if (node.config?.kind==='webhook' && node.config?.url) enqueueJob('webhook', { url: node.config.url, data }); break; }
        case 'filter': {
          const raw=node.config?.expression;
          if(!raw || !String(raw).trim()) throw new Error('filter requires expression');
          const expr=String(raw).trim();
          const isFunc=expr.includes('=>') || expr.trim().startsWith('function');
          let fn;
          try {
            if(isFunc) fn=new AsyncFunction('data', `"use strict"; return Boolean(await (${expr})(data));`);
            else fn=new AsyncFunction('data', `"use strict"; return Boolean(await (${expr}));`);
          } catch(e){ throw new Error(`filter expression syntax error: ${e.message}`); }
          if(Array.isArray(data)){
            const results=await Promise.all(data.map((item)=> fn(item).catch(()=>false)));
            result=data.filter((_,i)=> results[i]);
            break;
          }
          if(data && typeof data==='object'){
            const arrayKeys=Object.keys(data).filter(k=> Array.isArray(data[k]));
            if(arrayKeys.length===1){
              const key=arrayKeys[0]; const inner=data[key];
              if(inner.length>0){
                let wrapperPass=false; try{ wrapperPass=await fn(data);}catch{ wrapperPass=false; }
                if(!wrapperPass){
                  try{
                    const innerResults=await Promise.all(inner.map((item)=> fn(item).catch(()=>false)));
                    if(innerResults.some(Boolean)){
                      const filteredInner=inner.filter((_,i)=> innerResults[i]);
                      result={ ...data, [key]: filteredInner, filtered: filteredInner, count: filteredInner.length, total: inner.length, passed: filteredInner.length>0 };
                      break;
                    }
                  }catch{}
                }
              }
            }
          }
          let pass=false; try{ pass=await fn(data);}catch(e){ throw new Error(`filter predicate error: ${e.message}`); }
          if(pass) result=data;
          else { result=[]; result.passed=false; result.original=data; result.count=0; result.total=1; }
          break;
        }
        case 'split': { if(Array.isArray(data)){ const bs=Number(node.config?.batchSize??1); const batches=[]; for(let i=0;i<data.length;i+=bs) batches.push(data.slice(i,i+bs)); result={batches, count:batches.length}; } else if(typeof data==='object'&&data!==null){ const ks=Object.keys(data); result={items:ks.map(k=>({key:k,value:data[k]})), count:ks.length}; } else result={items:[data],count:1}; break; }
        case 'merge': { if(Array.isArray(data)) result=data.reduce((a,it)=>{ if(Array.isArray(it)) return a.concat(it); if(typeof it==='object'&&it!==null) return {...a,...it}; return a;},{}); else result=data; break; }
        case 'loop': { const items=Array.isArray(data)?data:data?.items||data?.batches||[data]; const max=Number(node.config?.maxIterations??10); const res=[]; for(let i=0;i<Math.min(items.length,max);i++) res.push({index:i,value:items[i]}); result={iterations:res,total:items.length}; break; }
        case 'code': result=await runCode(data, node.config); break;
        case 'webhook': result=await runWebhook(data, node.config); break;
        case 'ai': result=await runAi(data, node.config); break;
        case 'validator': { const r=node.config?.rules||node.config?.expression; if(r){ const fn=new AsyncFunction('data', `"use strict"; return await (${r})(data);`); result={valid:Boolean(await fn(data)), data}; } else result={valid:!!data && Object.keys(data||{}).length>0, data}; break; }
        case 'logger': result={level:node.config?.level||'info', message:node.config?.message||'', data, timestamp:new Date().toISOString()}; break;
        case 'file': { if(node.config?.operation==='write') enqueueJob('file', { path: node.config?.path||'output.json', data }); result={operation: node.config?.operation||'read', path: node.config?.path}; break; }
        case 'schedule': result=await runSchedule(data, node.config); break;
        case 'graphql': result=await runGraphQL(data, node.config); break;
        case 'set': result=runSet(data, node.config); break;
        case 'switch': { const sw=await runSwitch(data, node.config); result=sw; break; }
        case 'aggregate': result=runAggregate(data, node.config); break;
        case 'sort': result=runSort(data, node.config); break;
        case 'limit': result=runLimit(data, node.config); break;
        case 'item_lists': result=runItemLists(data, node.config); break;
        case 'function': result=await runFunction(data, node.config); break;
        case 'noop': result=runNoOp(data, node.config); break;
        case 'webhook_response': result=await runWebhookResponse(data, node.config); break;
        case 'html': result=await runHtml(data, node.config); break;
        case 'date_time': result=runDateTime(data, node.config); break;
        case 'slack': result=await runSlack(data, node.config); break;
        case 'discord': result=await runDiscord(data, node.config); break;
        case 'github': result=await runGithub(data, node.config); break;
        case 'gmail': result=await runGmail(data, node.config); break;
        case 'google_sheets': result=await runGoogleSheets(data, node.config); break;
        case 'notion': result=await runNotion(data, node.config); break;
        case 'airtable': result=await runAirtable(data, node.config); break;
        case 'postgres': result=await runPostgres(data, node.config); break;
        case 'mysql': result=await runMySQL(data, node.config); break;
        case 'mongodb': result=await runMongoDB(data, node.config); break;
        case 'redis': result=await runRedis(data, node.config); break;
        case 'stripe': result=await runStripe(data, node.config); break;
        case 'shopify': result=await runShopify(data, node.config); break;
        case 'aws_s3': result=await runAwsS3(data, node.config); break;
        case 'openai': result=await runOpenAI(data, node.config); break;
        case 'manual_trigger': result=input||{}; break;
        default: {
          if (isCustomType(node.type)) {
            const def = getCustomDefBackend(node.type);
            if (!def) throw new Error(`custom node ${node.type} not found — create it via create_custom_node`);
            result = await runCustomBackend(data, node.config, def);
            break;
          }
          throw new Error(`unknown type ${node.type}`);
        }
      }
      statusMap[id]='done'; outputs[id]=result;
    } catch(err) { hadError=true; statusMap[id]='fault'; outputs[id]={error: err.message, stack: String(err.stack||'').slice(0,800), nodeType: node.type}; }
  }
  return { success: !hadError, executedAt: new Date().toISOString(), durationMs: Date.now()-t0, order, status: statusMap, outputs };
}

// ---- WebMCP Tool Execution Endpoint (P0/P1/P2) ----
app.post('/api/execute-tool', async (req, res) => {
  const { tool, input } = req.body;
  if (!tool || typeof tool !== 'string') return res.status(400).json({ success: false, error: 'tool required' });
  const workflow = createDefaultWorkflow(req.userId || 'dev-anon');
  metrics.toolCalls[tool] = (metrics.toolCalls[tool]||0)+1;

  try {
    let result;
    switch (tool) {
      case 'add_node': {
        const parsed = addNodeSchema.safeParse(input||{});
        if (!parsed.success) { const issues = (parsed.error.issues || parsed.error.errors || []); result = { success:false, error: issues.map(e=>e.message).join(', ') || parsed.error.message }; break; }
        const { type, label, config, position, x, y } = parsed.data;
        const pos = position || (x!==undefined||y!==undefined ? { x: x??250, y: y??150 } : { x: 250, y: 150 });
        pushHistory(`add_node:${type}:${label}`, workflow);
        const node = { id: `node_${uuidv4().slice(0,8)}`, type, label, config: config||{}, position: pos, createdAt: new Date().toISOString() };
        workflow.nodes.push(node); workflow.updatedAt = new Date().toISOString();
        nodeIndex.set(node.id, workflow.id); invalidateCache(workflow.id); persistWorkflows();
        result = { success:true, node, nodeId: node.id, message:`Added ${type} node: ${label}` }; break;
      }
      case 'connect_nodes': {
        const parsed = connectNodesSchema.safeParse(input||{});
        const src = parsed.data?.sourceNodeId || parsed.data?.source || parsed.data?.from;
        const tgt = parsed.data?.targetNodeId || parsed.data?.target || parsed.data?.to;
        if (!src || !tgt) { result={success:false, error:'sourceNodeId and targetNodeId required'}; break; }
        if (!workflow.nodes.find(n=>n.id===src)) { result={success:false, error:`Source not found: ${src}`}; break; }
        if (!workflow.nodes.find(n=>n.id===tgt)) { result={success:false, error:`Target not found: ${tgt}`}; break; }
        if (workflow.edges.find(e=>e.source===src && e.target===tgt)) { result={success:false, error:'Edge already exists'}; break; }
        pushHistory(`connect:${src}->${tgt}`, workflow);
        const edge = { id:`edge_${uuidv4().slice(0,8)}`, source:src, target:tgt, label: parsed.data?.label||'', animated:true };
        workflow.edges.push(edge); workflow.updatedAt=new Date().toISOString();
        edgeIndex.set(edge.id, workflow.id); invalidateCache(workflow.id); persistWorkflows();
        result={success:true, edge, edgeId:edge.id, message:`Connected ${src} → ${tgt}`}; break;
      }
      case 'execute_workflow': {
        // P1: clean - only execute needed nodes, P2: cache not used for execution
        const execResult = await executeWorkflowReal(workflow.nodes, workflow.edges, input?.input||{});
        const execId = uuidv4().slice(0,8);
        executionLogs.set(execId, { id:execId, workflowId:workflow.id, ...execResult });
        if (executionLogs.size>100) { const first = executionLogs.keys().next().value; executionLogs.delete(first); }
        cache.set(CACHE_KEYS.executionDetails(workflow.id), execResult, 60);
        result={success: execResult.success, executionId:execId, ...execResult}; break;
      }
      case 'get_available_tools':
        // P2: cached
        const cachedTools = cache.get(CACHE_KEYS.availableTools);
        if (cachedTools) { result=cachedTools; break; }
        result={success:true, tools:TOOL_DEFINITIONS, totalTools:TOOL_DEFINITIONS.length}; cache.set(CACHE_KEYS.availableTools, result, 300); break;
      case 'get_node_details': {
        if (!input?.nodeId) { result={success:false, error:'nodeId required'}; break; }
        const node = workflow.nodes.find(n=>n.id===input.nodeId);
        if (!node) { result={success:false, error:'Node not found'}; break; }
        const connections = workflow.edges.filter(e=>e.source===node.id||e.target===node.id);
        result={success:true, node, connections}; break;
      }
      case 'update_node_config': {
        const parsed = updateNodeConfigSchema.safeParse(input||{});
        if (!parsed.success) { const issues2 = (parsed.error.issues || parsed.error.errors || []); result={success:false, error: issues2.map(e=>e.message).join(', ') || parsed.error.message}; break; }
        let resolvedId = parsed.data.nodeId;
        if (!resolvedId && parsed.data.label) {
          const m = workflow.nodes.filter(n=>String(n.label).toLowerCase().includes(String(parsed.data.label).toLowerCase()));
          if (m.length===1) resolvedId=m[0].id; else if(m.length>1) { result={success:false, error:`Label ambiguous: ${m.map(x=>x.id).join(', ')}`}; break; }
        }
        const node = workflow.nodes.find(n=>n.id===resolvedId);
        if (!node) { result={success:false, error:`Node not found: ${resolvedId}`}; break; }
        pushHistory(`update:${resolvedId}`, workflow);
        node.config={...node.config, ...parsed.data.config}; workflow.updatedAt=new Date().toISOString();
        invalidateCache(workflow.id); persistWorkflows();
        result={success:true, node, message:`Updated config for ${node.label}`, appliedConfig: node.config}; break;
      }
      case 'get_workflow_status': {
        const cached = cache.get(CACHE_KEYS.workflowStatus(workflow.id));
        if (cached) { result=cached; break; }
        // P1: clean queries - summary by default, full on ?verbose
        const verbose = input?.verbose===true;
        result={success:true, workflow:{ id:workflow.id, nodeCount:workflow.nodes.length, edgeCount:workflow.edges.length, nodes: verbose ? workflow.nodes : workflow.nodes.map(n=>({id:n.id,type:n.type,label:n.label,position:n.position})), edges: workflow.edges }};
        cache.set(CACHE_KEYS.workflowStatus(workflow.id), result, 10); break;
      }
      case 'validate_workflow': {
        const errors=[]; const nodeIds=new Set(workflow.nodes.map(n=>n.id));
        workflow.nodes.forEach(n=>{
          if(!n.label) errors.push(`Node ${n.id} missing label`);
          if(n.type==='api_call' && !n.config?.url) errors.push(`api_call "${n.label}" missing url`);
          if(n.type==='code' && !n.config?.code && !n.config?.expression) errors.push(`code "${n.label}" missing code`);
        });
        workflow.edges.forEach(e=>{
          if(!nodeIds.has(e.source)) errors.push(`Edge ${e.id} missing source ${e.source}`);
          if(!nodeIds.has(e.target)) errors.push(`Edge ${e.id} missing target ${e.target}`);
        });
        const order=topologicalSort(workflow.nodes, workflow.edges);
        if(order.length!==workflow.nodes.length) errors.push('Circular dependency detected');
        result={success:true, valid:errors.length===0 && workflow.nodes.length>0, errors}; break;
      }
      case 'delete_node': {
        const id = input?.nodeId || input?.label;
        if(!id) { result={success:false, error:'nodeId required'}; break; }
        let resolved = id; if(!workflow.nodes.find(n=>n.id===id) && input?.label) { const m=workflow.nodes.filter(n=>String(n.label).toLowerCase().includes(String(input.label).toLowerCase())); if(m.length===1) resolved=m[0].id; }
        if(resolved==='start') { result={success:false, error:'Cannot delete Start'}; break; }
        const node=workflow.nodes.find(n=>n.id===resolved); if(!node) { result={success:false, error:`Node not found: ${resolved}`}; break; }
        pushHistory(`delete:${resolved}`, workflow);
        workflow.nodes=workflow.nodes.filter(n=>n.id!==resolved); workflow.edges=workflow.edges.filter(e=>e.source!==resolved&&e.target!==resolved);
        nodeIndex.delete(resolved); workflow.updatedAt=new Date().toISOString(); invalidateCache(workflow.id); persistWorkflows();
        result={success:true, message:`Deleted ${resolved}`, deletedId:resolved, undo:'call undo_last_action'}; break;
      }
      case 'clone_node': {
        const orig=workflow.nodes.find(n=>n.id===input?.nodeId); if(!orig) { result={success:false, error:`Node not found: ${input?.nodeId}`}; break; }
        pushHistory(`clone:${input.nodeId}`, workflow);
        const nid=`node_${uuidv4().slice(0,8)}`; const pos={ x:(orig.position?.x||0)+(input?.offsetX??120), y:(orig.position?.y||0)+(input?.offsetY??0) };
        const clone={ ...JSON.parse(JSON.stringify(orig)), id:nid, position:pos, label:`${orig.label} (copy)` }; workflow.nodes.push(clone); nodeIndex.set(nid, workflow.id); workflow.updatedAt=new Date().toISOString(); invalidateCache(workflow.id); persistWorkflows();
        result={success:true, nodeId:nid, message:`Cloned ${input.nodeId} → ${nid}`}; break;
      }
      case 'get_node_connections': {
        if(!input?.nodeId) { result={success:false, error:'nodeId required'}; break; }
        const incoming=workflow.edges.filter(e=>e.target===input.nodeId).map(e=>({edgeId:e.id,from:e.source,label:e.label}));
        const outgoing=workflow.edges.filter(e=>e.source===input.nodeId).map(e=>({edgeId:e.id,to:e.target,label:e.label}));
        result={nodeId:input.nodeId,incoming,outgoing}; break;
      }
      case 'save_workflow': {
        if(!input?.name) { result={success:false, error:'name required'}; break; }
        const key=`wf_${input.name}`; workflows.set(key, { id:key, name:input.name, nodes: JSON.parse(JSON.stringify(workflow.nodes)), edges: JSON.parse(JSON.stringify(workflow.edges)), createdAt:new Date().toISOString() });
        persistWorkflows(); result={success:true, message:`Workflow saved as "${input.name}"`}; break;
      }
      case 'load_workflow': {
        if(!input?.name) { result={success:false, error:'name required'}; break; }
        const key=`wf_${input.name}`; const data=workflows.get(key); if(!data) { result={success:false, error:`No workflow "${input.name}"`}; break; }
        pushHistory(`load:${input.name}`, workflow);
        workflow.nodes=JSON.parse(JSON.stringify(data.nodes)); workflow.edges=JSON.parse(JSON.stringify(data.edges)); workflow.updatedAt=new Date().toISOString(); invalidateCache(workflow.id); persistWorkflows();
        result={success:true, message:`Loaded "${input.name}"`, nodeCount:data.nodes.length}; break;
      }
      case 'run_node': {
        const rid = input?.nodeId || input?.label; if(!rid) { result={success:false, error:'nodeId required'}; break; }
        let node=workflow.nodes.find(n=>n.id===rid); if(!node && input?.label) { const m=workflow.nodes.filter(n=>String(n.label).toLowerCase().includes(String(input.label).toLowerCase())); if(m.length===1) node=m[0]; }
        if(!node) { result={success:false, error:`Node not found: ${rid}`}; break; }
        try { const r=await executeWorkflowReal([node], [], input?.input||{}); result={success:r.success, nodeId:node.id, output:r.outputs[node.id], status:r.status[node.id], durationMs:r.durationMs}; } catch(e){ result={success:false, error:e.message, stack:String(e.stack).slice(0,800)}; } break;
      }
      case 'set_node_position': {
        if(!input?.nodeId|| input?.x===undefined|| input?.y===undefined) { result={success:false, error:'nodeId,x,y required'}; break; }
        const n=workflow.nodes.find(x=>x.id===input.nodeId); if(!n) { result={success:false, error:`Node not found: ${input.nodeId}`}; break; }
        pushHistory(`move:${input.nodeId}`, workflow);
        n.position={x:Math.round(input.x), y:Math.round(input.y)}; workflow.updatedAt=new Date().toISOString(); invalidateCache(workflow.id); persistWorkflows();
        result={success:true, message:`Moved ${input.nodeId} to (${n.position.x},${n.position.y})`, position:n.position}; break;
      }
      case 'get_workflow_history': {
        const logs=Array.from(executionLogs.values()).slice(-20).map(l=>({id:l.id, executedAt:l.executedAt, durationMs:l.durationMs, success:l.success, order:l.order}));
        result={history:logs, totalRuns:executionLogs.size}; break;
      }
      case 'create_template': {
        if(!input?.name) { result={success:false, error:'name required'}; break; }
        templates.set(input.name, { name:input.name, description:input.description||'', nodes:JSON.parse(JSON.stringify(workflow.nodes)), edges:JSON.parse(JSON.stringify(workflow.edges)), createdAt:new Date().toISOString() });
        persistWorkflows(); result={success:true, message:`Template "${input.name}" created`, nodeCount:workflow.nodes.length}; break;
      }
      case 'export_workflow': {
        const data={version:1, exportedAt:new Date().toISOString(), nodes:workflow.nodes, edges:workflow.edges};
        const json= input?.pretty===false ? JSON.stringify(data) : JSON.stringify(data,null,2);
        result={success:true, json, byteLength:json.length}; break;
      }
      case 'import_workflow': {
        if(!input?.json) { result={success:false, error:'json required'}; break; }
        try { const data=JSON.parse(input.json); if(!data.nodes||!data.edges) { result={success:false, error:'Invalid workflow JSON'}; break; } pushHistory(`import:${input.merge?'merge':'replace'}`, workflow);
          if(input.merge){ workflow.nodes.push(...data.nodes); workflow.edges.push(...data.edges); data.nodes.forEach(n=>nodeIndex.set(n.id,workflow.id)); data.edges.forEach(e=>edgeIndex.set(e.id,workflow.id)); } else { workflow.nodes=data.nodes; workflow.edges=data.edges; nodeIndex.clear(); edgeIndex.clear(); data.nodes.forEach(n=>nodeIndex.set(n.id,workflow.id)); data.edges.forEach(e=>edgeIndex.set(e.id,workflow.id)); }
          workflow.updatedAt=new Date().toISOString(); invalidateCache(workflow.id); persistWorkflows(); result={success:true, message:`Imported ${data.nodes.length} nodes, ${data.edges.length} edges`};
        } catch(e){ result={success:false, error:`Invalid JSON: ${e.message}`}; } break;
      }
      case 'find_nodes': {
        const q=String(input?.query||'').toLowerCase().trim(); let nodes=workflow.nodes;
        if(input?.type) nodes=nodes.filter(n=>n.type===input.type);
        if(q) nodes=nodes.filter(n=> String(n.label).toLowerCase().includes(q) || String(n.type).toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
        const limit=Math.min(input?.limit||20, 50);
        result={success:true, count:nodes.length, nodes: nodes.slice(0,limit).map(n=>({id:n.id,label:n.label,type:n.type,position:n.position,hasConfig:!!n.config&&Object.keys(n.config).length>0}))}; break;
      }
      case 'get_execution_details': {
        const last=Array.from(executionLogs.values()).pop() || cache.get(CACHE_KEYS.executionDetails(workflow.id));
        if(!last) { result={success:false, error:'No execution yet'}; break; }
        const include = input?.includeOutputs!==false; const trunc = input?.truncateAt ?? 2000;
        const perNode=(last.order||Object.keys(last.outputs||{})).map(id=>({id,label:workflow.nodes.find(n=>n.id===id)?.label||id,type:workflow.nodes.find(n=>n.id===id)?.type||'unknown',status:last.status[id]||'unknown', output: include? (JSON.stringify(last.outputs[id]||'').length>trunc ? { _truncated:true, preview: JSON.stringify(last.outputs[id]).slice(0,trunc)} : last.outputs[id]) : undefined, error:last.outputs[id]?.error}));
        result={success:last.success, executedAt:last.executedAt, durationMs:last.durationMs, order:last.order, total:perNode.length, done:perNode.filter(p=>p.status==='done').length, faulted:perNode.filter(p=>p.status==='fault').length, skipped:perNode.filter(p=>p.status==='skipped').length, perNode}; break;
      }
      case 'get_node_output': {
        const last=Array.from(executionLogs.values()).pop() || cache.get(CACHE_KEYS.executionDetails(workflow.id));
        if(!last) { result={success:false, error:'No execution yet'}; break; }
        let rid=input?.nodeId; if(!rid || !last.outputs[rid]) { if(input?.label){ const cands=Object.keys(last.outputs).filter(id=> String(workflow.nodes.find(n=>n.id===id)?.label||'').toLowerCase().includes(String(input.label).toLowerCase())); if(cands.length===1) rid=cands[0]; else if(cands.length>1) { result={success:false, error:`Label matches ${cands.length}`}; break; } } }
        if(!rid || !last.outputs[rid]) { result={success:false, error:`No output for ${rid||input?.label}`}; break; }
        result={success:true, nodeId:rid, label:workflow.nodes.find(n=>n.id===rid)?.label, status:last.status[rid], output:last.outputs[rid]}; break;
      }
      case 'get_canvas_snapshot': {
        const last=Array.from(executionLogs.values()).pop(); const status=last?.status||{};
        const lines=workflow.nodes.map(n=>`${n.id} [${n.type}] "${n.label}" @(${Math.round(n.position?.x||0)},${Math.round(n.position?.y||0)}) status:${status[n.id]||'idle'} wires:[${workflow.edges.filter(e=>e.source===n.id||e.target===n.id).map(e=>e.source===n.id?`→${e.target}`:`${e.source}→`).join(',')||'—'}]`);
        result={success:true, nodeCount:workflow.nodes.length, edgeCount:workflow.edges.length, nodes:workflow.nodes.map(n=>({id:n.id,label:n.label,type:n.type,position:n.position,status:status[n.id]||'idle'})), edges:workflow.edges, textualMap:lines.join('\n'), lastExecution: last?{success:last.success,durationMs:last.durationMs,at:last.executedAt}:null}; break;
      }
      case 'probe_api': {
        const parsed=probeApiSchema.safeParse(input||{}); if(!parsed.success) { const issues3=(parsed.error.issues||parsed.error.errors||[]); result={success:false, error: issues3.map(e=>e.message).join(', ') || parsed.error.message}; break; }
        const {url, method, headers, body, timeoutMs}=parsed.data;
        try { const res=await fetch(url, { method, headers, body: body||undefined, signal:AbortSignal.timeout(timeoutMs)}); const text=await res.text(); let preview=text.slice(0,3000); try{ const j=JSON.parse(text); preview=JSON.stringify(j,null,2).slice(0,3000); }catch{} result={success:res.ok,status:res.status,statusText:res.statusText,ok:res.ok, bodyPreview: preview.slice(0,2000), bodyLength:text.length, truncated:text.length>3000, hint: res.ok? 'API works' : `HTTP ${res.status}`}; } catch(e){ result={success:false, error:e.name==='TimeoutError'?`Timeout after ${timeoutMs}ms`:e.message}}; break;
      }
      case 'undo_last_action': {
        if(mutationHistory.length===0) { result={success:false, error:'Nothing to undo'}; break; }
        const prev=mutationHistory.pop(); redoStack.push({ nodes: JSON.parse(JSON.stringify(workflow.nodes)), edges: JSON.parse(JSON.stringify(workflow.edges)), label:`redo:${prev.label}`, at:new Date().toISOString()});
        workflow.nodes=prev.nodes; workflow.edges=prev.edges; workflow.updatedAt=new Date().toISOString(); nodeIndex.clear(); edgeIndex.clear(); workflow.nodes.forEach(n=>nodeIndex.set(n.id,workflow.id)); workflow.edges.forEach(e=>edgeIndex.set(e.id,workflow.id)); invalidateCache(workflow.id); persistWorkflows();
        result={success:true, restoredLabel:prev.label, at:prev.at, nodes:prev.nodes.length, edges:prev.edges.length}; break;
      }
      case 'redo_last_action': {
        if(redoStack.length===0) { result={success:false, error:'Nothing to redo'}; break; }
        const next=redoStack.pop(); mutationHistory.push({ nodes:JSON.parse(JSON.stringify(workflow.nodes)), edges:JSON.parse(JSON.stringify(workflow.edges)), label:`undo:${next.label}`, at:new Date().toISOString()});
        workflow.nodes=next.nodes; workflow.edges=next.edges; workflow.updatedAt=new Date().toISOString(); nodeIndex.clear(); edgeIndex.clear(); workflow.nodes.forEach(n=>nodeIndex.set(n.id,workflow.id)); workflow.edges.forEach(e=>edgeIndex.set(e.id,workflow.id)); invalidateCache(workflow.id); persistWorkflows();
        result={success:true, restoredLabel:next.label, nodes:next.nodes.length, edges:next.edges.length}; break;
      }
      case 'get_undo_history': {
        result={success:true, undoCount:mutationHistory.length, redoCount:redoStack.length, history:mutationHistory.map(h=>({label:h.label,at:h.at,nodes:h.nodes.length,edges:h.edges.length})), redo:redoStack.map(h=>({label:h.label,at:h.at}))}; break;
      }
      case 'create_custom_node': {
        const { type, displayName, description, color, icon, fields, code } = input;
        if (!code) { result={success:false, error:'code required'}; break; }
        try { validateCode(code); } catch(e){ result={success:false, error:e.message}; break; }
        let t = String(type || displayName || 'custom_node').toLowerCase().replace(/[^a-z0-9_]/g,'_').replace(/__+/g,'_').replace(/^_+|_+$/g,'');
        if (!t.startsWith('custom_')) t = `custom_${t}`;
        if (t.length>32) t=t.slice(0,32);
        if (ALL_NODE_TYPES.includes(t)) { result={success:false, error:`type ${t} conflicts with built-in`}; break; }
        const userId = req.userId || 'dev-anon';
        if (customNodesCache.find(n=>n.type===t && (n.user_id===userId || (!n.user_id && userId==='dev-anon')))) { result={success:false, error:`custom node ${t} already exists, use update_custom_node`}; break; }
        const def = { type:t, user_id: userId, displayName: String(displayName||t.replace('custom_','').replace(/_/g,' ')).slice(0,40), description: String(description||'Custom node').slice(0,120), color: color||'#a8d8a8', icon: icon||'CodeIcon', fields: Array.isArray(fields)? fields.slice(0,12): [], code, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        customNodesCache.push(def); saveCustomNodes();
        result={success:true, node:def, message:`Created custom node ${t}`}; break;
      }
      case 'list_custom_nodes': {
        const userId = req.userId || 'dev-anon';
        let nodes = customNodesCache;
        if (isSupabaseEnabled() && userId !== 'dev-anon') {
          nodes = nodes.filter(n=> !n.user_id || n.user_id === userId);
        }
        result={success:true, nodes, count: nodes.length}; break;
      }
      case 'delete_custom_node': {
        const t = String(input.type||'').toLowerCase();
        const userId = req.userId || 'dev-anon';
        const idx = customNodesCache.findIndex(n=>n.type===t && (n.user_id===userId || (!n.user_id && userId==='dev-anon') || !isSupabaseEnabled()));
        if (idx<0) { result={success:false, error:`not found ${t}`}; break; }
        const removed = customNodesCache.splice(idx,1)[0]; saveCustomNodes();
        result={success:true, deleted:removed.type}; break;
      }
      case 'update_custom_node': {
        const t = String(input.type||'').toLowerCase();
        const userId = req.userId || 'dev-anon';
        const def = customNodesCache.find(n=>n.type===t && (n.user_id===userId || (!n.user_id && userId==='dev-anon') || !isSupabaseEnabled()));
        if (!def) { result={success:false, error:`not found ${t}`}; break; }
        if (input.code) {
          try { validateCode(input.code); } catch(e){ result={success:false, error:e.message}; break; }
          def.code = input.code;
        }
        if (input.displayName) def.displayName = String(input.displayName).slice(0,40);
        if (input.description) def.description = String(input.description).slice(0,120);
        if (input.color) def.color = input.color;
        if (input.icon) def.icon = input.icon;
        if (Array.isArray(input.fields)) def.fields = input.fields.slice(0,12);
        def.updatedAt = new Date().toISOString();
        saveCustomNodes();
        result={success:true, node:def}; break;
      }
      default: result={success:false, error:`Unknown tool: ${tool}`};
    }
    res.json(result);
  } catch (err) {
    logger.error({ err: err.message, tool }, 'tool error');
    metrics.errors++;
    res.status(500).json({ success:false, error: err.message });
  }
});

// ---- Other Routes (P1: clean queries) ----
app.get('/api/workflow', (req, res) => {
  const workflow = createDefaultWorkflow(req.userId || 'dev-anon');
  const verbose = req.query.verbose === 'true';
  // P1: only send needed fields unless verbose
  const payload = verbose ? workflow : { id: workflow.id, nodeCount: workflow.nodes.length, edgeCount: workflow.edges.length, nodes: workflow.nodes.map(n=>({id:n.id,type:n.type,label:n.label,position:n.position})), edges: workflow.edges, updatedAt: workflow.updatedAt };
  res.json(payload);
});
app.get('/api/workflows', (req, res) => {
  // P1: paginated, light payload - per-user if auth enabled
  const page = Math.max(1, parseInt(req.query.page)||1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit)||20));
  const userId = req.userId || 'dev-anon';
  let all = Array.from(workflows.values());
  if (isSupabaseEnabled() && userId !== 'dev-anon') {
    all = all.filter(w=> w.userId === userId || w.user_id === userId || w.id === 'default' || w.id.startsWith(userId+':'));
  }
  const mapped = all.map(w=>({ id:w.id, name:w.name||w.id, nodeCount:w.nodes?.length||0, edgeCount:w.edges?.length||0, updatedAt:w.updatedAt }));
  mapped.sort((a,b)=> new Date(b.updatedAt)-new Date(a.updatedAt));
  const start=(page-1)*limit; res.json({ workflows: mapped.slice(start,start+limit), total: mapped.length, page, limit });
});
app.get('/api/health', (req, res) => {
  res.json({ status:'ok', tools: TOOL_DEFINITIONS.length, uptime: process.uptime(), workflows: workflows.size, cache: cache.getStats(), queue: { pending: backgroundQueue.length, ...queueMetrics } });
});
// P2: Prometheus-style metrics + JSON
app.get('/api/metrics', (req, res) => {
  const avg = metrics.durations.length ? Math.round(metrics.durations.reduce((a,b)=>a+b,0)/metrics.durations.length) : 0;
  const p95 = metrics.durations.length ? [...metrics.durations].sort((a,b)=>a-b)[Math.floor(metrics.durations.length*0.95)]||0 : 0;
  const data = {
    requests: metrics.requests,
    errors: metrics.errors,
    uptimeSec: Math.round(process.uptime()),
    avgDurationMs: avg,
    p95DurationMs: p95,
    toolCalls: metrics.toolCalls,
    workflows: workflows.size,
    executionLogs: executionLogs.size,
    cacheKeys: cache.keys().length,
    cacheStats: cache.getStats(),
    queue: { pending: backgroundQueue.length, ...queueMetrics },
    memory: process.memoryUsage(),
  };
  if (req.headers.accept?.includes('text/plain')) {
    let out=''; out+=`agentflow_requests ${data.requests}\n`; out+=`agentflow_errors ${data.errors}\n`; out+=`agentflow_avg_duration_ms ${avg}\n`; for(const [k,v] of Object.entries(data.toolCalls)) out+=`agentflow_tool_calls{name="${k}"} ${v}\n`; res.type('text/plain').send(out);
  } else res.json(data);
});
app.get('/api/stats', (req,res)=>{
  const execs=Array.from(executionLogs.values()); const success=execs.filter(e=>e.success).length;
  res.json({ workflows: workflows.size, executions: execs.length, successRate: execs.length? Math.round(success/execs.length*100):0, avgDurationMs: execs.length? Math.round(execs.reduce((s,e)=>s+(e.durationMs||0),0)/execs.length):0, timestamp: new Date().toISOString() });
});

// Cache stats for debugging
app.get('/api/cache/stats', (req,res)=> res.json(cache.getStats()));
app.delete('/api/cache', (req,res)=> { cache.flushAll(); res.json({ success:true, message:'Cache cleared' }); });

// Queue inspection (P2)
app.get('/api/queue', (req,res)=> res.json({ pending: backgroundQueue, metrics: queueMetrics }));
app.post('/api/queue/enqueue', (req,res)=>{
  const { type, payload } = req.body; if(!type) return res.status(400).json({error:'type required'});
  const job=enqueueJob(type, payload||{}); res.json({success:true, job});
});

// Custom nodes REST (sync with frontend localStorage)
app.get('/api/custom-nodes', (req,res)=> {
  const userId = req.userId || 'dev-anon';
  let nodes = customNodesCache;
  if (isSupabaseEnabled() && userId !== 'dev-anon') {
    nodes = nodes.filter(n=> !n.user_id || n.user_id === userId);
  }
  res.json({success:true, nodes, count: nodes.length});
});
app.post('/api/custom-nodes', (req,res)=>{
  const { nodes, type, displayName, description, color, icon, fields, code } = req.body;
  if (Array.isArray(nodes)) {
    const userId = req.userId || 'dev-anon';
    if (isSupabaseEnabled() && userId !== 'dev-anon') {
      const other = customNodesCache.filter(n=> n.user_id && n.user_id !== userId);
      const withUser = nodes.map(n=> ({...n, user_id: userId}));
      customNodesCache = [...other, ...withUser];
    } else {
      customNodesCache = nodes;
    }
    saveCustomNodes();
    return res.json({success:true, count: customNodesCache.length, nodes: customNodesCache});
  }
  if (code) {
    let t = String(type || displayName || 'custom_node').toLowerCase().replace(/[^a-z0-9_]/g,'_').replace(/__+/g,'_').replace(/^_+|_+$/g,'');
    if (!t.startsWith('custom_')) t = `custom_${t}`;
    if (t.length>32) t=t.slice(0,32);
    if (ALL_NODE_TYPES.includes(t)) return res.status(400).json({success:false, error:`type ${t} conflicts with built-in`});
    const userId = req.userId || 'dev-anon';
    if (customNodesCache.find(n=>n.type===t && (n.user_id===userId || (!n.user_id && userId==='dev-anon')))) return res.status(400).json({success:false, error:`custom node ${t} already exists`});
    try { validateCode(code); } catch(e){ return res.status(400).json({success:false, error:e.message}); }
    const def = { type:t, user_id: userId, displayName: String(displayName||t.replace('custom_','').replace(/_/g,' ')).slice(0,40), description: String(description||'Custom node').slice(0,120), color: color||'#a8d8a8', icon: icon||'CodeIcon', fields: Array.isArray(fields)? fields.slice(0,12): [], code, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    customNodesCache.push(def); saveCustomNodes();
    return res.json({success:true, node:def});
  }
  res.status(400).json({success:false, error:'nodes array or code required'});
});
app.delete('/api/custom-nodes/:type', (req,res)=>{
  const t = String(req.params.type||'').toLowerCase();
  const userId = req.userId || 'dev-anon';
  const idx = customNodesCache.findIndex(n=> n.type===t && (n.user_id===userId || (!n.user_id && userId==='dev-anon') || !isSupabaseEnabled()));
  if (idx<0) return res.status(404).json({success:false, error:`not found ${t}`});
  const removed = customNodesCache.splice(idx,1)[0]; saveCustomNodes();
  res.json({success:true, deleted:removed.type});
});

// Error handler
app.use((err, req, res, next) => {
  logger.error({ err: err.message, stack: err.stack }, 'unhandled error');
  res.status(500).json({ success:false, error: 'Internal server error' });
});

// SPA fallback — Express 5 uses /*splat instead of *
app.get('/*splat', (req, res) => {
  const p = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  if (fs.existsSync(p)) res.sendFile(p); else res.status(404).json({ error: 'Not found, frontend not built' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  logger.info(`AgentFlow backend running on port ${PORT} with ${TOOL_DEFINITIONS.length} tools | cache TTL 30s | rateLimit 200/min | compression gzip`);
});
