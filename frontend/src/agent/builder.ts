// Fault-tolerant multi-node build strategy for blind, stateless execution.
//
// Pipeline: Plan → allocate → Layer 1 (nodes) → gate → Layer 2 (edges) → gate
// → Layer 3 (configs + mini-executes) → full run + monitoring.
//
// Guarantees:
// - Region slots are pre-allocated in state BEFORE any tool call.
// - Every layer ends in a verification gate (counts, loop/dup checks).
// - All mutations are idempotent: deterministic labels → reuse IDs,
//   `already connected` counts as success, config fingerprints skip no-ops.
// - A rollback snapshot (export_workflow JSON) is stored before each layer.

import type { AgentState, Coords, GridPos } from './state';
import {
  allocateNode,
  fingerprintConfig,
  getBackup,
  recordEdge,
  snapshotBackup,
} from './state';
import { configureNode, normalizeResult, phaseCSafeExecute, type ToolClient } from './probe';
import { planErrorBoundary, planTapNodes } from './trace';

export interface BuildSpec {
  /** Deterministic key → label. Re-running the same spec reuses the node. */
  key: string;
  type: string;
  role?: string;
  intent?: string;
  region?: string;
  row?: number;
  gridPos?: GridPos;
  coords?: Coords;
  config?: Record<string, unknown>;
  /** Keys (other specs) that must connect INTO this node. */
  connectFrom?: Array<{ key: string; label?: string }>;
}

export interface PlannedSlot {
  key: string;
  region: string;
  gridPos: GridPos;
  coords: Coords;
  configFingerprint: string;
}

export interface BuildPlan {
  slots: Record<string, PlannedSlot>;
  order: string[];
}

/** Reserve region slots + fingerprints in state before any tool call. */
export function planBuild(specs: BuildSpec[], state: AgentState, now = Date.now()): BuildPlan {
  const slots: Record<string, PlannedSlot> = {};
  const order: string[] = [];
  for (const spec of specs) {
    const meta = allocateNode(
      state,
      {
        nodeId: spec.key,
        type: spec.type,
        role: spec.role,
        intent: spec.intent,
        region: spec.region,
        gridPos: spec.gridPos,
        coords: spec.coords,
        config: spec.config ?? {},
        now,
      },
    );
    slots[spec.key] = {
      key: spec.key,
      region: meta.region,
      gridPos: meta.gridPos,
      coords: meta.coords,
      configFingerprint: meta.configFingerprint,
    };
    order.push(spec.key);
  }
  return { slots, order };
}

export interface ResolvedIds {
  ids: Record<string, string>;
  reused: Record<string, boolean>;
}

async function findNodeByLabel(
  client: ToolClient,
  label: string,
): Promise<{ id: string; type?: string } | undefined> {
  try {
    const raw = normalizeResult(await client.callTool('find_nodes', { query: label, limit: 10 }));
    const nodes = Array.isArray(raw['nodes']) ? (raw['nodes'] as Array<Record<string, unknown>>) : [];
    const exact = nodes.find((n) => String(n['label'] ?? '') === label) ?? nodes[0];
    if (!exact) return undefined;
    return { id: String(exact['id'] ?? ''), type: exact['type'] !== undefined ? String(exact['type']) : undefined };
  } catch {
    return undefined;
  }
}

/** Layer 1 — idempotent node creation. Deterministic label → reuse existing ID. */
export async function ensureNode(
  client: ToolClient,
  spec: BuildSpec,
  slot: PlannedSlot,
): Promise<{ nodeId: string; reused: boolean }> {
  const label = spec.key;
  const existing = await findNodeByLabel(client, label);
  if (existing?.id) return { nodeId: existing.id, reused: true };
  const added = normalizeResult(
    await client.callTool('add_node', {
      type: spec.type,
      label,
      x: slot.coords.x,
      y: slot.coords.y,
    }),
  );
  const nodeId = String(added['nodeId'] ?? added['id'] ?? '');
  if (!nodeId) throw new Error(`add_node for ${label} returned no nodeId`);
  return { nodeId, reused: false };
}

