// AgentFlow execution engine — runs workflows for real, in the browser.

export type NodeStatus = 'idle' | 'running' | 'done' | 'fault' | 'skipped';

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  config?: any;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface ExecEvent {
  id: string;
  status: NodeStatus;
  result?: any;
  error?: string;
  note?: string;
}

export interface ExecResult {
  success: boolean;
  executedAt: string;
  durationMs: number;
  order: string[];
  status: Record<string, NodeStatus>;
  outputs: Record<string, any>;
}

export interface ExecuteOptions {
  input?: any;
  onEvent?: (e: ExecEvent) => void;
}

// ---- shared mappers -------------------------------------------------------

export function toEngineNodes(nodes: any[]): WorkflowNode[] {
  return nodes.map((n) => ({
    id: n.id,
    type: (n.data?.nodeType as string) || (n.type === 'startNode' ? 'start' : 'api_call'),
    label: (n.data?.label as string) || 'untitled',
    config: n.data?.config || {},
  }));
}

export function toEngineEdges(edges: any[]): WorkflowEdge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: (e.label as string) || '',
  }));
}

// ---- helpers --------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

function getPath(obj: any, path: string): any {
  return path
    .split('.')
    .filter(Boolean)
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function parseMaybeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---- node runners ---------------------------------------------------------

async function runApiCall(cfg: any, input: any): Promise<any> {
  const url: string | undefined = cfg?.url;
  if (!url) throw new Error('no URL configured — click the module to set one');

  const method = String(cfg?.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { ...(cfg?.headers || {}) };

  let body: string | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    const raw = cfg?.body ?? (method !== 'GET' ? input : undefined);
    if (raw !== undefined && raw !== null && raw !== '') {
      body = typeof raw === 'string' ? raw : JSON.stringify(raw);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
  }

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  const parsed = parseMaybeJson(text);

  if (!res.ok) throw new Error(`HTTP ${res.status} — ${String(text).slice(0, 160)}`);
  return parsed;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as typeof Function;

async function runTransform(data: any, cfg: any): Promise<any> {
  const op = cfg?.op || 'passthrough';
  switch (op) {
    case 'pick': {
      const keys = String(cfg?.keys || '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      const out: Record<string, any> = {};
      for (const k of keys) out[k] = getPath(data, k);
      return out;
    }
    case 'count':
      return Array.isArray(data)
        ? { count: data.length }
        : { count: Object.keys(data ?? {}).length };
    case 'first':
      return Array.isArray(data) ? data[0] : data;
    case 'expression': {
      if (!cfg?.expression) throw new Error('no expression set');
      // Support both sync and async expressions: `async (data) => ...` or `(data) => ...`
      const expr = String(cfg.expression).trim();
      // If expression looks like a function, call it; otherwise evaluate as JS body with `data` in scope.
      // We use AsyncFunction so `await` inside works (e.g. `async (data) => await fetch(...)`)
      const fn = new AsyncFunction('data', `"use strict"; return (${expr})(data);`);
      return await fn(data);
    }
    default:
      return data;
  }
}

async function evalCondition(data: any, cfg: any): Promise<boolean> {
  if (cfg?.expression) {
    const fn = new AsyncFunction('data', `"use strict"; return Boolean(await (${cfg.expression})(data));`);
    return await fn(data);
  }
  if (cfg?.path !== undefined && cfg?.path !== '') {
    const actual = getPath(data, cfg.path);
    return actual === (cfg.equals === undefined ? true : cfg.equals);
  }
  return true;
}

async function runOutput(data: any, cfg: any): Promise<any> {
  const kind = cfg?.kind || 'console';

  if (kind === 'console') {
    console.log('[AgentFlow output]', data);
    return { delivered: 'console' };
  }

  if (kind === 'download') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${cfg?.filename || 'flow-output'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { delivered: 'download', filename: a.download };
  }

  if (kind === 'webhook') {
    const url = cfg?.url;
    if (!url) throw new Error('no webhook URL configured');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`webhook responded HTTP ${res.status}`);
    return { delivered: 'webhook', status: res.status };
  }

  throw new Error(`unknown output kind: ${kind}`);
}

async function runFilter(data: any, cfg: any): Promise<any> {
  const expr = cfg?.expression;
  if (!expr) throw new Error('filter requires an expression');
  const fn = new AsyncFunction('data', `"use strict"; return Boolean(await (${expr})(data));`);
  const pass = await fn(data);
  return { passed: pass, data };
}

function runSplit(data: any, cfg: any): any {
  if (Array.isArray(data)) {
    const batchSize = Number(cfg?.batchSize ?? 1);
    const batches: any[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return { batches, count: batches.length };
  }
  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    return { items: keys.map((k) => ({ key: k, value: data[k] })), count: keys.length };
  }
  return { items: [data], count: 1 };
}

function runMerge(data: any, _cfg: any): any {
  if (Array.isArray(data)) {
    return data.reduce((acc, item) => {
      if (Array.isArray(item)) return acc.concat(item);
      if (typeof item === 'object' && item !== null) return { ...acc, ...item };
      return acc;
    }, {});
  }
  return data;
}

function runLoop(data: any, cfg: any): any {
  const items = Array.isArray(data) ? data : data?.items || data?.batches || [data];
  const maxIter = Number(cfg?.maxIterations ?? 10);
  const results: any[] = [];
  const count = Math.min(items.length, maxIter);
  for (let i = 0; i < count; i++) {
    results.push({ index: i, value: items[i] });
  }
  return { iterations: results, total: items.length };
}

async function runCode(data: any, cfg: any): Promise<any> {
  const code = cfg?.code || cfg?.expression;
  if (!code) throw new Error('code node requires a code expression');
  // Use AsyncFunction so top-level await and `return await fetch(...)` work.
  // Supports 3 patterns:
  // 1) `return data.foo;`
  // 2) `return await fetch(data.url).then(r=>r.json())`
  // 3) `const res = await fetch(...); return res.json();` (no wrapper needed)
  // We also support user writing an IIFE: `return (async () => { ... })()` still works.
  const fn = new AsyncFunction('data', `"use strict"; ${code}`);
  return await fn(data);
}

async function runWebhook(data: any, cfg: any): Promise<any> {
  const url = cfg?.url;
  if (!url) throw new Error('webhook requires a URL');
  const method = String(cfg?.method || 'POST').toUpperCase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(cfg?.headers || {}) };
  const res = await fetch(url, { method, headers, body: JSON.stringify(data) });
  const text = await res.text();
  const parsed = parseMaybeJson(text);
  if (!res.ok) throw new Error(`webhook responded HTTP ${res.status}`);
  return { status: res.status, data: parsed };
}

async function runAi(data: any, cfg: any): Promise<any> {
  const prompt = cfg?.prompt || 'Summarize the input data';
  const model = cfg?.model || 'gpt-3.5-turbo';
  const apiKey = cfg?.apiKey;
  if (!apiKey) {
    // Fallback: just echo the prompt with data context
    return { model, prompt, response: `[AI] Prompt: ${prompt} | Data: ${JSON.stringify(data).slice(0, 200)}`, note: 'No API key — simulated' };
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant in a data workflow.' },
        { role: 'user', content: `${prompt}\n\nInput data:\n${JSON.stringify(data, null, 2)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI API error: ${res.status}`);
  const json = await res.json();
  return { model, response: json.choices?.[0]?.message?.content || 'no response' };
}

async function runValidator(data: any, cfg: any): Promise<any> {
  const rules = cfg?.rules || cfg?.expression;
  if (rules) {
    const fn = new AsyncFunction('data', `"use strict"; return await (${rules})(data);`);
    const valid = await fn(data);
    return { valid: Boolean(valid), data };
  }
  // Default: check data is truthy and not empty
  const valid = data !== null && data !== undefined && data !== '' &&
    !(Array.isArray(data) && data.length === 0) &&
    !(typeof data === 'object' && Object.keys(data).length === 0);
  return { valid, data };
}

function runLogger(data: any, cfg: any): any {
  const level = cfg?.level || 'info';
  const msg = cfg?.message || '';
  const entry = { level, message: msg, data, timestamp: new Date().toISOString() };
  if (level === 'error') console.error('[AgentFlow]', msg, data);
  else if (level === 'warn') console.warn('[AgentFlow]', msg, data);
  else console.log('[AgentFlow]', msg, data);
  return entry;
}

async function runFile(data: any, cfg: any): Promise<any> {
  const operation = cfg?.operation || 'read';
  const path = cfg?.path || 'output.json';

  if (operation === 'write') {
    // In-browser: trigger download
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = path;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return { operation: 'write', path, bytes: content.length };
  }

  // read: return the data as-is (can't read local files in browser)
  return { operation: 'read', path, data };
}

// ---- executor -------------------------------------------------------------

function topologicalOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const adj: Record<string, string[]> = {};
  const indeg: Record<string, number> = {};
  nodes.forEach((n) => {
    adj[n.id] = [];
    indeg[n.id] = 0;
  });
  edges.forEach((e) => {
    if (adj[e.source] && indeg[e.target] !== undefined) {
      adj[e.source].push(e.target);
      indeg[e.target] += 1;
    }
  });
  const queue = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const nb of adj[cur]) {
      indeg[nb] -= 1;
      if (indeg[nb] === 0) queue.push(nb);
    }
  }
  // cycle leftovers still appear so users see them fault rather than vanish
  nodes.forEach((n) => {
    if (!order.includes(n.id)) order.push(n.id);
  });
  return order;
}

