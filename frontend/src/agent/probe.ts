// Defensive API probing for stateless + silent-failure tool environments.
//
// Phase A (Discovery): get_workflow_status + find_nodes → toolCapabilities cache.
// Phase B (Schema probing): probe node + incremental config walk → required keys.
// Phase C (Safe execute): execute_workflow + get_execution_details with runId
//   tracking, per-node lastRun mapping, and fingerprint-preserving failures.

import type { AgentState, ToolCapability } from './state';
import { recordCapability, recordNodeLastRun, recordRunArtifacts } from './state';
import { hashValue } from './trace';

export interface ToolClient {
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
}

export function normalizeResult(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      return { value: parsed };
    } catch {
      return { value: raw };
    }
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return { value: raw };
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function randomRunId(): string {
  try {
    const cryptoApi = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
    if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  } catch {
    // fall through to counter-based id
  }
  return `run_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffff).toString(16)}`;
}

/** update_node_config is canonical; configure_node is accepted as an alias. */
export async function configureNode(
  client: ToolClient,
  nodeId: string,
  config: Record<string, unknown>,
  label?: string,
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = { nodeId, config };
  if (label) payload['label'] = label;
  const raw = await client.callTool('update_node_config', payload).catch(async () => {
    return client.callTool('configure_node', { nodeId, config });
  });
  return normalizeResult(raw);
}

export interface DiscoverySummary {
  nodeCount: number;
  edgeCount: number;
  types: Record<string, number>;
}

/**
 * Phase A — Discovery. Reads canvas status, counts per-type nodes, and caches
 * observed config keys into state.toolCapabilities (union over sampled nodes).
 */
export async function phaseADiscovery(
  client: ToolClient,
  state: AgentState,
  typesToCount: string[] = [],
  samplePerType = 3,
  now = Date.now(),
): Promise<DiscoverySummary> {
  const status = normalizeResult(await client.callTool('get_workflow_status', {}));
  const nodes = asArray(status['nodes']);
  const edges = asArray(status['edges']);
  const types: Record<string, number> = {};
  for (const n of nodes) {
    const t = String(n['type'] ?? 'unknown');
    types[t] = (types[t] ?? 0) + 1;
  }
  const wanted = new Set<string>([...Object.keys(types), ...typesToCount]);
  for (const type of wanted) {
    try {
      const found = normalizeResult(await client.callTool('find_nodes', { type, limit: 20 }));
      const matches = asArray(found['nodes']).slice(0, samplePerType);
      const keys = new Set<string>(state.toolCapabilities[type]?.supportedConfigKeys ?? []);
      for (const m of matches) {
        const configKeys = Array.isArray(m['configKeys']) ? (m['configKeys'] as string[]) : [];
        for (const k of configKeys) keys.add(k);
      }
      if (matches.length > 0 || !state.toolCapabilities[type]) {
        const prev: ToolCapability = state.toolCapabilities[type] ?? { supportedConfigKeys: [] };
        recordCapability(state, type, { ...prev, supportedConfigKeys: [...keys] }, now);
      }
      if (typeof found['count'] === 'number') types[type] = found['count'] as number;
    } catch {
      // find_nodes is best-effort; status counts remain authoritative
    }
  }
  return {
    nodeCount: typeof status['nodeCount'] === 'number' ? (status['nodeCount'] as number) : nodes.length,
    edgeCount: typeof status['edgeCount'] === 'number' ? (status['edgeCount'] as number) : edges.length,
    types,
  };
}

export interface SchemaProbeInput {
  /** Candidate configs, ordered from minimal → full. Walked incrementally. */
  trials: Array<Record<string, unknown>>;
  exampleConfig?: Record<string, unknown>;
  knownLimits?: Record<string, unknown>;
}

export interface SchemaProbeResult {
  type: string;
  requiredKeys: string[];
  optionalKeys: string[];
  rejects: string[];
  exampleConfig: Record<string, unknown>;
  supportedConfigKeys: string[];
}

/**
 * Phase B — Schema probing for an unknown node type T.
 * Creates a throwaway probe node, walks configs incrementally, and stops when
 * status === 'done' or the error stabilizes across two consecutive trials.
 * The probe node is always deleted; the capability is cached in state.
 */
