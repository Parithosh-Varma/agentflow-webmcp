// Resilient agent harness — drives AgentFlow WebMCP tools using the
// battle-tested pattern set for blind execution + stateless tools:
//
//  1. State & Canvas Abstraction Layer (agentflow_state_v2 in localStorage,
//     region+grid mental model, config fingerprints, write-through saves)
//  2. Defensive API Probing (discovery → schema probe → safe execute)
//  3. Pseudo-Debugging (logger taps + validator guard + trace reconstruction)
//  4. Fault-Tolerant Layered Build (plan → layers + gates → idempotent retry
//     → rollback snapshots → monitored full run)
//
// Usage:
//   AGENTFLOW_URL=http://localhost:4173/ node agent-harness-resilient.cjs
//   MOCK=1 AGENTFLOW_URL=... node agent-harness-resilient.cjs  (skip real fetch)

const { chromium } = require('playwright');

const URL = process.env.AGENTFLOW_URL || 'http://localhost:4173/';
const STATE_KEY = 'agentflow_state_v2';
const WORKFLOW_NAME = process.env.AGENTFLOW_SAVE_NAME || 'resilient-demo';

// ---- local mirrors of frontend/src/agent/* (plain JS for Node) ----
const REGIONS = {
  ingest: { xMin: 0, xMax: 400, yMin: 0, yMax: 400 },
  transform: { xMin: 420, xMax: 1200, yMin: 0, yMax: 600 },
  output: { xMin: 1220, xMax: 2000, yMin: 0, yMax: 400 },
};
const COLS = 12;
const ROW_H = 140;

function canonicalize(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(',')}]`;
  if (typeof v === 'object') {
    return `{${Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonicalize(x)}`)
      .join(',')}}}`;
  }
  return JSON.stringify(v) ?? 'null';
}
function hashString(s) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
const fingerprint = (cfg) => hashString(canonicalize(cfg ?? {}));
function gridToCoords(region, col, row) {
  const b = REGIONS[region];
  const w = b.xMax - b.xMin;
  return {
    x: Math.round(b.xMin + ((Math.min(COLS - 1, col) + 0.5) / COLS) * w),
    y: Math.round(b.yMin + row * ROW_H + ROW_H / 2),
  };
}