export async function executeWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  opts: ExecuteOptions = {}
): Promise<ExecResult> {
  const t0 = performance.now();
  const onEvent = opts.onEvent || (() => {});
  const statusMap: Record<string, NodeStatus> = {};
  const outputs: Record<string, any> = {};
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let lastCondition: boolean | null = null;
  let hadError = false;

  const order = topologicalOrder(nodes, edges);

  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;

    // --- gating: upstream faults/skips + labeled condition branches ---
    const incoming = edges.filter((e) => e.target === id);
    let blocked: string | null = null;
    for (const e of incoming) {
      if (hadError && statusMap[e.source] === 'fault') {
        blocked = `upstream "${e.source}" faulted`;
        break;
      }
      if (statusMap[e.source] === 'skipped') {
        blocked = `upstream "${e.source}" was skipped`;
        break;
      }
      const lbl = (e.label || '').trim().toLowerCase();
      if ((lbl === 'true' || lbl === 'false') && lastCondition !== null) {
        if ((lbl === 'true') !== lastCondition) {
          blocked = `branch took "${lastCondition ? 'true' : 'false'}", this wire says "${lbl}"`;
          break;
        }
      }
    }

    if (blocked) {
      statusMap[id] = 'skipped';
      outputs[id] = { skipped: true, reason: blocked };
      onEvent({ id, status: 'skipped', note: blocked });
      continue;
    }

    // --- run ---
    onEvent({ id, status: 'running' });

    try {
      let result: any;
      const upstreamData = incoming.length
        ? outputs[incoming[incoming.length - 1].source]
        : undefined;
      const data =
        upstreamData !== undefined ? upstreamData : node.type === 'start' ? opts.input ?? {} : {};

      switch (node.type) {
        case 'start':
          result = opts.input ?? {};
          break;
        case 'api_call':
          result = await runApiCall(node.config, data);
          break;
        case 'transform':
          result = await runTransform(data, node.config);
          break;
        case 'condition': {
          const passed = await evalCondition(data, node.config);
          lastCondition = passed;
          result = { passed, checked: node.label };
          break;
        }
        case 'delay':
          await sleep(Number(node.config?.ms ?? 1000));
          result = { waitedMs: Number(node.config?.ms ?? 1000) };
          break;
        case 'output':
          result = await runOutput(data, node.config);
          break;
        case 'filter':
          result = await runFilter(data, node.config);
          break;
        case 'split':
          result = runSplit(data, node.config);
          break;
        case 'merge':
          result = runMerge(data, node.config);
          break;
        case 'loop':
          result = runLoop(data, node.config);
          break;
        case 'code':
          result = await runCode(data, node.config);
          break;
        case 'webhook':
          result = await runWebhook(data, node.config);
          break;
        case 'ai':
          result = await runAi(data, node.config);
          break;
        case 'validator':
          result = await runValidator(data, node.config);
          break;
        case 'logger':
          result = runLogger(data, node.config);
          break;
        case 'file':
          result = await runFile(data, node.config);
          break;
        default:
          throw new Error(`unknown module type: ${node.type}`);
      }

      statusMap[id] = 'done';
      outputs[id] = result;
      onEvent({ id, status: 'done', result });
    } catch (err: any) {
      hadError = true;
      const stack = err?.stack ? String(err.stack).slice(0, 1200) : undefined;
      statusMap[id] = 'fault';
      outputs[id] = { error: err?.message || String(err), stack, name: err?.name || 'Error', nodeType: node.type };
      onEvent({ id, status: 'fault', error: err?.message || String(err) });
    }
  }

  return {
    success: !hadError,
    executedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - t0),
    order,
    status: statusMap,
    outputs,
  };
}
