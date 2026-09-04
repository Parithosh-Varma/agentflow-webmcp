// AgentFlow agentic builder — State & Canvas Abstraction Layer.
//
// Single source of truth (`agentflow_state_v2`) that reconstructs the spatial +
// execution mental model. Kept separate from workflow JSON so blind, stateless
// tool calls can reason in regions + grid cells instead of raw x/y.
//
// Write-through contract (enforced by builder/harness, not here):
//   every add_node / connect_nodes / update_node_config is followed by
//   save_workflow + localStorage.setItem(agentflow_state_v2, ...).

export const AGENT_STATE_KEY = 'agentflow_state_v2';
export const SCHEMA_VERSION = 'v2';

export interface GridPos {
  col: number;
  row: number;
}

export interface Coords {
  x: number;
  y: number;
}

export interface RegionBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export type RegionName = 'ingest' | 'transform' | 'output' | (string & {});

export interface NodeLastRun {
  status: string;
  at: number;
  durationMs?: number;
  error?: string;
}

export interface NodeMeta {
  type: string;
  role?: string;
  intent?: string;
  region: string;
  gridPos: GridPos;
  coords: Coords;
  configFingerprint: string;
  createdAt: number;
  lastRun?: NodeLastRun;
}

export interface EdgeMeta {
  source: string;
  target: string;
  label?: string;
  logicalPath?: string;
}

export interface RunArtifacts {
  inputHash: string;
  outputHash: string;
  status: string;
  error?: string;
}

export interface RunRecord {
  startedAt: number;
  nodes: string[];
  artifacts: Record<string, RunArtifacts>;
}

export interface ToolCapability {
  supportedConfigKeys: string[];
  requiredKeys?: string[];
  optionalKeys?: string[];
  knownLimits?: Record<string, unknown>;
  rejects?: string[];
  exampleConfig?: Record<string, unknown>;
}

export interface WorkflowBackup {
  at: number;
  workflowJson: string;
}

export interface AgentState {
  schemaVersion: string;
  lastUpdate: number;
  spatialIndex: {
    grid: { cols: number; rowHeight: number };
    regions: Record<string, RegionBounds>;
  };
  nodesMeta: Record<string, NodeMeta>;
  edgesMeta: Record<string, EdgeMeta>;
  executionHistory: Record<string, RunRecord>;
  toolCapabilities: Record<string, ToolCapability>;
  backups?: Record<string, WorkflowBackup>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function defaultStorage(): StorageLike | undefined {
  try {
    const ls =
      typeof globalThis !== 'undefined'
        ? (globalThis as unknown as { localStorage?: StorageLike }).localStorage
        : undefined;
    if (ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function') return ls;
  } catch {
    // storage unavailable (SSR / sandbox) — callers fall back to memory
  }
  return undefined;
}

export const DEFAULT_REGIONS: Record<string, RegionBounds> = {
  ingest: { xMin: 0, xMax: 400, yMin: 0, yMax: 400 },
  transform: { xMin: 420, xMax: 1200, yMin: 0, yMax: 600 },
  output: { xMin: 1220, xMax: 2000, yMin: 0, yMax: 400 },
};

export const DEFAULT_GRID = { cols: 12, rowHeight: 140 };

export function createInitialState(
  overrides: Partial<AgentState> = {},
  now = Date.now(),
): AgentState {
  return {
    schemaVersion: SCHEMA_VERSION,
    lastUpdate: now,
    spatialIndex: {
      grid: { ...DEFAULT_GRID, ...(overrides.spatialIndex?.grid ?? {}) },
      regions: { ...DEFAULT_REGIONS, ...(overrides.spatialIndex?.regions ?? {}) },
    },
    nodesMeta: { ...(overrides.nodesMeta ?? {}) },
    edgesMeta: { ...(overrides.edgesMeta ?? {}) },
    executionHistory: { ...(overrides.executionHistory ?? {}) },
    toolCapabilities: { ...(overrides.toolCapabilities ?? {}) },
    backups: { ...(overrides.backups ?? {}) },
  };
}

function isAgentState(value: unknown): value is AgentState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v['schemaVersion'] === SCHEMA_VERSION &&
    typeof v['spatialIndex'] === 'object' &&
    typeof v['nodesMeta'] === 'object' &&
    typeof v['edgesMeta'] === 'object'
  );
}

export function loadState(storage?: StorageLike, now = Date.now()): AgentState {
  const store = storage ?? defaultStorage();
  if (!store) return createInitialState({}, now);
  try {
    const raw = store.getItem(AGENT_STATE_KEY);
    if (!raw) return createInitialState({}, now);
    const parsed: unknown = JSON.parse(raw);
    if (isAgentState(parsed)) return parsed;
    return createInitialState({}, now);
  } catch {
    return createInitialState({}, now);
  }
}