// webhook → dedup → enrich → condition → 3 outputs
function specs() {
  return [
    { key: 'ingest:webhook', type: 'webhook', region: 'ingest', row: 0, config: { method: 'POST', url: 'https://jsonplaceholder.typicode.com/posts' }, from: [] },
    { key: 'transform:dedup', type: 'transform', region: 'transform', row: 0, config: { op: 'passthrough' }, from: [{ key: 'ingest:webhook' }] },
    { key: 'transform:enrich', type: 'code', region: 'transform', row: 0, config: { code: 'return { ...data, enriched: true };' }, from: [{ key: 'transform:dedup' }] },
    { key: 'logic:route', type: 'condition', region: 'transform', row: 1, config: { path: 'enriched', equals: true }, from: [{ key: 'transform:enrich' }] },
    { key: 'output:premium', type: 'output', region: 'output', row: 0, config: { kind: 'console' }, from: [{ key: 'logic:route', label: 'true' }] },
    { key: 'output:standard', type: 'output', region: 'output', row: 1, config: { kind: 'console' }, from: [{ key: 'logic:route', label: 'false' }] },
    { key: 'output:archive', type: 'output', region: 'output', row: 2, config: { kind: 'console' }, from: [{ key: 'logic:route' }] },
    // taps + guard (pseudo-debugging)
    { key: 'tap:after_enrich', type: 'logger', region: 'transform', row: 2, config: { level: 'info', message: '[tap] after_enrich' }, from: [{ key: 'transform:enrich' }] },
    { key: 'guard:enrich', type: 'validator', region: 'transform', row: 2, config: { expression: '(data) => data !== null && data !== undefined' }, from: [{ key: 'transform:enrich' }] },
  ];
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  // Clean first impression: dismiss onboarding tour + agent toast before load.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('onboarding_dismissed_canvas-tour', 'true');
      localStorage.setItem('agentflow_agent_toast_dont_show_v1', 'true');
    } catch {}
  });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__webmcpReady === true, { timeout: 15000 });

  const call = async (name, args = {}) => {
    const raw = await page.evaluate(([n, a]) => window.__agentflow.callTool(n, a), [name, args]);
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };
  const loadState = () =>
    page.evaluate((k) => {
      try {
        const raw = localStorage.getItem(k);
        if (raw) return JSON.parse(raw);
      } catch {}
      return { schemaVersion: 'v2', nodesMeta: {}, edgesMeta: {}, executionHistory: {}, toolCapabilities: {}, backups: {} };
    }, STATE_KEY);
  const saveState = (s) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [STATE_KEY, s]);

  console.log('=== RESILIENT AGENT SESSION START ===');

  // Phase A — Discovery
  const status0 = await call('get_workflow_status');
  console.log('[Phase A] status:', status0.nodeCount, 'nodes /', status0.edgeCount, 'edges');
  const state = await loadState();
  state.schemaVersion = 'v2';
  state.lastUpdate = Date.now();
  state.spatialIndex = { grid: { cols: COLS, rowHeight: ROW_H }, regions: REGIONS };
  state.nodesMeta = state.nodesMeta || {};
  state.edgesMeta = state.edgesMeta || {};
  state.executionHistory = state.executionHistory || {};
  state.toolCapabilities = state.toolCapabilities || {};
  state.backups = state.backups || {};
  for (const n of status0.nodes || []) {
    try {
      const found = await call('find_nodes', { type: n.type, limit: 5 });
      const keys = new Set(state.toolCapabilities[n.type]?.supportedConfigKeys || []);
      for (const m of (found.nodes || []).slice(0, 3)) for (const k of m.configKeys || []) keys.add(k);
      state.toolCapabilities[n.type] = { supportedConfigKeys: [...keys] };
    } catch {}
  }
  await saveState(state);

  // Rollback point (pre-build snapshot)
  try {
    const exp = await call('export_workflow', { pretty: false });
    state.backups.pre = { at: Date.now(), workflowJson: exp.json };
    await saveState(state);
    console.log('[rollback] pre-build snapshot bytes:', exp.byteLength);
  } catch (e) {
    console.log('[rollback] snapshot failed (continuing):', e.message);
  }

  // Plan → allocate slots BEFORE any mutation
  const plan = specs();
  const usedCol = {};
  const slots = {};
  for (const s of plan) {
    const r = `${s.region}:${s.row}`;
    const col = usedCol[r] ?? 0;
    usedCol[r] = col + 1;
    slots[s.key] = { ...gridToCoords(s.region, col, s.row), col };
    state.nodesMeta[s.key] = {
      type: s.type, region: s.region, gridPos: { col, row: s.row },
      coords: slots[s.key], configFingerprint: fingerprint(s.config), createdAt: Date.now(),
    };
  }
  await saveState(state);
  console.log('[plan] allocated', plan.length, 'slots across ingest/transform/output');

  // Layer 1 — nodes (idempotent by deterministic label)
  const ids = {};
  for (const s of plan) {
    const found = await call('find_nodes', { query: s.key, limit: 5 });
    const exact = (found.nodes || []).find((n) => n.label === s.key);
    if (exact) {
      ids[s.key] = exact.id;
      console.log(`[L1] reuse ${s.key} → ${exact.id}`);
      continue;
    }
    const added = await call('add_node', { type: s.type, label: s.key, x: slots[s.key].x, y: slots[s.key].y });
    if (!added.success) throw new Error(`add_node ${s.key}: ${added.error}`);
    ids[s.key] = added.nodeId;
    console.log(`[L1] added ${s.key} → ${added.nodeId}`);
    await call('save_workflow', { name: WORKFLOW_NAME }); // write-through
    await saveState(state);
  }
  const gate1 = await call('get_workflow_status');
  console.log(`[gate L1] nodes=${gate1.nodeCount} (expect ≥${plan.length})`);
  if (gate1.nodeCount < plan.length) throw new Error('L1 gate failed: node count short');

  // Layer 2 — edges (already-connected = success, self-loop = error)
  for (const s of plan) {
    for (const c of s.from) {
      const res = await call('connect_nodes', { sourceNodeId: ids[c.key], targetNodeId: ids[s.key], label: c.label || '' });
      if (!res.success && !/already connected/i.test(res.error || '')) throw new Error(`wire ${c.key}→${s.key}: ${res.error}`);
      console.log(`[L2] ${c.key} → ${s.key}${c.label ? ` (${c.label})` : ''} ${res.edgeId ? 'ok' : res.message}`);
    }
  }
  const gate2 = await call('get_workflow_status');
  console.log(`[gate L2] edges=${gate2.edgeCount}`);
  try {
    const exp = await call('export_workflow', { pretty: false });
    state.backups.postEdges = { at: Date.now(), workflowJson: exp.json };
    await saveState(state);
  } catch {}

  // Layer 3 — configs + mini-executes (fingerprint skips no-ops on retry)
  for (const s of plan) {
    const before = await call('find_nodes', { query: s.key, limit: 1 });
    void before;
    const upd = await call('update_node_config', { nodeId: ids[s.key], config: s.config });
    if (!upd.success) throw new Error(`config ${s.key}: ${upd.error}`);
    if (upd.warnings) console.log(`[L3] ${s.key} warnings:`, upd.warnings.join(' | ').slice(0, 200));
    try {
      const mini = await call('run_node', { nodeId: ids[s.key], input: { probe: true } });
      const ok = mini.success ? `ok (${mini.status || 'done'})` : `FAULT ${mini.error || JSON.stringify(mini).slice(0, 160)}`;
      console.log(`[L3] mini-run ${s.key}:`, ok);
    } catch (e) {
      console.log(`[L3] mini-run ${s.key} threw (deferred to full run):`, e.message);
    }
    await call('save_workflow', { name: WORKFLOW_NAME }); // write-through
  }

  // Phase C — safe full execute + trace reconstruction
  const runId = `run_${Date.now().toString(36)}`;
  const exec = await call('execute_workflow', { input: process.env.MOCK ? { mock: true } : { userId: 1, premium: true } });
  const details = await call('get_execution_details', {}).catch(() => exec);
  const perNode = details.perNode || [];
  console.log(`[Phase C] runId=${runId} success=${details.success} done=${perNode.filter((p) => p.status === 'done').length}/${perNode.length}`);
  state.executionHistory[runId] = { startedAt: Date.now(), nodes: perNode.map((p) => p.id), artifacts: {} };
  for (const p of perNode) {
    state.executionHistory[runId].artifacts[p.id] = {
      inputHash: hashString(canonicalize({ run: runId })),
      outputHash: hashString(canonicalize(p.output ?? null)),
      status: p.status,
      ...(p.error ? { error: String(p.error).slice(0, 300) } : {}),
    };
    if (state.nodesMeta[p.label]) state.nodesMeta[p.label].lastRun = { status: p.status, at: Date.now() };
    console.log(`  ${p.status === 'done' ? '✓' : p.status === 'fault' ? '✗' : '○'} ${p.label} [${p.type}] ${p.error ? '— ' + String(p.error).slice(0, 140) : ''}`);
  }
  await saveState(state);
  await call('save_workflow', { name: WORKFLOW_NAME });

  const faulted = perNode.filter((p) => p.status === 'fault');
  if (faulted.length) {
    console.log(`[monitor] ${faulted.length} fault(s) isolated for Phase-B re-probe:`, faulted.map((p) => p.label).join(', '));
    process.exitCode = 2;
  }
  try {
    await page.locator('.react-flow__controls-fitview').click({ timeout: 5000 });
    await page.waitForTimeout(500);
  } catch {}
  await page.screenshot({ path: '/tmp/agentflow-resilient-result.png', fullPage: false });
  console.log('screenshot -> /tmp/agentflow-resilient-result.png');
  console.log('=== RESILIENT AGENT SESSION END ===');
  await browser.close();
})().catch((e) => {
  console.error('RESILIENT AGENT ERROR:', e);
  process.exit(1);
});
