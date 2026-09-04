import { describe, it, expect } from 'vitest';
import {
  artifactsForTrace,
  detectDrift,
  hashValue,
  planErrorBoundary,
  planTapNodes,
  reconstructTrace,
  recordTraceArtifacts,
} from './trace';
import { createInitialState } from './state';

describe('agent/trace: tap + boundary planning', () => {
  it('creates one capture logger per transform/condition', () => {
    const taps = planTapNodes(['dedup', 'route']);
    expect(taps).toHaveLength(2);
    expect(taps[0]?.label).toBe('tap:after_dedup');
    expect(taps[0]?.config).toMatchObject({ level: 'info', message: '[tap] after_dedup' });
  });
  it('wraps risky branches with validator → output', () => {
    const guard = planErrorBoundary('enrich');
    expect(guard.validatorLabel).toBe('guard:enrich');
    expect(guard.outputLabel).toBe('error:enrich');
    expect(guard.outputConfig['kind']).toBe('console');
  });
});

describe('agent/trace: reconstruction', () => {
  it('rebuilds ordered steps from perNode details', () => {
    const steps = reconstructTrace({
      order: ['a', 'b'],
      perNode: [
        { id: 'a', label: 'A', type: 'code', status: 'done', output: { v: 1 } },
        { id: 'b', label: 'B', type: 'output', status: 'fault', output: { error: 'boom' }, error: 'boom' },
      ],
    });
    expect(steps.map((s) => s.id)).toEqual(['a', 'b']);
    expect(steps[1]?.error).toBe('boom');
  });
  it('falls back to order/outputs/status maps', () => {
    const steps = reconstructTrace({
      order: ['a'],
      outputs: { a: { v: 1 } },
      status: { a: 'done' },
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.status).toBe('done');
  });
});

describe('agent/trace: drift + artifacts', () => {
  it('hashes deterministically', () => {
    expect(hashValue({ b: 1, a: 2 })).toBe(hashValue({ a: 2, b: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
  it('detects input drift between runs', () => {
    const report = detectDrift({ n: { inputHash: 'a' } }, { n: { inputHash: 'b' }, m: { inputHash: 'c' } });
    expect(report.find((r) => r.nodeId === 'n')?.drifted).toBe(true);
    expect(report.find((r) => r.nodeId === 'm')?.drifted).toBe(true);
  });
  it('records artifacts + mirrors lastRun', () => {
    const s = createInitialState();
    s.nodesMeta['n'] = {
      type: 'code',
      region: 'transform',
      gridPos: { col: 0, row: 0 },
      coords: { x: 1, y: 1 },
      configFingerprint: 'x',
      createdAt: 1,
    };
    const steps = [{ id: 'n', label: 'n', type: 'code', status: 'done', output: { v: 1 } }];
    recordTraceArtifacts(s, 'run1', artifactsForTrace(steps, { in: 1 }));
    expect(s.executionHistory['run1']?.artifacts['n']?.status).toBe('done');
    expect(s.nodesMeta['n']?.lastRun?.status).toBe('done');
  });
});
