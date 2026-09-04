import { describe, it, expect, vi } from 'vitest';
import { executeWorkflow } from './engine';

vi.stubGlobal('fetch', async () => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ ok: true }),
}));

describe('engine: built-in nodes', () => {
  it('should execute api_call', async () => {
    const nodes = [{ id: 'n1', type: 'api_call', label: 'api', config: { url: 'https://example.com', method: 'GET' } }];
    const res = await executeWorkflow(nodes as any, [], { input: {} });
    expect(res.success).toBe(true);
  });

  it('should handle transform pick', async () => {
    const nodes = [{ id: 'n1', type: 'transform', label: 'pick', config: { op: 'pick', keys: 'a,b' } }];
    const res = await executeWorkflow(nodes as any, [], { input: { a: 1, b: 2, c: 3 } });
    expect(res.outputs['n1']).toEqual({ a: 1, b: 2 });
  });

  it('should handle code node via config', async () => {
    const nodes = [{ id: 'n1', type: 'code', label: 'upper', config: { code: `return { out: String(data.text).toUpperCase() }` } }];
    const res = await executeWorkflow(nodes as any, [], { input: { text: 'hello' } });
    expect(res.success).toBe(true);
    expect(res.outputs['n1'].out).toBe('HELLO');
  });

  it('should fault on invalid code', async () => {
    const nodes = [{ id: 'n1', type: 'code', label: 'bad', config: { code: `throw new Error('boom')` } }];
    const res = await executeWorkflow(nodes as any, [], { input: {} });
    expect(res.success).toBe(false);
    expect(res.status['n1']).toBe('fault');
  });

  it('should reject empty workflow', async () => {
    const res = await executeWorkflow([], []);
    expect(res.success).toBe(false);
    expect(res.outputs.error).toBe('No nodes in workflow');
    expect(res.order.length).toBe(0);
  });

  it('should skip downstream after upstream fault', async () => {
    const nodes = [
      { id: 'a', type: 'code', label: 'a', config: { code: `throw new Error('fail')` } },
      { id: 'b', type: 'noop', label: 'b', config: {} },
    ];
    const edges = [{ id: 'e1', source: 'a', target: 'b' }];
    const res = await executeWorkflow(nodes as any, edges as any, { input: {} });
    expect(res.status['a']).toBe('fault');
    expect(res.status['b']).toBe('skipped');
    expect(res.outputs['b'].skipped).toBe(true);
    expect(res.success).toBe(false);
  });

  it('should skip false branch of condition', async () => {
    const nodes = [
      { id: 'cond', type: 'condition', label: 'c', config: { path: 'flag', equals: true } },
      { id: 't', type: 'noop', label: 't' },
      { id: 'f', type: 'noop', label: 'f' },
    ];
    const edges = [
      { id: 'e1', source: 'cond', target: 't', label: 'true' },
      { id: 'e2', source: 'cond', target: 'f', label: 'false' },
    ];
    const res = await executeWorkflow(nodes as any, edges as any, { input: { flag: false } });
    expect(res.status['cond']).toBe('done');
    expect(res.outputs['cond'].passed).toBe(false);
    expect(res.status['t']).toBe('skipped');
    expect(res.status['f']).toBe('done');
  });

  it('should return partial outputs on fault', async () => {
    const nodes = [
      { id: 'a', type: 'transform', label: 'a', config: { op: 'pick', keys: 'x' } },
      { id: 'b', type: 'code', label: 'b', config: { code: `throw new Error('boom')` } },
      { id: 'c', type: 'noop', label: 'c' },
    ];
    const edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ];
    const res = await executeWorkflow(nodes as any, edges as any, { input: { x: 1 } });
    expect(res.success).toBe(false);
    expect(res.status['a']).toBe('done');
    expect(res.outputs['a']).toEqual({ x: 1 });
    expect(res.status['b']).toBe('fault');
    expect(res.status['c']).toBe('skipped');
  });
});
