export type CustomField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'boolean';
  placeholder?: string;
  defaultValue?: any;
  options?: string[]; // for select
};

export interface CustomNodeDef {
  type: string; // must start with custom_ , e.g., custom_my_node
  displayName: string;
  description: string;
  category: string; // default "Custom"
  color: string; // hex tint
  icon: string; // icon key, e.g., "CodeIcon"
  fields: CustomField[]; // config fields shown in popover
  code: string; // JS body: async (data, config) => { ... ; return result; }  — user writes body, we wrap as AsyncFunction
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'agentflow_custom_nodes_v1';
const API_BASE = 'https://agentflow.parithosh.workers.dev';

function normalizeType(raw: string): string {
  let t = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/__+/g, '_').replace(/^_+|_+$/g, '');
  if (!t) t = 'custom_node';
  if (!t.startsWith('custom_')) t = `custom_${t}`;
  // enforce max 32
  if (t.length > 32) t = t.slice(0, 32);
  return t;
}

export function listCustomNodes(): CustomNodeDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as CustomNodeDef[];
  } catch { return []; }
}

export function getCustomNode(type: string): CustomNodeDef | undefined {
  return listCustomNodes().find(n => n.type === type);
}

export function saveCustomNodes(list: CustomNodeDef[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  // notify listeners
  try { window.dispatchEvent(new CustomEvent('custom-nodes-updated', { detail: list })); } catch {}
  // also sync to backend if available (fire-and-forget) — try Worker D1 first, then Express
  try {
    const headers: Record<string,string> = { 'Content-Type': 'application/json' };
    try { const tok = localStorage.getItem('agentflow_token'); if (tok) (headers as any)['Authorization'] = `Bearer ${tok}`; } catch {}
    fetch(`${API_BASE}/api/custom-nodes`, { method: 'POST', headers, body: JSON.stringify({ nodes: list }) }).catch(()=>{
      fetch('/api/custom-nodes', { method: 'POST', headers, body: JSON.stringify({ nodes: list }) }).catch(()=>{});
    });
  } catch {}
}

export function upsertCustomNode(def: CustomNodeDef) {
  const list = listCustomNodes();
  const idx = list.findIndex(n => n.type === def.type);
  if (idx >= 0) list[idx] = def;
  else list.push(def);
  saveCustomNodes(list);
  return def;
}

export function deleteCustomNode(type: string) {
  const list = listCustomNodes().filter(n => n.type !== type);
  saveCustomNodes(list);
}

export function createCustomNode(input: Partial<CustomNodeDef> & { code: string }): { ok: true, def: CustomNodeDef } | { ok: false, error: string } {
  const type = normalizeType(input.type || input.displayName || 'custom_node');
  const displayName = (input.displayName || type.replace('custom_', '').replace(/_/g, ' ')).trim();
  if (!displayName) return { ok: false, error: 'displayName required' };
  if (!input.code || !input.code.trim()) return { ok: false, error: 'code required' };
  const BLOCKED = [/require\s*\(/, /process\./, /child_process/, /fs\./, /eval\s*\(/, /Function\s*\(/, /while\s*\(\s*true\s*\)/, /for\s*\(\s*;\s*;\s*\)/];
  for (const pat of BLOCKED) if (pat.test(input.code)) return { ok: false, error: `blocked pattern: ${pat}` };
  // validate code syntax quickly (async aware)
  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor as typeof Function;
    // eslint-disable-next-line no-new-func
    new (AsyncFunction as any)('data', 'config', `"use strict"; ${input.code}`);
  } catch (e: any) {
    return { ok: false, error: `code syntax error: ${e.message}` };
  }
  // check duplicate vs built-in
  const builtIn = new Set(['start','manual_trigger','api_call','transform','condition','output','delay','filter','split','merge','loop','code','webhook','ai','validator','logger','file','schedule','graphql','set','switch','aggregate','sort','limit','item_lists','function','noop','webhook_response','html','date_time','slack','discord','github','gmail','google_sheets','notion','airtable','postgres','mysql','mongodb','redis','stripe','shopify','aws_s3','openai']);
  if (builtIn.has(type) || builtIn.has(type.replace('custom_',''))) return { ok: false, error: `type ${type} conflicts with built-in` };
  const now = new Date().toISOString();
  const def: CustomNodeDef = {
    type,
    displayName: displayName.slice(0, 40),
    description: (input.description || 'Custom node').slice(0, 120),
    category: (input.category || 'Custom').slice(0, 20),
    color: input.color || '#a8d8a8',
    icon: input.icon || 'CodeIcon',
    fields: Array.isArray(input.fields) ? input.fields.slice(0, 12) : [],
    code: input.code,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
  upsertCustomNode(def);
  return { ok: true, def };
}

export const CUSTOM_ICON_OPTIONS = [
  'CodeIcon','GlobeIcon','TransformIcon','BranchIcon','SendIcon','ClockIcon','FilterIcon','SplitIcon','MergeIcon','LoopIcon','WebhookIcon','AiIcon','ValidatorIcon','LoggerIcon','FileIcon',
] as const;

export function isCustomType(type: string): boolean {
  return type.startsWith('custom_');
}

export async function syncCustomNodesFromBackend() {
  try {
    const headers: Record<string,string> = {};
    try { const tok = localStorage.getItem('agentflow_token'); if (tok) headers['Authorization'] = `Bearer ${tok}`; } catch {}
    // Try Worker D1 first, then fallback to Express local
    let res: Response | null = null;
    try { res = await fetch(`${API_BASE}/api/custom-nodes`, { headers }); } catch {}
    if (!res || !res.ok) {
      try { res = await fetch('/api/custom-nodes', { headers }); } catch {}
    }
    if (!res || !res.ok) return;
    const data = await res.json();
    const backendNodes: CustomNodeDef[] = data.nodes || [];
    if (!Array.isArray(backendNodes) || backendNodes.length===0) return;
    const local = listCustomNodes();
    const map = new Map<string, CustomNodeDef>();
    for (const n of local) map.set(n.type, n);
    let changed=false;
    for (const b of backendNodes) {
      const existing = map.get(b.type);
      if (!existing || (b.updatedAt && existing.updatedAt && b.updatedAt > existing.updatedAt)) {
        map.set(b.type, b);
        changed=true;
      }
    }
    if (changed) {
      const merged = Array.from(map.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      try { window.dispatchEvent(new CustomEvent('custom-nodes-updated', {detail: merged})); } catch {}
    }
  } catch {}
}
if (typeof window !== 'undefined') {
  setTimeout(()=> syncCustomNodesFromBackend().catch(()=>{}), 500);
  setInterval(()=> syncCustomNodesFromBackend().catch(()=>{}), 10000);
}
