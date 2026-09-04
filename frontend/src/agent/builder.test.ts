import { describe, it, expect } from 'vitest';
import { createInitialState, type AgentState } from './state';
import {
  buildLayers,
  ensureEdge,
  ensureNode,
  planBuild,
  restoreRollbackPoint,
  snapshotRollbackPoint,
  verifyCounts,
  webhookEnrichObservability,
  webhookEnrichSpecs,
  type BuildSpec,
} from './builder';
import type { ToolClient } from './probe';

interface FakeCanvas {
  nodes: Array<{ id: string; type: string; label: string; x?: number; y?: number; config?: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; label?: string }>;
  exported: string[];
  seq: number;
  failIds: Set<string>;
}

function makeFakeClient(canvas: FakeCanvas): ToolClient {
  return {
    callTool: async (name: string, args: Record<string, unknown> = {}) => {
      switch (name) {
        case 'find_nodes': {
          const q = String(args['query'] ?? args['type'] ?? '').toLowerCase();
          const nodes = canvas.nodes
            .filter((n) => !q || n.label.toLowerCase().includes(q) || n.type.toLowerCase().includes(q))
            .map((n) => ({ id: n.id, label: n.label, type: n.type, configKeys: Object.keys(n.config ?? {}) }));
          return { success: true, count: nodes.length, nodes };
        }
        case 'add_node': {
          const id = `node_${canvas.seq++}`;
          canvas.nodes.push({
            id,
            type: String(args['type']),
            label: String(args['label']),
            x: args['x'] as number,
            y: args['y'] as number,
            config: {},
          });
          return { success: true, nodeId: id };
        }
        case 'connect_nodes': {
          const source = String(args['sourceNodeId']);
          const target = String(args['targetNodeId']);
          const label = String(args['label'] ?? '');
          const dup = canvas.edges.find((e) => e.source === source && e.target === target && (e.label ?? '') === label);
          if (dup) return { success: true, edgeId: dup.id, message: `Already connected ${source} → ${target}` };
          const id = `edge_${canvas.seq++}`;
          canvas.edges.push({ id, source, target, label });
          return { success: true, edgeId: id };
        }
        case 'update_node_config':
        case 'configure_node': {
          const node = canvas.nodes.find((n) => n.id === String(args['nodeId']));
          if (node) node.config = { ...(node.config ?? {}), ...((args['config'] as Record<string, unknown>) ?? {}) };
          return { success: true, appliedConfig: node?.config ?? {} };
        }
        case 'get_workflow_status':
          return {
            nodeCount: canvas.nodes.length,
            edgeCount: canvas.edges.length,
            nodes: canvas.nodes.map((n) => ({ id: n.id, type: n.type, label: n.label })),
            edges: canvas.edges,
          };
        case 'export_workflow': {
          const json = JSON.stringify({ nodes: canvas.nodes, edges: canvas.edges });
          canvas.exported.push(json);
          return { success: true, json };
        }
        case 'import_workflow': {
          const data = JSON.parse(String(args['json']));
          canvas.nodes = data.nodes;
          canvas.edges = data.edges;
          return { success: true };
        }
        case 'run_node':
          return { success: true, status: 'done', nodeId: String(args['nodeId']), output: { ok: true } };
        case 'execute_workflow':
          return { success: true, order: canvas.nodes.map((n) => n.id) };
        case 'get_execution_details': {
          const perNode = canvas.nodes.map((n) => ({
            id: n.id,
            label: n.label,
            type: n.type,
            status: canvas.failIds.has(n.id) ? 'fault' : 'done',
            output: canvas.failIds.has(n.id) ? { error: 'boom' } : { ok: true },
            ...(canvas.failIds.has(n.id) ? { error: 'boom' } : {}),
          }));
          return { success: perNode.every((p) => p.status === 'done'), order: canvas.nodes.map((n) => n.id), perNode };
        }
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    },
  };
}

function freshCanvas(): FakeCanvas {
  return { nodes: [], edges: [], exported: [], seq: 1, failIds: new Set() };
}

const SPECS: BuildSpec[] = [
  { key: 'ingest', type: 'webhook', region: 'ingest', config: { method: 'POST' } },
  { key: 'dedup', type: 'transform', region: 'transform', config: { op: 'passthrough' }, connectFrom: [{ key: 'ingest' }] },
];

describe('agent/builder: planning', () => {
  it('pre-allocates region slots before tool calls', () => {
    const state: AgentState = createInitialState();
    const plan = planBuild(SPECS, state);
    expect(plan.order).toEqual(['ingest', 'dedup']);
    expect(state.nodesMeta['ingest']?.region).toBe('ingest');
    expect(state.nodesMeta['dedup']?.region).toBe('transform');
    expect(plan.slots['ingest']?.coords.x).toBeLessThan(plan.slots['dedup']?.coords.x ?? 0);
  });
  it('ships the webhook→…→3-outputs example with taps + guard', () => {
    const specs = webhookEnrichSpecs();
    expect(specs.map((s) => s.key)).toContain('logic:route');
    expect(specs.filter((s) => s.region === 'output')).toHaveLength(3);
    const obs = webhookEnrichObservability();
    expect(obs.taps).toHaveLength(3);
    expect(obs.guard.validatorLabel).toBe('guard:transform:enrich');
  });
});

describe('agent/builder: idempotent mutations', () => {
  it('reuses deterministic labels on retry', async () => {
    const canvas = freshCanvas();
    const client = makeFakeClient(canvas);
    const state: AgentState = createInitialState();
    const plan = planBuild(SPECS, state);
    const first = await ensureNode(client, SPECS[0]!, plan.slots['ingest']!);
    const second = await ensureNode(client, SPECS[0]!, plan.slots['ingest']!);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(first.nodeId).toBe(second.nodeId);
    expect(canvas.nodes).toHaveLength(1);
  });
  it('rejects self-loops and dedupes repeat wires', async () => {
    const canvas = freshCanvas();
    const client = makeFakeClient(canvas);
    await expect(ensureEdge(client, 'a', 'a')).rejects.toThrow(/Self-loop/);
    const first = await ensureEdge(client, 'a', 'b', 'true');
    const second = await ensureEdge(client, 'a', 'b', 'true');
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(canvas.edges).toHaveLength(1);
  });
});

describe('agent/builder: layered build', () => {
  it('passes gates, snapshots layers, and monitors the full run', async () => {
    const canvas = freshCanvas();
    const client = makeFakeClient(canvas);
    const state: AgentState = createInitialState();
    const plan = planBuild(SPECS, state);
    const res = await buildLayers(client, state, SPECS, plan, {
      layerTag: 'test',
      miniExecute: true,
      fullRun: true,
      mockInput: { hello: 1 },
    });
    expect(canvas.nodes).toHaveLength(2);
    expect(canvas.edges).toHaveLength(1);
    expect(res.gates.every((g) => g.ok)).toBe(true);
    expect(res.success).toBe(true);
    expect(res.runId).toBeDefined();
    expect(canvas.exported.length).toBeGreaterThanOrEqual(3);
  });
  it('isolates faulted nodes for re-probing', async () => {
    const canvas = freshCanvas();
    const client = makeFakeClient(canvas);
    const state: AgentState = createInitialState();
    const plan = planBuild(SPECS, state);
    const built = await buildLayers(client, state, SPECS, plan, { fullRun: false });
    canvas.failIds.add(built.ids['dedup']!);
    const monitored = await buildLayers(client, state, SPECS, plan, { fullRun: true, snapshotLayers: false });
    expect(monitored.faulted).toContain(built.ids['dedup']);
  });
  it('snapshots + restores rollback points', async () => {
    const canvas = freshCanvas();
    const client = makeFakeClient(canvas);
    const state: AgentState = createInitialState();
    const plan = planBuild(SPECS, state);
    await buildLayers(client, state, SPECS, plan, { fullRun: false });
    await snapshotRollbackPoint(client, state, 'pre', 1);
    canvas.nodes = [];
    await restoreRollbackPoint(client, state, 'pre');
    expect(canvas.nodes).toHaveLength(2);
    const gate = await verifyCounts(client, 2, 1);
    expect(gate.ok).toBe(true);
  });
});
