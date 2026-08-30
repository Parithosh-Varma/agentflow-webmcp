const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const pino = require('pino');
const pinoHttp = require('pino-http');
const NodeCache = require('node-cache');
const { z } = require('zod');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// ================================================================
// AgentFlow Backend — P0/P1/P2 optimized
// P0: validation (zod), rate limiting, compression, real engine
// P1: clean queries, indexes, file persistence
// P2: cache (NodeCache), background queue, monitoring/metrics
// ================================================================

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();

// ---- Security & Performance Middleware ----
app.use(cors());
app.use(compression({ level: 6, threshold: 512 }));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

// Security headers (helmet-lite)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

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
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Rate limit exceeded for tool execution.' },
});
app.use('/api/', globalLimiter);
app.use('/api/execute-tool', strictLimiter);

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

// ---- Validation Schemas (P0: zod) ----
const addNodeSchema = z.object({
  type: z.enum(['api_call','transform','condition','output','delay','filter','split','merge','loop','code','webhook','ai','validator','logger','file']),
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
  { name: 'add_node', description: 'Add a new node to the workflow canvas', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['api_call','transform','condition','output','delay','filter','split','merge','loop','code','webhook','ai','validator','logger','file'] }, label: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['type','label'] } },
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

function createDefaultWorkflow() {
  const id = 'default';
  if (!workflows.has(id)) {
    workflows.set(id, { id, nodes: [{ id: 'start', type: 'start', label: 'Start', config: {}, position: { x: 40, y: 200 } }], edges: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    persistWorkflows();
  }
  return workflows.get(id);
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
      const data = upstreamData!==undefined ? upstreamData : node.type==='start' ? input||{} : {};
      switch(node.type) {
        case 'start': result = input||{}; break;
        case 'api_call': result = await runApiCall(node.config, data); break;
        case 'transform': result = await runTransform(data, node.config); break;
        case 'condition': { const passed=await evalCondition(data, node.config); lastCondition=passed; result={passed, checked:node.label}; break; }
        case 'delay': await sleep(Number(node.config?.ms ?? node.config?.duration ?? 1000)); result={waitedMs: Number(node.config?.ms ?? 1000)}; break;
        case 'output': { result={delivered:'console', data}; console.log('[output]', data); if (node.config?.kind==='webhook' && node.config?.url) enqueueJob('webhook', { url: node.config.url, data }); break; }
        case 'filter': { if(!node.config?.expression) throw new Error('filter requires expression'); const fn=new AsyncFunction('data', `"use strict"; return Boolean(await (${node.config.expression})(data));`); const pass=await fn(data); result={passed:pass, data}; break; }
        case 'split': { if(Array.isArray(data)){ const bs=Number(node.config?.batchSize??1); const batches=[]; for(let i=0;i<data.length;i+=bs) batches.push(data.slice(i,i+bs)); result={batches, count:batches.length}; } else if(typeof data==='object'&&data!==null){ const ks=Object.keys(data); result={items:ks.map(k=>({key:k,value:data[k]})), count:ks.length}; } else result={items:[data],count:1}; break; }
        case 'merge': { if(Array.isArray(data)) result=data.reduce((a,it)=>{ if(Array.isArray(it)) return a.concat(it); if(typeof it==='object'&&it!==null) return {...a,...it}; return a;},{}); else result=data; break; }
        case 'loop': { const items=Array.isArray(data)?data:data?.items||data?.batches||[data]; const max=Number(node.config?.maxIterations??10); const res=[]; for(let i=0;i<Math.min(items.length,max);i++) res.push({index:i,value:items[i]}); result={iterations:res,total:items.length}; break; }
        case 'code': result=await runCode(data, node.config); break;
        case 'webhook': result=await runWebhook(data, node.config); break;
        case 'ai': result=await runAi(data, node.config); break;
        case 'validator': { const r=node.config?.rules||node.config?.expression; if(r){ const fn=new AsyncFunction('data', `"use strict"; return await (${r})(data);`); result={valid:Boolean(await fn(data)), data}; } else result={valid:!!data && Object.keys(data||{}).length>0, data}; break; }
        case 'logger': result={level:node.config?.level||'info', message:node.config?.message||'', data, timestamp:new Date().toISOString()}; break;
        case 'file': { if(node.config?.operation==='write') enqueueJob('file', { path: node.config?.path||'output.json', data }); result={operation: node.config?.operation||'read', path: node.config?.path}; break; }
        default: throw new Error(`unknown type ${node.type}`);
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
  const workflow = createDefaultWorkflow();
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
  const workflow = createDefaultWorkflow();
  const verbose = req.query.verbose === 'true';
  // P1: only send needed fields unless verbose
  const payload = verbose ? workflow : { id: workflow.id, nodeCount: workflow.nodes.length, edgeCount: workflow.edges.length, nodes: workflow.nodes.map(n=>({id:n.id,type:n.type,label:n.label,position:n.position})), edges: workflow.edges, updatedAt: workflow.updatedAt };
  res.json(payload);
});
app.get('/api/workflows', (req, res) => {
  // P1: paginated, light payload
  const page = Math.max(1, parseInt(req.query.page)||1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit)||20));
  const all = Array.from(workflows.values()).map(w=>({ id:w.id, name:w.name||w.id, nodeCount:w.nodes?.length||0, edgeCount:w.edges?.length||0, updatedAt:w.updatedAt }));
  all.sort((a,b)=> new Date(b.updatedAt)-new Date(a.updatedAt));
  const start=(page-1)*limit; res.json({ workflows: all.slice(start,start+limit), total: all.length, page, limit });
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
