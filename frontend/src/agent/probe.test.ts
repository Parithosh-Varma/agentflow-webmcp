import { describe, it, expect } from 'vitest';
import { createInitialState, type AgentState } from './state';
import {
  configureNode,
  normalizeResult,
  phaseADiscovery,
  phaseBProbeType,
  phaseCSafeExecute,
  type ToolClient,
} from './probe';

function makeClient(handlers: Record<string, (args: Record<string, unknown>) => unknown>): ToolClient {
  return {
    callTool: async (name: string, args: Record<string, unknown> = {}) => {
      const fn = handlers[name];
      if (!fn) throw new Error(`Unknown tool: ${name}`);
      return fn(args);
    },
  };
}

describe('agent/probe: helpers', () => {
  it('normalizes stringified + object results', () => {
    expect(normalizeResult(JSON.stringify({ success: true }))).toEqual({ success: true });
    expect(normalizeResult({ success: false })).toEqual({ success: false });
  });
  it('configureNode prefers update_node_config with label passthrough', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const client = makeClient({
      update_node_config: (args) => {
        seen.push(args);
        return { success: true };
      },
    });
    await configureNode(client, 'n1', { url: 'https://x' }, 'label');
    expect(seen[0]).toMatchObject({ nodeId: 'n1', label: 'label' });
  });
});

describe('agent/probe: Phase A discovery', () => {
  it('caches per-type counts + observed config keys', async () => {
    const state: AgentState = createInitialState();
    const client = makeClient({
      get_workflow_status: () => ({
        nodeCount: 2,
        edgeCount: 1,
        nodes: [
          { id: 'a', type: 'api_call', label: 'A' },
          { id: 'b', type: 'transform', label: 'B' },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }],
      }),
      find_nodes: (args) => ({
        success: true,
        count: 1,
        nodes: [{ id: 'a', label: 'A', type: args['type'], configKeys: ['url', 'method'] }],
      }),
    });
    const summary = await phaseADiscovery(client, state, ['api_call']);
    expect(summary.nodeCount).toBe(2);
    expect(summary.types['api_call']).toBe(1);
    expect(state.toolCapabilities['api_call']?.supportedConfigKeys).toContain('url');
  });
});

describe('agent/probe: Phase B schema probing', () => {
  it('walks trials, caches capability, deletes probe', async () => {
    const state: AgentState = createInitialState();
    const deleted: string[] = [];
    let lastConfig: Record<string, unknown> = {};
    const client = makeClient({
      add_node: () => ({ success: true, nodeId: 'probe1' }),
      update_node_config: (args) => {
        lastConfig = (args['config'] as Record<string, unknown>) ?? {};
        return { success: true };
      },
      run_node: () => {
        // empty config fails like a real code node; full config succeeds
        if (lastConfig['code']) return { success: true, status: 'done', nodeId: 'probe1', output: { ok: true } };
        return { success: false, status: 'fault', error: 'code node requires a code expression' };
      },
      delete_node: (args) => {
        deleted.push(String(args['nodeId']));
        return { success: true };
      },
    });
    const res = await phaseBProbeType(client, state, 'code', {
      trials: [{}, { code: 'return 1;' }],
      exampleConfig: { code: 'return 1;' },
    });
    expect(res.requiredKeys).toContain('code');
    expect(state.toolCapabilities['code']?.requiredKeys).toContain('code');
    expect(deleted).toEqual(['probe1']);
  });
  it('stops when the error stabilizes', async () => {
    const state: AgentState = createInitialState();
    let runs = 0;
    const client = makeClient({
      add_node: () => ({ success: true, nodeId: 'probe1' }),
      update_node_config: () => ({ success: true }),
      run_node: () => {
        runs += 1;
        return { success: false, status: 'fault', error: 'no URL configured' };
      },
      delete_node: () => ({ success: true }),
    });
    await phaseBProbeType(client, state, 'api_call', { trials: [{}, { method: 'GET' }, { url: 'x' }] });
    expect(runs).toBeLessThanOrEqual(2);
  });
});

describe('agent/probe: Phase C safe execute', () => {
  it('records artifacts + lastRun without mutating fingerprints', async () => {
    const state: AgentState = createInitialState();
    state.nodesMeta['n1'] = {
      type: 'code',
      region: 'transform',
      gridPos: { col: 0, row: 0 },
      coords: { x: 1, y: 1 },
      configFingerprint: 'fp1',
      createdAt: 1,
    };
    const client = makeClient({
      execute_workflow: () => ({ success: true, order: ['n1'] }),
      get_execution_details: () => ({
        success: true,
        order: ['n1'],
        perNode: [{ id: 'n1', label: 'N', type: 'code', status: 'done', output: { v: 1 } }],
      }),
    });
    const res = await phaseCSafeExecute(client, state, { runId: 'r1', mockInput: { in: 1 } });
    expect(res.success).toBe(true);
    expect(state.executionHistory['r1']?.artifacts['n1']?.status).toBe('done');
    expect(state.nodesMeta['n1']?.lastRun?.status).toBe('done');
    expect(state.nodesMeta['n1']?.configFingerprint).toBe('fp1');
  });
});