export function saveState(state: AgentState, storage?: StorageLike): void {
  const store = storage ?? defaultStorage();
  if (!store) return;
  try {
    store.setItem(AGENT_STATE_KEY, JSON.stringify({ ...state, lastUpdate: Date.now() }));
  } catch {
    // quota / sandbox — state stays in memory for this session
  }
}

/** Load → mutate → touch lastUpdate → save. Returns the mutated state. */
export function updateState(
  mutator: (state: AgentState) => void,
  storage?: StorageLike,
  now = Date.now(),
): AgentState {
  const state = loadState(storage, now);
  mutator(state);
  state.lastUpdate = Date.now();
  saveState(state, storage);
  return state;
}

// ---- canonicalization + fingerprinting --------------------------------------
// Sync deterministic hash (cyrb53) over canonically-stringified config.
// Swap for async sha256 (SubtleCrypto) if cryptographic strength is needed;
// for idempotency keys, stability matters more than collision resistance.

export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
  }
  const asJson = JSON.stringify(value);
  return asJson === undefined ? 'null' : asJson;
}

/** 53-bit cyrb53 hash rendered as 16-char hex. Deterministic across runs. */
export function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const lo = (h2 >>> 0).toString(16).padStart(8, '0');
  const hi = (h1 >>> 0).toString(16).padStart(8, '0');
  return `${hi}${lo}`;
}

/** Idempotency key for a node config. Compare before mutating to skip no-ops. */
export function fingerprintConfig(config: unknown): string {
  return hashString(canonicalize(config ?? {}));
}

export function isSameFingerprint(a: string, b: string): boolean {
  return a === b;
}

// ---- spatial mental model ----------------------------------------------------
// Never reason in raw x/y: map to region + gridPos. Next node = region.nextCol(row).

export function regionForCoords(state: AgentState, coords: Coords): string {
  const regions = state.spatialIndex.regions;
  for (const [name, b] of Object.entries(regions)) {
    if (coords.x >= b.xMin && coords.x <= b.xMax && coords.y >= b.yMin && coords.y <= b.yMax) {
      return name;
    }
  }
  // Fallback: nearest region by horizontal center distance.
  let best = 'transform';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [name, b] of Object.entries(regions)) {
    const cx = (b.xMin + b.xMax) / 2;
    const dist = Math.abs(coords.x - cx);
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }
  return best;
}

export function coordsToGrid(state: AgentState, region: string, coords: Coords): GridPos {
  const bounds = state.spatialIndex.regions[region] ?? DEFAULT_REGIONS.transform;
  const cols = Math.max(1, state.spatialIndex.grid.cols);
  const rowHeight = Math.max(1, state.spatialIndex.grid.rowHeight);
  const width = Math.max(1, bounds.xMax - bounds.xMin);
  const col = Math.min(cols - 1, Math.max(0, Math.floor(((coords.x - bounds.xMin) / width) * cols)));
  const row = Math.max(0, Math.floor((coords.y - bounds.yMin) / rowHeight));
  return { col, row };
}

export function gridToCoords(state: AgentState, region: string, gridPos: GridPos): Coords {
  const bounds = state.spatialIndex.regions[region] ?? DEFAULT_REGIONS.transform;
  const cols = Math.max(1, state.spatialIndex.grid.cols);
  const rowHeight = Math.max(1, state.spatialIndex.grid.rowHeight);
  const width = Math.max(1, bounds.xMax - bounds.xMin);
  const col = Math.min(cols - 1, Math.max(0, gridPos.col));
  const row = Math.max(0, gridPos.row);
  const x = Math.round(bounds.xMin + ((col + 0.5) / cols) * width);
  const y = Math.round(bounds.yMin + row * rowHeight + rowHeight / 2);
  return { x, y };
}

/** Next free cell in a region row: max used col + 1, wrapping to the next row. */
export function nextSlot(state: AgentState, region: string, row = 0): GridPos {
  const cols = Math.max(1, state.spatialIndex.grid.cols);
  const used = Object.values(state.nodesMeta)
    .filter((m) => m.region === region && m.gridPos.row === row)
    .map((m) => m.gridPos.col);
  const nextCol = used.length === 0 ? 0 : Math.max(...used) + 1;
  if (nextCol < cols) return { col: nextCol, row };
  return { col: 0, row: row + 1 };
}

export interface AllocateNodeInput {
  nodeId: string;
  type: string;
  role?: string;
  intent?: string;
  region?: string;
  gridPos?: GridPos;
  coords?: Coords;
  config?: Record<string, unknown>;
  now?: number;
}

/**
 * Pre-allocate a node slot in state BEFORE any tool call (plan → allocate).
 * Derives whichever of region/gridPos/coords is missing so all three agree.
 */