export async function phaseBProbeType(
  client: ToolClient,
  state: AgentState,
  type: string,
  input: SchemaProbeInput,
  now = Date.now(),
): Promise<SchemaProbeResult> {
  const added = normalizeResult(
    await client.callTool('add_node', { type, label: `probe-${type}`, x: 0, y: 0 }),
  );
  const probeId = String(added['nodeId'] ?? added['id'] ?? '');
  if (!probeId) throw new Error(`probe add_node for ${type} returned no nodeId`);
  try {
    await configureNode(client, probeId, {});
  } catch {
    // empty-config rejection is itself a signal; continue walking trials
  }
  const supported = new Set<string>();
  const rejects: string[] = [];
  let lastError = '';
  let stableCount = 0;
  let successConfig: Record<string, unknown> = {};
  let succeeded = false;
  const trials = input.trials.length > 0 ? input.trials : [{}];
  for (const trial of trials) {
    for (const k of Object.keys(trial)) supported.add(k);
    const configured = await configureNode(client, probeId, trial);
    const warnings = configured['warnings'];
    if (Array.isArray(warnings) && warnings.length > 0) {
      const text = warnings.join(' | ');
      const m = text.match(/Unknown keys[^:]*:\s*([^.]+)/i);
      if (m?.[1]) {
        for (const k of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
          if (!rejects.includes(k)) rejects.push(k);
        }
      }
    }
    let status = 'unknown';
    let error = '';
    try {
      const run = normalizeResult(await client.callTool('run_node', { nodeId: probeId, input: {} }));
      status = String(run['status'] ?? (run['success'] ? 'done' : 'fault'));
      if (run['success'] === true && !run['error']) status = 'done';
      error = String(run['error'] ?? (run['output'] as Record<string, unknown> | undefined)?.['error'] ?? '');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    if (status === 'done') {
      succeeded = true;
      successConfig = trial;
      break;
    }
    if (error && error === lastError) {
      stableCount += 1;
      if (stableCount >= 1) break; // error stabilized — stop walking
    } else {
      stableCount = 0;
      lastError = error;
    }
    successConfig = trial;
  }
  try {
    await client.callTool('delete_node', { nodeId: probeId });
  } catch {
    // probe cleanup is best-effort
  }
  const requiredKeys = succeeded ? Object.keys(successConfig) : Object.keys(trials[0] ?? {});
  const optionalKeys = [...supported].filter((k) => !requiredKeys.includes(k));
  const exampleConfig = input.exampleConfig ?? successConfig;
  recordCapability(
    state,
    type,
    {
      supportedConfigKeys: [...supported],
      requiredKeys,
      optionalKeys,
      knownLimits: input.knownLimits,
      rejects,
      exampleConfig,
    },
    now,
  );
  return {
    type,
    requiredKeys,
    optionalKeys,
    rejects,
    exampleConfig,
    supportedConfigKeys: [...supported],
  };
}

export interface SafeExecuteInput {
  runId?: string;
  mockInput?: Record<string, unknown>;
}

export interface SafeExecuteResult {
  runId: string;
  success: boolean;
  order: string[];
  status: Record<string, string>;
  details: Record<string, unknown>;
}

/**
 * Phase C — Safe execute. Wraps execute_workflow + get_execution_details,
 * records per-node artifacts + lastRun into state, and NEVER mutates stored
 * config fingerprints on failure (caller rolls back to the backup instead).
 */
export async function phaseCSafeExecute(
  client: ToolClient,
  state: AgentState,
  input: SafeExecuteInput = {},
  now = Date.now(),
): Promise<SafeExecuteResult> {
  const runId = input.runId ?? randomRunId();
  const startedAt = now;
  const executed = normalizeResult(await client.callTool('execute_workflow', { input: input.mockInput ?? {} }));
  let details: Record<string, unknown> = executed;
  try {
    details = normalizeResult(await client.callTool('get_execution_details', {}));
  } catch {
    // fall back to the raw execute payload
  }
  const order = Array.isArray(details['order'])
    ? (details['order'] as string[])
    : Array.isArray(executed['order'])
      ? (executed['order'] as string[])
      : [];
  const perNode = Array.isArray(details['perNode']) ? (details['perNode'] as Array<Record<string, unknown>>) : [];
  const statusMap: Record<string, string> = {};
  const startedRecordNodes = order.length > 0 ? order : perNode.map((p) => String(p['id'] ?? ''));
  if (!state.executionHistory[runId]) {
    state.executionHistory[runId] = { startedAt, nodes: [...startedRecordNodes], artifacts: {} };
  }
  const outputs = (details['outputs'] as Record<string, unknown> | undefined) ?? {};
  for (const node of perNode) {
    const id = String(node['id'] ?? '');
    if (!id) continue;
    const status = String(node['status'] ?? 'unknown');
    statusMap[id] = status;
    const output = node['output'];
    const error = node['error'] !== undefined ? String(node['error']) : undefined;
    recordRunArtifacts(
      state,
      runId,
      id,
      {
        inputHash: hashValue(input.mockInput ?? {}),
        outputHash: hashValue(output ?? null),
        status,
        ...(error ? { error } : {}),
      },
      now,
    );
    recordNodeLastRun(state, id, { status, at: now, error }, now);
  }
  // Nodes present in order but missing from perNode (truncated details) still get a run marker.
  for (const id of order) {
    if (statusMap[id]) continue;
    const out = outputs[id];
    const status =
      typeof executed['status'] === 'object' && executed['status'] !== null
        ? String((executed['status'] as Record<string, string>)[id] ?? 'unknown')
        : 'unknown';
    statusMap[id] = status;
    recordRunArtifacts(
      state,
      runId,
      id,
      { inputHash: hashValue(input.mockInput ?? {}), outputHash: hashValue(out ?? null), status },
      now,
    );
    recordNodeLastRun(state, id, { status, at: now }, now);
  }
  const success =
    typeof details['success'] === 'boolean'
      ? (details['success'] as boolean)
      : typeof executed['success'] === 'boolean'
        ? (executed['success'] as boolean)
        : false;
  state.lastUpdate = now;
  return { runId, success, order, status: statusMap, details };
}
