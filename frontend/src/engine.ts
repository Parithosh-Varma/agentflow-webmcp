// AgentFlow execution engine — runs workflows for real, in the browser.

import { v4 as uuidv4 } from 'uuid';

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

export function findDuplicateIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dups.add(id);
    else seen.add(id);
  }
  return Array.from(dups);
}

export function hasCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    const list = adj.get(e.source) ?? [];
    list.push(e.target);
    adj.set(e.source, list);
  }
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const dfs = (v: string): boolean => {
    if (recStack.has(v)) return true;
    if (visited.has(v)) return false;
    visited.add(v);
    recStack.add(v);
    for (const nb of adj.get(v) ?? []) {
      if (dfs(nb)) return true;
    }
    recStack.delete(v);
    return false;
  };
  for (const n of nodes) {
    if (dfs(n.id)) return true;
  }
  return false;
}

export function remapWorkflowIds(nodes: any[], edges: any[]): { nodes: any[]; edges: any[] } {
  const idMap = new Map<string, string>();
  const remappedNodes = nodes.map((n) => {
    const newId = `node_${uuidv4().slice(0, 8)}`;
    idMap.set(n.id, newId);
    const copy = { ...n, id: newId };
    // preserve position and other fields; ensure data object id consistency if needed
    if (copy.data && typeof copy.data === 'object') {
      copy.data = { ...copy.data };
    }
    return copy;
  });
  const remappedEdges = edges.map((e) => {
    const newId = `edge_${uuidv4().slice(0, 8)}`;
    const newSource = idMap.get(e.source) ?? e.source;
    const newTarget = idMap.get(e.target) ?? e.target;
    return { ...e, id: newId, source: newSource, target: newTarget };
  });
  return { nodes: remappedNodes, edges: remappedEdges };
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

// SECURITY: block private/loopback/link-local targets for browser-side fetches.
// Prevents intranet scanning via api_call/webhook/graphql/probe_api.
export function assertSafeUrl(raw: string): string {
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

const BLOCKED_CODE = [/require\s*\(/, /process\s*[./\[]/, /child_process/, /\bfs\s*[./\[]/, /eval\s*\(/, /Function\s*\(/, /AsyncFunction/, /constructor\s*\(/, /__proto__/, /prototype\s*\./, /globalThis/, /localStorage|sessionStorage|indexedDB/, /document\s*\./, /window\s*\./, /navigator\s*\./, /import\s*\(/, /fetch\s*\(/, /XMLHttpRequest|WebSocket|EventSource/];
export function validateUserCode(code: string): void {
  if (typeof code !== 'string' || code.length > 10000) throw new Error('code too large (max 10KB)');
  for (const pat of BLOCKED_CODE) if (pat.test(code)) throw new Error(`blocked pattern: ${pat}`);
}
async function runUserFn<T>(code: string, argNames: string[], args: any[], timeoutMs = 3000): Promise<T> {
  validateUserCode(code);
  const fn = new AsyncFunction(...argNames, `"use strict"; ${code}`);
  return await Promise.race([
    (fn as any)(...args),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

// ---- node runners ---------------------------------------------------------

async function runApiCall(cfg: any, input: any): Promise<any> {
  const url: string | undefined = cfg?.url;
  if (!url) throw new Error('no URL configured — click the module to set one');
  assertSafeUrl(url);

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
      const expr = String(cfg.expression).trim();
      validateUserCode(expr);
      try {
        const fn = new AsyncFunction('data', `"use strict"; return (${expr})(data);`);
        return await fn(data);
      } catch (e) {
        if (e instanceof TypeError) {
          validateUserCode(String(expr));
          const fn2 = new AsyncFunction('data', `"use strict"; return ${expr};`);
          return await fn2(data);
        }
        throw e;
      }
    }
    default:
      return data;
  }
}

async function evalCondition(data: any, cfg: any): Promise<boolean> {
  if (cfg?.expression) {
    try {
      validateUserCode(String(cfg.expression));
      const fn = new AsyncFunction('data', `"use strict"; return Boolean(await (${cfg.expression})(data));`);
      return await fn(data);
    } catch (e) {
      if (e instanceof TypeError) {
        validateUserCode(String(cfg.expression));
          const fn2 = new AsyncFunction('data', `"use strict"; return Boolean(${cfg.expression});`);
        return await fn2(data);
      }
      throw e;
    }
  }
  if (cfg?.path !== undefined && cfg?.path !== '') {
    const actual = getPath(data, cfg.path);
    if (cfg.equals === undefined) return true;
    return actual == cfg.equals || String(actual) === String(cfg.equals);
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
    assertSafeUrl(url);
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
  validateUserCode(String(expr));
  try {
    const fn = new AsyncFunction('data', `"use strict"; return Boolean(await (${expr})(data));`);
    const pass = await fn(data);
    return { passed: pass, data };
  } catch (e) {
    if (e instanceof TypeError) {
      validateUserCode(String(expr));
      const fn2 = new AsyncFunction('data', `"use strict"; return Boolean(${expr});`);
      const pass = await fn2(data);
      return { passed: pass, data };
    }
    throw e;
  }
}

function runSplit(data: any, cfg: any): any {
  if (Array.isArray(data)) {
    const batchSize = Math.max(1, Math.floor(Number(cfg?.batchSize ?? 1) || 1));
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
      if (Array.isArray(item)) {
        const base = Array.isArray(acc) ? acc : [];
        return [...base, ...item];
      }
      if (typeof item === 'object' && item !== null) {
        const base = typeof acc === 'object' && !Array.isArray(acc) ? acc : {};
        return { ...base, ...item };
      }
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
  validateUserCode(String(code));
  const fn = new AsyncFunction('data', `"use strict"; ${code}`);
  return await fn(data);
}

async function runWebhook(data: any, cfg: any): Promise<any> {
  const url = cfg?.url;
  if (!url) throw new Error('webhook requires a URL');
  assertSafeUrl(url);
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
    validateUserCode(String(rules));
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

// ---- n8n major nodes (Top 30 + apps) ----

async function runSchedule(_data: any, cfg: any): Promise<any> {
  const cron = cfg?.cron || cfg?.schedule || '*/5 * * * *';
  const intervalMs = cfg?.intervalMs ?? cfg?.ms ?? 0;
  if (intervalMs) await sleep(Number(intervalMs));
  return { scheduled: true, cron, nextRun: new Date(Date.now() + Number(intervalMs || 60000)).toISOString() };
}

async function runGraphQL(_data: any, cfg: any): Promise<any> {
  const url = cfg?.url || cfg?.endpoint;
  const query = cfg?.query || cfg?.graphql || '{ __typename }';
  const variables = cfg?.variables || {};
  const headers = cfg?.headers || {};
  if (!url) throw new Error('GraphQL requires url/endpoint');
  assertSafeUrl(url);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables: typeof variables === 'string' ? JSON.parse(variables) : variables }),
  });
  const text = await res.text();
  const parsed = parseMaybeJson(text);
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${String(text).slice(0, 400)}`);
  return parsed;
}

function runSet(data: any, cfg: any): any {
  const keepOnlySet = cfg?.keepOnlySet ?? cfg?.keepOnly ?? false;
  const fields = cfg?.fields || cfg?.set || cfg?.values || {};
  let parsedFields: Record<string, any> = {};
  if (typeof fields === 'string') {
    try { parsedFields = JSON.parse(fields); } catch { parsedFields = {}; }
  } else if (typeof fields === 'object') {
    parsedFields = fields;
  }
  // If no explicit fields, use all cfg keys except reserved
  if (Object.keys(parsedFields).length === 0) {
    const reserved = new Set(['keepOnlySet', 'keepOnly', 'fields', 'set', 'values']);
    for (const [k, v] of Object.entries(cfg)) {
      if (!reserved.has(k)) parsedFields[k] = v;
    }
  }
  const base = keepOnlySet ? {} : (typeof data === 'object' && data !== null ? { ...data } : {});
  for (const [k, v] of Object.entries(parsedFields)) {
    if (typeof v === 'string' && v.includes('{{')) {
      // simple mustache: {{ $json.foo }}
      base[k] = v.replace(/\{\{\s*\$json\.([\w.]+)\s*\}\}/g, (_m: string, p: string) => String(getPath(data, p) ?? ''));
    } else {
      base[k] = v;
    }
  }
  return base;
}

async function runSwitch(data: any, cfg: any): Promise<any> {
  const rules = cfg?.rules || cfg?.cases || cfg?.switch || [];
  const expression = cfg?.expression || cfg?.code;
  let matched: string | number = 'default';
  if (expression) {
    validateUserCode(String(expression));
    const fn = new AsyncFunction('data', `"use strict"; return await (${expression})(data);`);
    const res = await fn(data);
    matched = String(res);
  } else if (Array.isArray(rules) && rules.length) {
    for (const rule of rules) {
      const expr = rule.expression || rule.condition;
      if (expr) {
        validateUserCode(String(expr));
        const fn = new AsyncFunction('data', `"use strict"; return Boolean(await (${expr})(data));`);
        if (await fn(data)) { matched = rule.value ?? rule.case ?? 'true'; break; }
      }
    }
  } else if (cfg?.value !== undefined) {
    matched = String(cfg.value);
  }
  return { case: matched, data, matchedCase: matched };
}

function runAggregate(data: any, cfg: any): any {
  const field = cfg?.field || cfg?.groupBy || '';
  const operation = cfg?.operation || cfg?.aggregate || 'count';
  const items = Array.isArray(data) ? data : data?.items || data?.data || [data];
  if (operation === 'count') return { count: items.length, field, operation };
  if (operation === 'sum' && field) {
    const sum = items.reduce((s: number, it: any) => s + Number(getPath(it, field) ?? it[field] ?? 0), 0);
    return { sum, field, count: items.length };
  }
  if (operation === 'avg' && field) {
    const sum = items.reduce((s: number, it: any) => s + Number(getPath(it, field) ?? 0), 0);
    return { avg: items.length ? sum / items.length : 0, field, count: items.length };
  }
  // groupBy
  if (field) {
    const groups: Record<string, any[]> = {};
    for (const it of items) {
      const key = String(getPath(it, field) ?? it[field] ?? 'null');
      if (!groups[key]) groups[key] = [];
      groups[key].push(it);
    }
    return { groups, count: items.length, field };
  }
  return { count: items.length, items };
}

function runSort(data: any, cfg: any): any {
  const field = cfg?.field || cfg?.sortBy || '';
  const order = String(cfg?.order || cfg?.direction || 'asc').toLowerCase();
  const items = Array.isArray(data) ? [...data] : data?.items ? [...data.items] : [data];
  if (!field) {
    items.sort();
  } else {
    items.sort((a: any, b: any) => {
      const av = getPath(a, field) ?? a[field];
      const bv = getPath(b, field) ?? b[field];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return order === 'desc' ? -cmp : cmp;
    });
  }
  return { sorted: items, count: items.length, field, order };
}

function runLimit(data: any, cfg: any): any {
  const max = Number(cfg?.max ?? cfg?.limit ?? 10);
  const offset = Number(cfg?.offset ?? 0);
  const items = Array.isArray(data) ? data : data?.items || data?.data || [data];
  const sliced = items.slice(offset, offset + max);
  return { limited: sliced, count: sliced.length, total: items.length, offset, max };
}

function runItemLists(data: any, cfg: any): any {
  const operation = cfg?.operation || 'union';
  const a = Array.isArray(data) ? data : data?.a || data?.items || [data];
  const b = Array.isArray(cfg?.list) ? cfg.list : cfg?.b ? (Array.isArray(cfg.b) ? cfg.b : [cfg.b]) : [];
  if (operation === 'union') return { result: [...a, ...b], count: a.length + b.length };
  if (operation === 'intersect') {
    const setB = new Set(b.map((x: any) => JSON.stringify(x)));
    return { result: a.filter((x: any) => setB.has(JSON.stringify(x))), operation };
  }
  if (operation === 'difference') {
    const setB = new Set(b.map((x: any) => JSON.stringify(x)));
    return { result: a.filter((x: any) => !setB.has(JSON.stringify(x))), operation };
  }
  return { result: a, operation };
}

async function runFunction(data: any, cfg: any): Promise<any> {
  const code = cfg?.code || cfg?.functionCode || cfg?.expression || 'return data;';
  validateUserCode(String(code));
  const fn = new AsyncFunction('data', 'items', `"use strict"; ${code}`);
  const items = Array.isArray(data) ? data : [data];
  // n8n Function node signature: function(item) per item, we mimic
  if (cfg?.perItem) {
    const out = [];
    for (const it of items) out.push(await fn(it, items));
    return { results: out, count: out.length };
  }
  return await fn(data, items);
}

function runNoOp(data: any, _cfg: any): any {
  return data;
}

async function runWebhookResponse(data: any, cfg: any): Promise<any> {
  const status = Number(cfg?.status ?? 200);
  const body = cfg?.body ?? data;
  const headers = cfg?.headers || {};
  // In browser, can't actually respond to webhook, just simulate
  return { status, body: typeof body === 'string' ? body : JSON.stringify(body).slice(0, 2000), headers, simulated: true };
}

async function runHtml(data: any, cfg: any): Promise<any> {
  const operation = cfg?.operation || 'extract';
  const html = String(cfg?.html ?? data?.html ?? data ?? '');
  const selector = cfg?.selector || cfg?.css || '';
  const attribute = cfg?.attribute || 'textContent';
  if (operation === 'extract' && selector) {
    // In browser we can use DOMParser if available
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const nodes = doc.querySelectorAll(selector);
      const results = Array.from(nodes).map((el: any) => attribute === 'textContent' ? el.textContent : el.getAttribute(attribute));
      return { results, count: results.length, selector, attribute };
    } catch {
      return { html: html.slice(0, 2000), selector, note: 'DOMParser not available, returned raw' };
    }
  }
  return { html: html.slice(0, 5000), operation, selector };
}

function runDateTime(data: any, cfg: any): any {
  const operation = cfg?.operation || 'now';
  const input = cfg?.date ?? cfg?.value ?? data;
  const format = cfg?.format || 'iso';
  const parse = (v: any): Date => {
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string') { const d = new Date(v); if (!isNaN(d.getTime())) return d; }
    return new Date();
  };
  if (operation === 'now') return { now: new Date().toISOString(), timestamp: Date.now() };
  if (operation === 'format') {
    const d = parse(input);
    if (format === 'iso') return { formatted: d.toISOString(), input };
    if (format === 'locale') return { formatted: d.toLocaleString(), input };
    return { formatted: d.toISOString(), format, input };
  }
  if (operation === 'add') {
    const d = parse(input);
    const amount = Number(cfg?.amount ?? 1);
    const unit = cfg?.unit || 'days';
    const mul: Record<string, number> = { ms: 1, seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };
    return { result: new Date(d.getTime() + amount * (mul[unit] ?? 86400000)).toISOString(), operation, amount, unit };
  }
  return { result: parse(input).toISOString(), operation };
}

// ---- generic app runners (Slack, Discord, GitHub etc.) — HTTP wrappers ----
async function runGenericApp(app: string, data: any, cfg: any): Promise<any> {
  const url = cfg?.url || cfg?.webhookUrl || cfg?.endpoint;
  const method = String(cfg?.method || 'POST').toUpperCase();
  const headers = cfg?.headers || {};
  const body = cfg?.body ?? cfg?.payload ?? data;
  const simulatedNote = `simulated ${app} — configure url/webhookUrl to send for real`;
  if (!url) {
    // Simulate — log and return
    console.log(`[AgentFlow ${app} simulated]`, { data: String(JSON.stringify(data)).slice(0, 500), cfg });
    return { app, simulated: true, note: simulatedNote, dataPreview: String(JSON.stringify(data)).slice(0, 500), config: cfg };
  }
  assertSafeUrl(url);
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const parsed = parseMaybeJson(text);
  if (!res.ok) throw new Error(`${app} HTTP ${res.status}: ${String(text).slice(0, 400)}`);
  return { app, status: res.status, data: parsed, simulated: false };
}

async function runSlack(data: any, cfg: any): Promise<any> { return runGenericApp('slack', data, cfg); }
async function runDiscord(data: any, cfg: any): Promise<any> { return runGenericApp('discord', data, cfg); }
async function runGithub(data: any, cfg: any): Promise<any> { return runGenericApp('github', data, cfg); }
async function runGmail(data: any, cfg: any): Promise<any> { return runGenericApp('gmail', data, cfg); }
async function runGoogleSheets(data: any, cfg: any): Promise<any> { return runGenericApp('google_sheets', data, cfg); }
async function runNotion(data: any, cfg: any): Promise<any> { return runGenericApp('notion', data, cfg); }
async function runAirtable(data: any, cfg: any): Promise<any> { return runGenericApp('airtable', data, cfg); }
async function runPostgres(data: any, cfg: any): Promise<any> {
  const query = cfg?.query || cfg?.sql || 'SELECT 1';
  if (cfg?.url) return runGenericApp('postgres', data, { ...cfg, query });
  return { app: 'postgres', query, simulated: true, note: 'simulated — configure url to query real DB', rowCount: Array.isArray(data) ? data.length : 1 };
}
async function runMySQL(data: any, cfg: any): Promise<any> {
  const query = cfg?.query || cfg?.sql || 'SELECT 1';
  if (cfg?.url) return runGenericApp('mysql', data, { ...cfg, query });
  return { app: 'mysql', query, simulated: true, note: 'simulated — configure url' };
}
async function runMongoDB(data: any, cfg: any): Promise<any> {
  const operation = cfg?.operation || 'find';
  if (cfg?.url) return runGenericApp('mongodb', data, cfg);
  return { app: 'mongodb', operation, simulated: true, note: 'simulated — configure url' };
}
async function runRedis(data: any, cfg: any): Promise<any> {
  const operation = cfg?.operation || 'get';
  const key = cfg?.key || 'default';
  if (cfg?.url) return runGenericApp('redis', data, cfg);
  // In-browser simulate via localStorage like cache
  if (operation === 'set') {
    try { localStorage.setItem(`redis:${key}`, JSON.stringify(data)); } catch {}
    return { app: 'redis', operation, key, simulated: true };
  }
  if (operation === 'get') {
    try { const v = localStorage.getItem(`redis:${key}`); return { app: 'redis', operation, key, value: v ? JSON.parse(v) : null, simulated: true }; } catch { return { app: 'redis', operation, key, value: null }; }
  }
  return { app: 'redis', operation, key, simulated: true };
}
async function runStripe(data: any, cfg: any): Promise<any> { return runGenericApp('stripe', data, cfg); }
async function runShopify(data: any, cfg: any): Promise<any> { return runGenericApp('shopify', data, cfg); }
async function runAwsS3(data: any, cfg: any): Promise<any> { return runGenericApp('aws_s3', data, cfg); }

async function runOpenAI(data: any, cfg: any): Promise<any> {
  // Like runAi but for openai node specifically
  const prompt = cfg?.prompt || cfg?.message || 'Hello';
  const model = cfg?.model || 'gpt-4o-mini';
  const apiKey = cfg?.apiKey;
  if (!apiKey) return { app: 'openai', model, prompt, response: `[OpenAI simulated] ${prompt} | Data: ${String(JSON.stringify(data)).slice(0, 200)}`, note: 'No API key — simulated' };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: `${prompt}\n\nData:\n${JSON.stringify(data, null, 2)}` }] }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  return { app: 'openai', model, response: json.choices?.[0]?.message?.content || '', prompt };
}

function getCustomDef(type: string): any | undefined {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('agentflow_custom_nodes_v1');
      if (raw) {
        const arr = JSON.parse(raw);
        return (arr as any[]).find((n: any) => n.type === type);
      }
    }
  } catch {}
  return undefined;
}
async function runCustom(data: any, cfg: any, def: any): Promise<any> {
  const code = cfg.code || def.code;
  if (!code) throw new Error(`custom node ${def.type} missing code`);
  validateUserCode(String(code));
  const fn = new AsyncFunction('data', 'config', `"use strict"; ${code}`);
  return await fn(data, cfg);
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
  if (!nodes || nodes.length === 0) {
    return {
      success: false,
      executedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - t0),
      order: [],
      status: {},
      outputs: { error: 'No nodes in workflow' },
    };
  }
  const statusMap: Record<string, NodeStatus> = {};
  const outputs: Record<string, any> = {};
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const conditionResults: Record<string, boolean> = {};
  let hadError = false;

  if (hasCycle(nodes, edges)) {
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) {
      const list = adj.get(e.source) ?? [];
      list.push(e.target);
      adj.set(e.source, list);
    }
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const stack: string[] = [];
    const cycleIds = new Set<string>();
    const dfs = (v: string) => {
      visited.add(v);
      recStack.add(v);
      stack.push(v);
      for (const nb of adj.get(v) ?? []) {
        if (!visited.has(nb)) {
          dfs(nb);
        } else if (recStack.has(nb)) {
          const idx = stack.indexOf(nb);
          if (idx !== -1) {
            for (let i = idx; i < stack.length; i++) {
              cycleIds.add(stack[i]);
            }
          }
        }
      }
      recStack.delete(v);
      stack.pop();
    };
    for (const n of nodes) {
      if (!visited.has(n.id)) dfs(n.id);
    }
    for (const id of cycleIds) {
      statusMap[id] = 'fault';
      outputs[id] = { error: 'circular dependency detected' };
      onEvent({ id, status: 'fault', error: 'circular dependency detected' });
      hadError = true;
    }
  }

  const order = topologicalOrder(nodes, edges);

  for (const id of order) {
    const node = byId.get(id);
    if (!node) continue;
    if (statusMap[id] === 'fault') {
      continue;
    }

    // --- gating: upstream faults/skips + labeled condition branches ---
    const incoming = edges.filter((e) => e.target === id);
    let blocked: string | null = null;
    const activeIncoming: typeof incoming = [];
    for (const e of incoming) {
      const lbl = (e.label || '').trim().toLowerCase();
      if (lbl === 'true' || lbl === 'false') {
        const srcCond = conditionResults[e.source];
        if (srcCond !== undefined) {
          if ((lbl === 'true') !== srcCond) {
            continue;
          }
        }
      }
      activeIncoming.push(e);
      if (statusMap[e.source] === 'fault') {
        blocked = `upstream "${e.source}" faulted`;
        break;
      }
    }
    if (!blocked && activeIncoming.length > 0) {
      const allSkippedOrFault = activeIncoming.every(e => {
        const s = statusMap[e.source];
        return s === 'skipped' || s === 'fault';
      });
      const hasDone = activeIncoming.some(e => statusMap[e.source] === 'done');
      if (!hasDone && allSkippedOrFault) {
        blocked = activeIncoming.length === 1
          ? `upstream "${activeIncoming[0].source}" was skipped/faulted`
          : `all upstream inputs were skipped/faulted`;
      }
    }
    if (activeIncoming.length === 0 && incoming.length > 0) {
      blocked = 'no active inputs for conditional branch';
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
      const doneSources = activeIncoming.filter(e => statusMap[e.source] === 'done');
      const upstreamData = doneSources.length
        ? doneSources.map(e => outputs[e.source]).filter(v => v && !(v?.skipped))
        : incoming.length
          ? outputs[incoming[incoming.length - 1].source]
          : undefined;
      const data = upstreamData !== undefined
        ? Array.isArray(upstreamData) && upstreamData.length === 1 ? upstreamData[0] : upstreamData
        : opts.input ?? {};

      switch (node.type) {
        case 'start':
        case 'manual_trigger':
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
          conditionResults[id] = passed;
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
        case 'schedule':
          result = await runSchedule(data, node.config);
          break;
        case 'graphql':
          result = await runGraphQL(data, node.config);
          break;
        case 'set':
          result = runSet(data, node.config);
          break;
        case 'switch': {
          const sw = await runSwitch(data, node.config);
          // Store switch case for downstream label gating (like condition)
          (globalThis as any).__lastSwitchCase = sw.case;
          result = sw;
          break;
        }
        case 'aggregate':
          result = runAggregate(data, node.config);
          break;
        case 'sort':
          result = runSort(data, node.config);
          break;
        case 'limit':
          result = runLimit(data, node.config);
          break;
        case 'item_lists':
          result = runItemLists(data, node.config);
          break;
        case 'function':
          result = await runFunction(data, node.config);
          break;
        case 'noop':
          result = runNoOp(data, node.config);
          break;
        case 'webhook_response':
          result = await runWebhookResponse(data, node.config);
          break;
        case 'html':
          result = await runHtml(data, node.config);
          break;
        case 'date_time':
          result = runDateTime(data, node.config);
          break;
        case 'slack':
          result = await runSlack(data, node.config);
          break;
        case 'discord':
          result = await runDiscord(data, node.config);
          break;
        case 'github':
          result = await runGithub(data, node.config);
          break;
        case 'gmail':
          result = await runGmail(data, node.config);
          break;
        case 'google_sheets':
          result = await runGoogleSheets(data, node.config);
          break;
        case 'notion':
          result = await runNotion(data, node.config);
          break;
        case 'airtable':
          result = await runAirtable(data, node.config);
          break;
        case 'postgres':
          result = await runPostgres(data, node.config);
          break;
        case 'mysql':
          result = await runMySQL(data, node.config);
          break;
        case 'mongodb':
          result = await runMongoDB(data, node.config);
          break;
        case 'redis':
          result = await runRedis(data, node.config);
          break;
        case 'stripe':
          result = await runStripe(data, node.config);
          break;
        case 'shopify':
          result = await runShopify(data, node.config);
          break;
        case 'aws_s3':
          result = await runAwsS3(data, node.config);
          break;
        case 'openai':
          result = await runOpenAI(data, node.config);
          break;
        default: {
          const custom = getCustomDef(node.type);
          if (custom) {
            result = await runCustom(data, node.config, custom);
            break;
          }
          throw new Error(`unknown module type: ${node.type}`);
        }
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