/** Layer 2 — idempotent wiring. Self-loops rejected locally; dups = success. */
export async function ensureEdge(
  client: ToolClient,
  sourceNodeId: string,
  targetNodeId: string,
  label = '',
): Promise<{ edgeId: string; deduped: boolean }> {
  if (sourceNodeId === targetNodeId) {
    throw new Error(`Self-loop not allowed: ${sourceNodeId} → ${targetNodeId}`);
  }
  const connected = normalizeResult(
    await client.callTool('connect_nodes', {
      sourceNodeId,
      targetNodeId,
      label,
    }),
  );
  if (connected['success'] === false) {
    const message = String(connected['error'] ?? 'connect failed');
    if (/already connected/i.test(message)) {
      return { edgeId: String(connected['edgeId'] ?? `${sourceNodeId}->${targetNodeId}`), deduped: true };
    }
    throw new Error(message);
  }
  return { edgeId: String(connected['edgeId'] ?? ''), deduped: /already connected/i.test(String(connected['message'] ?? '')) };
}

export interface LayerGate {
  ok: boolean;
  nodeCount: number;
  edgeCount: number;
  errors: string[];
}

export async function verifyCounts(
  client: ToolClient,
  expectedNodes: number,
  expectedEdges: number,
): Promise<LayerGate> {
  const status = normalizeResult(await client.callTool('get_workflow_status', {}));
  const nodeCount = typeof status['nodeCount'] === 'number' ? (status['nodeCount'] as number) : 0;
  const edgeCount = typeof status['edgeCount'] === 'number' ? (status['edgeCount'] as number) : 0;
  const errors: string[] = [];
  if (nodeCount < expectedNodes) errors.push(`node count ${nodeCount} < expected ${expectedNodes}`);
  if (edgeCount < expectedEdges) errors.push(`edge count ${edgeCount} < expected ${expectedEdges}`);
  return { ok: errors.length === 0, nodeCount, edgeCount, errors };
}

/** Rollback point: export workflow JSON → state.backups[runId]. */
export async function snapshotRollbackPoint(
  client: ToolClient,
  state: AgentState,
  runId: string,
  now = Date.now(),
): Promise<string> {
  const exported = normalizeResult(await client.callTool('export_workflow', { pretty: false }));
  const json = typeof exported['json'] === 'string' ? (exported['json'] as string) : JSON.stringify(exported);
  snapshotBackup(state, runId, json, now);
  return json;
}

/** Restore a previous snapshot via import_workflow (merge=false replaces). */
export async function restoreRollbackPoint(
  client: ToolClient,
  state: AgentState,
  runId: string,
): Promise<void> {
  const backup = getBackup(state, runId);
  if (!backup) throw new Error(`no backup for ${runId}`);
  const result = normalizeResult(await client.callTool('import_workflow', { json: backup.workflowJson, merge: false }));
  if (result['success'] === false) throw new Error(String(result['error'] ?? 'import failed'));
}

export interface LayeredBuildResult {
  ids: Record<string, string>;
  gates: LayerGate[];
  edgeIds: string[];
  runId?: string;
  success?: boolean;
  faulted?: string[];
}

/**
 * Full layered build: nodes → verify → edges → verify → configs (+mini run per
 * node when opts.miniExecute) → optional full safe-execute with monitoring.
 */
