import { describe, it, expect } from 'vitest';
import {
  allocateNode,
  canonicalize,
  coordsToGrid,
  createInitialState,
  createMemoryStorage,
  fingerprintConfig,
  getBackup,
  gridToCoords,
  loadState,
  logicalPathFor,
  nextSlot,
  recordEdge,
  regionForCoords,
  saveState,
  snapshotBackup,
  updateState,
  AGENT_STATE_KEY,
} from './state';

describe('agent/state: fingerprinting', () => {
  it('is stable regardless of key order', () => {
    expect(fingerprintConfig({ b: 2, a: 1 })).toBe(fingerprintConfig({ a: 1, b: 2 }));
  });
  it('changes when values change', () => {
    expect(fingerprintConfig({ a: 1 })).not.toBe(fingerprintConfig({ a: 2 }));
  });
  it('canonicalizes nested objects with sorted keys', () => {
    expect(canonicalize({ z: [3, 2], a: { d: 1, c: 2 } })).toBe(
      canonicalize({ a: { c: 2, d: 1 }, z: [3, 2] }),
    );
  });
  it('treats empty/missing config identically', () => {
    expect(fingerprintConfig({})).toBe(fingerprintConfig(undefined));
  });
});

describe('agent/state: spatial model', () => {
  it('maps coords to the spec regions', () => {
    const s = createInitialState();
    expect(regionForCoords(s, { x: 100, y: 100 })).toBe('ingest');
    expect(regionForCoords(s, { x: 640, y: 280 })).toBe('transform');
    expect(regionForCoords(s, { x: 1500, y: 100 })).toBe('output');
  });
  it('round-trips grid <-> coords inside the region bounds', () => {
    const s = createInitialState();
    const coords = gridToCoords(s, 'transform', { col: 4, row: 2 });
    expect(coords.x).toBeGreaterThanOrEqual(420);
    expect(coords.x).toBeLessThanOrEqual(1200);
    const back = coordsToGrid(s, 'transform', coords);
    expect(back).toEqual({ col: 4, row: 2 });
  });
  it('allocates nextCol per row', () => {
    const s = createInitialState();
    expect(nextSlot(s, 'transform', 0)).toEqual({ col: 0, row: 0 });
    allocateNode(s, { nodeId: 'a', type: 'transform', region: 'transform', gridPos: { col: 0, row: 0 } });
    allocateNode(s, { nodeId: 'b', type: 'transform', region: 'transform', gridPos: { col: 1, row: 0 } });
    expect(nextSlot(s, 'transform', 0)).toEqual({ col: 2, row: 0 });
  });
  it('derives missing region/grid/coords consistently', () => {
    const s = createInitialState();
    const meta = allocateNode(s, { nodeId: 'n', type: 'transform', coords: { x: 640, y: 280 } });
    expect(meta.region).toBe('transform');
    expect(meta.gridPos).toEqual(coordsToGrid(s, 'transform', { x: 640, y: 280 }));
    expect(meta.configFingerprint).toBe(fingerprintConfig({}));
  });
});

describe('agent/state: persistence', () => {
  it('round-trips through storage', () => {
    const store = createMemoryStorage();
    const s = createInitialState();
    allocateNode(s, { nodeId: 'n1', type: 'api_call', region: 'ingest' });
    saveState(s, store);
    const loaded = loadState(store);
    expect(loaded.nodesMeta['n1']?.type).toBe('api_call');
    expect(store.getItem(AGENT_STATE_KEY)).toContain('nodesMeta');
  });
  it('returns fresh state on corrupt payload', () => {
    const store = createMemoryStorage({ [AGENT_STATE_KEY]: '{not-json' });
    expect(loadState(store).schemaVersion).toBe('v2');
  });
  it('updateState mutates + persists', () => {
    const store = createMemoryStorage();
    const out = updateState((s) => {
      allocateNode(s, { nodeId: 'k', type: 'code' });
    }, store);
    expect(out.nodesMeta['k']).toBeDefined();
    expect(loadState(store).nodesMeta['k']).toBeDefined();
  });
  it('records edges with logical paths and backups', () => {
    const s = createInitialState();
    recordEdge(s, 'e1', 'A', 'B', 'true');
    recordEdge(s, 'e2', 'B', 'C');
    expect(s.edgesMeta['e1']?.logicalPath).toBe('A->B');
    expect(s.edgesMeta['e2']?.logicalPath).toBe('A->B->C');
    expect(logicalPathFor(s.edgesMeta, 'A', 'C')).toBe('A->B->C');
    snapshotBackup(s, 'run1', '{"nodes":[]}');
    expect(getBackup(s, 'run1')?.workflowJson).toBe('{"nodes":[]}');
  });
});
