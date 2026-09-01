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

  it('should handle custom node via code', async () => {
    const nodes = [{ id: 'n1', type: 'custom_upper', label: 'upper', config: { prefix: 'Hi ' } }];
    const code = `return { out: (config.prefix||'') + String(data.text).toUpperCase() }`;
    const res = await executeWorkflow(nodes as any, [], { input: { text: 'hello' }, customCode: code });
    expect(res.success).toBe(true);
    expect(res.outputs['n1'].out).toBe('Hi HELLO');
  });

  it('should block dangerous patterns', async () => {
    const nodes = [{ id: 'n1', type: 'custom_bad', label: 'bad', config: {} }];
    const code = `while(true){}`;
    const res = await executeWorkflow(nodes as any, [], { input: {}, customCode: code });
    expect(res.success).toBe(false);
  });
});
