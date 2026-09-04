// Pseudo-debugging & execution monitoring for environments with no step-pause.
//
// Strategy: simulate breakpoints with Logger "tap" nodes + validator error
// boundaries, then reconstruct the step-by-step trace AFTER execution from
// get_execution_details. State diff logging (input/output hashes per node per
// run) gives variable inspection without live debugging.

import type { AgentState } from './state';
import { canonicalize, hashString, recordNodeLastRun } from './state';

/** Stable hash for any JSON-ish value (drift detection, artifact logging). */
export function hashValue(value: unknown): string {
  return hashString(canonicalize(value ?? null));
}

export interface TapSpec {
  /** Deterministic label so taps are idempotent across retries. */
  label: string;
  /** Node id (planned key) this tap observes. Resolved to real id at build. */
  afterKey: string;
  /** Valid logger-node config keys (level/message) — unknown keys warn at runtime. */
  config: { level?: string; message?: string };
}

/** Insert a capture logger after every transform/condition (tap nodes). */
export function planTapNodes(afterKeys: string[]): TapSpec[] {
  return afterKeys.map((key) => ({
    label: `tap:after_${key}`,
    afterKey: key,
    config: { level: 'info', message: `[tap] after_${key}` },
  }));
}

export interface ErrorBoundarySpec {
  validatorLabel: string;
  validatorConfig: Record<string, unknown>;
  outputLabel: string;
  outputConfig: Record<string, unknown>;
}

/** Wrap a risky branch: validator → on fault route to an output carrying the payload. */
export function planErrorBoundary(branchKey: string): ErrorBoundarySpec {
  return {
    validatorLabel: `guard:${branchKey}`,
    validatorConfig: { expression: `(data) => data !== null && data !== undefined` },
    outputLabel: `error:${branchKey}`,
    outputConfig: { kind: 'console' },
  };
}

export interface TraceStep {
  id: string;
  label: string;
  type: string;
  status: string;
  output?: unknown;
  error?: string;
  stack?: string;
}

export interface ExecutionDetailsLike {
  order?: unknown;
  perNode?: unknown;
  outputs?: unknown;
  status?: unknown;
}

/** Rebuild the ordered execution trace from a get_execution_details payload. */
export function reconstructTrace(details: ExecutionDetailsLike): TraceStep[] {
  const perNode = Array.isArray(details.perNode) ? (details.perNode as Array<Record<string, unknown>>) : [];
  if (perNode.length > 0) {
    return perNode.map((p) => ({
      id: String(p['id'] ?? ''),
      label: String(p['label'] ?? p['id'] ?? ''),
      type: String(p['type'] ?? 'unknown'),
      status: String(p['status'] ?? 'unknown'),
      output: p['output'],
      error: p['error'] !== undefined ? String(p['error']) : undefined,
      stack: p['stack'] !== undefined ? String(p['stack']) : undefined,
    }));
  }
  const order = Array.isArray(details.order) ? (details.order as string[]) : [];
  const outputs =
    details.outputs && typeof details.outputs === 'object'
      ? (details.outputs as Record<string, unknown>)
      : {};
  const statusMap =
    details.status && typeof details.status === 'object'
      ? (details.status as Record<string, string>)
      : {};
  return order.map((id) => {
    const out = outputs[id] as Record<string, unknown> | undefined;
    const err = out && typeof out === 'object' && 'error' in out ? String(out['error']) : undefined;
    return {
      id,
      label: id,
      type: 'unknown',
      status: statusMap[id] ?? 'unknown',
      output: out,
      error: err,
    };
  });
}

export interface DriftReport {
  nodeId: string;
  drifted: boolean;
  prevHash?: string;
  nextHash?: string;
}

/** Compare input hashes across two runs to detect upstream drift per node. */
export function detectDrift(
  prev: Record<string, { inputHash: string }>,
  next: Record<string, { inputHash: string }>,
): DriftReport[] {
  const ids = new Set<string>([...Object.keys(prev), ...Object.keys(next)]);
  return [...ids].map((nodeId) => {
    const p = prev[nodeId]?.inputHash;
    const n = next[nodeId]?.inputHash;
    return { nodeId, drifted: p !== n, prevHash: p, nextHash: n };
  });
}

export interface ArtifactInput {
  inputHash: string;
  outputHash: string;
  status: string;
  error?: string;
}

/** Persist per-node artifacts for a run + mirror status into nodesMeta.lastRun. */
export function recordTraceArtifacts(
  state: AgentState,
  runId: string,
  artifacts: Record<string, ArtifactInput>,
  now = Date.now(),
): void {
  if (!state.executionHistory[runId]) {
    state.executionHistory[runId] = { startedAt: now, nodes: Object.keys(artifacts), artifacts: {} };
  }
  const record = state.executionHistory[runId];
  for (const [nodeId, art] of Object.entries(artifacts)) {
    record.artifacts[nodeId] = { ...art };
    if (!record.nodes.includes(nodeId)) record.nodes.push(nodeId);
    recordNodeLastRun(state, nodeId, { status: art.status, at: now, error: art.error }, now);
  }
  state.lastUpdate = now;
}

/** Build artifact entries for a reconstructed trace given the run input. */
export function artifactsForTrace(steps: TraceStep[], runInput: unknown): Record<string, ArtifactInput> {
  const inputHash = hashValue(runInput ?? {});
  const out: Record<string, ArtifactInput> = {};
  for (const step of steps) {
    out[step.id] = {
      inputHash,
      outputHash: hashValue(step.output ?? null),
      status: step.status,
      ...(step.error ? { error: step.error } : {}),
    };
  }
  return out;
}