export function allocateNode(state: AgentState, input: AllocateNodeInput): NodeMeta {
  const now = input.now ?? Date.now();
  const region = input.region ?? (input.coords ? regionForCoords(state, input.coords) : 'transform');
  let gridPos: GridPos;
  let coords: Coords;
  if (input.gridPos && input.coords) {
    gridPos = input.gridPos;
    coords = input.coords;
  } else if (input.gridPos) {
    gridPos = input.gridPos;
    coords = gridToCoords(state, region, gridPos);
  } else if (input.coords) {
    coords = input.coords;
    gridPos = coordsToGrid(state, region, coords);
  } else {
    gridPos = nextSlot(state, region, 0);
    coords = gridToCoords(state, region, gridPos);
  }
  const meta: NodeMeta = {
    type: input.type,
    role: input.role,
    intent: input.intent,
    region,
    gridPos,
    coords,
    configFingerprint: fingerprintConfig(input.config ?? {}),
    createdAt: now,
  };
  state.nodesMeta[input.nodeId] = meta;
  state.lastUpdate = now;
  return meta;
}

/** Full ancestor chain root→…→target (for fault isolation across layers). */
export function ancestorPathFor(edgesMeta: Record<string, EdgeMeta>, target: string): string {
  const predecessors = new Map<string, string>();
  for (const edge of Object.values(edgesMeta)) {
    if (!predecessors.has(edge.target)) predecessors.set(edge.target, edge.source);
  }
  const path = [target];
  const seen = new Set<string>([target]);
  let cursor = target;
  while (path.length <= 64) {
    const prev = predecessors.get(cursor);
    if (!prev || seen.has(prev)) break;
    seen.add(prev);
    path.unshift(prev);
    cursor = prev;
  }
  return path.join('->');
}
export function logicalPathFor(
  edgesMeta: Record<string, EdgeMeta>,
  source: string,
  target: string,
): string {
  const predecessors = new Map<string, string>();
  for (const edge of Object.values(edgesMeta)) {
    if (!predecessors.has(edge.target)) predecessors.set(edge.target, edge.source);
  }
  const path = [target];
  let cursor: string | undefined = target;
  const seen = new Set<string>([target]);
  while (cursor !== source) {
    const prev = predecessors.get(cursor!);
    if (!prev || seen.has(prev)) break;
    seen.add(prev);
    path.unshift(prev);
    cursor = prev;
    if (path.length > 64) break;
  }
  if (path[0] !== source) return `${source}->${target}`;
  return path.join('->');
}

export function recordEdge(
  state: AgentState,
  edgeId: string,
  source: string,
  target: string,
  label = '',
  now = Date.now(),
): EdgeMeta {
  const meta: EdgeMeta = {
    source,
    target,
    label,
    logicalPath: '',
  };
  state.edgesMeta[edgeId] = meta;
  meta.logicalPath = ancestorPathFor(state.edgesMeta, target);
  state.lastUpdate = now;
  return meta;
}

export function recordNodeLastRun(
  state: AgentState,
  nodeId: string,
  lastRun: NodeLastRun,
  now = Date.now(),
): void {
  const meta = state.nodesMeta[nodeId];
  if (!meta) return;
  meta.lastRun = lastRun;
  state.lastUpdate = now;
}

export function recordRunStart(
  state: AgentState,
  runId: string,
  nodes: string[],
  now = Date.now(),
): RunRecord {
  const record: RunRecord = { startedAt: now, nodes: [...nodes], artifacts: {} };
  state.executionHistory[runId] = record;
  state.lastUpdate = now;
  return record;
}

export function recordRunArtifacts(
  state: AgentState,
  runId: string,
  nodeId: string,
  artifacts: RunArtifacts,
  now = Date.now(),
): void {
  const record = state.executionHistory[runId];
  if (!record) {
    state.executionHistory[runId] = { startedAt: now, nodes: [nodeId], artifacts: { [nodeId]: artifacts } };
  } else {
    record.artifacts[nodeId] = artifacts;
    if (!record.nodes.includes(nodeId)) record.nodes.push(nodeId);
  }
  state.lastUpdate = now;
}

export function recordCapability(
  state: AgentState,
  nodeType: string,
  capability: ToolCapability,
  now = Date.now(),
): void {
  state.toolCapabilities[nodeType] = capability;
  state.lastUpdate = now;
}

export function snapshotBackup(
  state: AgentState,
  runId: string,
  workflowJson: string,
  now = Date.now(),
): void {
  state.backups = state.backups ?? {};
  state.backups[runId] = { at: now, workflowJson };
  state.lastUpdate = now;
}

export function getBackup(state: AgentState, runId: string): WorkflowBackup | undefined {
  return state.backups?.[runId];
}
