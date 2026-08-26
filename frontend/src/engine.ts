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

function runTransform(data: any, cfg: any): any {
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
      const fn = new Function('data', `"use strict"; return (${cfg.expression})(data);`);
      return fn(data);
    }
    default:
      return data;
  }
}

function evalCondition(data: any, cfg: any): boolean {
  if (cfg?.expression) {
    const fn = new Function('data', `"use strict"; return Boolean((${cfg.expression})(data));`);
    return fn(data);
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
          result = runTransform(data, node.config);
          break;
        case 'condition': {
          const passed = evalCondition(data, node.config);
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
        default:
          throw new Error(`unknown module type: ${node.type}`);
      }

      statusMap[id] = 'done';
      outputs[id] = result;
      onEvent({ id, status: 'done', result });
    } catch (err: any) {
      hadError = true;
      statusMap[id] = 'fault';
      outputs[id] = { error: err?.message || String(err) };
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