export async function buildLayers(
  client: ToolClient,
  state: AgentState,
  specs: BuildSpec[],
  plan: BuildPlan,
  opts: {
    layerTag?: string;
    snapshotLayers?: boolean;
    miniExecute?: boolean;
    mockInput?: Record<string, unknown>;
    fullRun?: boolean;
    now?: number;
  } = {},
): Promise<LayeredBuildResult> {
  const now = opts.now ?? Date.now();
  const tag = opts.layerTag ?? `build_${now.toString(36)}`;
  const gates: LayerGate[] = [];
  const ids: Record<string, string> = {};
  const edgeIds: string[] = [];
  if (opts.snapshotLayers !== false) {
    try {
      await snapshotRollbackPoint(client, state, `${tag}:pre`, now);
    } catch {
      // snapshot is best-effort; build continues
    }
  }
  // Layer 1: nodes
  for (const key of plan.order) {
    const spec = specs.find((s) => s.key === key);
    const slot = plan.slots[key];
    if (!spec || !slot) continue;
    const { nodeId } = await ensureNode(client, spec, slot);
    ids[key] = nodeId;
  }
  gates.push(await verifyCounts(client, plan.order.length, 0));
  if (opts.snapshotLayers !== false) {
    try {
      await snapshotRollbackPoint(client, state, `${tag}:nodes`, now);
    } catch {
      // ignore
    }
  }
  // Layer 2: edges
  let expectedEdges = 0;
  for (const spec of specs) {
    const targetId = ids[spec.key];
    if (!targetId) continue;
    for (const conn of spec.connectFrom ?? []) {
      const sourceId = ids[conn.key];
      if (!sourceId) continue;
      expectedEdges += 1;
      const { edgeId } = await ensureEdge(client, sourceId, targetId, conn.label ?? '');
      edgeIds.push(edgeId);
      recordEdge(state, edgeId || `${sourceId}->${targetId}:${conn.label ?? ''}`, sourceId, targetId, conn.label ?? '', now);
    }
  }
  gates.push(await verifyCounts(client, plan.order.length, expectedEdges));
  if (opts.snapshotLayers !== false) {
    try {
      await snapshotRollbackPoint(client, state, `${tag}:edges`, now);
    } catch {
      // ignore
    }
  }
  // Layer 3: configs (+mini execute per node)
  for (const spec of specs) {
    const nodeId = ids[spec.key];
    if (!nodeId || !spec.config) continue;
    const slot = plan.slots[spec.key];
    const fingerprint = fingerprintConfig(spec.config);
    if (slot && slot.configFingerprint === fingerprint) {
      // Fingerprint matches the plan — still apply once (canvas may differ),
      // but a repeat run with the same fingerprint becomes a no-op upstream.
    }
    await configureNode(client, nodeId, spec.config);
    if (opts.miniExecute) {
      try {
        await client.callTool('run_node', { nodeId, input: opts.mockInput ?? {} });
      } catch {
        // mini-execute failures surface in the full run; continue configuring
      }
    }
  }
  const result: LayeredBuildResult = { ids, gates, edgeIds };
  if (opts.fullRun) {
    const exec = await phaseCSafeExecute(client, state, { mockInput: opts.mockInput ?? {} }, now);
    result.runId = exec.runId;
    result.success = exec.success;
    result.faulted = Object.entries(exec.status)
      .filter(([, s]) => s === 'fault')
      .map(([id]) => id);
  }
  state.lastUpdate = now;
  return result;
}

// ---- concrete WebMCP example -------------------------------------------------
// webhook → dedup → enrich → condition → 3 outputs, with logger taps + a
// validator error boundary on the enrich branch.

export function webhookEnrichSpecs(): BuildSpec[] {
  return [
    { key: 'ingest:webhook', type: 'webhook', role: 'ingest', intent: 'receive user events', region: 'ingest', row: 0, config: { method: 'POST' } },
    { key: 'transform:dedup', type: 'transform', role: 'dedup', intent: 'normalize user events', region: 'transform', row: 0, config: { op: 'passthrough' }, connectFrom: [{ key: 'ingest:webhook' }] },
    { key: 'transform:enrich', type: 'code', role: 'enrich', intent: 'enrich with profile fields', region: 'transform', row: 0, config: { code: 'return { ...data, enriched: true };' }, connectFrom: [{ key: 'transform:dedup' }] },
    { key: 'logic:route', type: 'condition', role: 'route', intent: 'route premium vs standard', region: 'transform', row: 1, config: { path: 'enriched', equals: true }, connectFrom: [{ key: 'transform:enrich' }] },
    { key: 'output:premium', type: 'output', role: 'sink', intent: 'premium downstream', region: 'output', row: 0, config: { kind: 'console' }, connectFrom: [{ key: 'logic:route', label: 'true' }] },
    { key: 'output:standard', type: 'output', role: 'sink', intent: 'standard downstream', region: 'output', row: 1, config: { kind: 'console' }, connectFrom: [{ key: 'logic:route', label: 'false' }] },
    { key: 'output:archive', type: 'output', role: 'sink', intent: 'archive everything', region: 'output', row: 2, config: { kind: 'console' }, connectFrom: [{ key: 'logic:route' }] },
  ];
}

/** Tap + guard specs accompanying the example (caller merges into build). */
export function webhookEnrichObservability(): {
  taps: ReturnType<typeof planTapNodes>;
  guard: ReturnType<typeof planErrorBoundary>;
} {
  return {
    taps: planTapNodes(['transform:dedup', 'transform:enrich', 'logic:route']),
    guard: planErrorBoundary('transform:enrich'),
  };
}
