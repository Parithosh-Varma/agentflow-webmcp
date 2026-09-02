import { describe, it, expect } from 'vitest';
import { executeWorkflow } from './engine';

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
});
