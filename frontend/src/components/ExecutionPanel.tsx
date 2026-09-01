import { useState, useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  executeWorkflow,
  toEngineNodes,
  toEngineEdges,
  type NodeStatus,
  type ExecResult,
} from '../engine';
import { NODE_DISPLAY_NAMES } from './nodes';
import { CheckIcon, CrossIcon, WarningIcon } from './icons';

function useJsonEditor(initial: string) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const validate = () => {
    try {
      JSON.parse(value);
      setError(null);
      return true;
    } catch {
      setError('Invalid JSON');
      return false;
    }
  };

  const parse = () => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  return { value, setValue, error, validate, parse };
}

interface Props {
  executionResult: ExecResult | null;
  isExecuting: boolean;
  nodes: Node[];
  edges: Edge[];
  addToolLog: (tool: string, input: any, result: any, actor?: 'agent' | 'you') => void;
  setExecutionResult: (r: ExecResult | null) => void;
  setIsExecuting: (v: boolean) => void;
  setLiveStatus: (updater: (prev: Record<string, NodeStatus>) => Record<string, NodeStatus>) => void;
}

function formatOutput(data: any): string {
  if (data === undefined) return '—';
  if (data === null) return 'null';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function triggerDownload(data: any, filename: string) {
  const payload = data?.data ?? data?.body ?? data;
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function getNodeLabel(nodes: Node[], nodeId: string): string {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return nodeId;
  const nodeType = (node.data?.nodeType as string) || 'start';
  return `${NODE_DISPLAY_NAMES[nodeType] || nodeType}: ${node.data?.label || nodeId}`;
}

export function ExecutionPanel({
  executionResult,
  isExecuting,
  nodes,
  edges,
  addToolLog,
  setExecutionResult,
  setIsExecuting,
  setLiveStatus,
}: Props) {
  const { value: inputValue, setValue: setInputValue, error: inputErrorValue, validate: validateInput, parse: parseInput } = useJsonEditor('{}');

  const runFlow = async () => {
    if (isExecuting || nodes.length === 0) return;
    setIsExecuting(true);
    setLiveStatus(() => ({}));
    let input: any = {};
    try {
      input = parseInput() || {};
    } catch {
      addToolLog('execute_workflow', {}, { error: 'input is not valid JSON' }, 'you');
      setIsExecuting(false);
      return;
    }
    if (!validateInput()) {
      addToolLog('execute_workflow', {}, { error: 'input is not valid JSON' }, 'you');
      setIsExecuting(false);
      return;
    }
    input = parseInput()!;

    try {
      const result = await executeWorkflow(toEngineNodes(nodes), toEngineEdges(edges), {
        input,
        onEvent: (e) =>
          setLiveStatus((prev) => ({ ...prev, [e.id]: e.status })),
      });
      setExecutionResult(result);
      addToolLog('execute_workflow', { input }, result, 'you');
      setTimeout(() => {
        const existing = document.querySelector('.run-complete-banner');
        if (existing) existing.remove();
        const banner = document.createElement('div');
        banner.className = 'run-complete-banner';
        banner.style.cssText = `
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          background: var(--amber); color: #1a1408; padding: 10px 20px;
          border-radius: var(--r-md); font-family: var(--font-mono);
          font-size: 12px; letter-spacing: 0.1em; z-index: 1000;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        banner.textContent = `Workflow complete — ${result.durationMs}ms total`;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 5000);
      }, 100);
    } catch (err: any) {
      const errResult: ExecResult = {
        success: false,
        executedAt: new Date().toISOString(),
        durationMs: 0,
        order: [],
        status: {},
        outputs: { error: err?.message },
      };
      setExecutionResult(errResult);
      addToolLog('execute_workflow', { input }, errResult, 'you');
    }
    setIsExecuting(false);
  };

  const validateWorkflow = () => {
    const engineNodes = toEngineNodes(nodes);
    const engineEdges = toEngineEdges(edges);
    const errors: string[] = [];
    engineEdges.forEach((e) => {
      if (!engineNodes.find((n) => n.id === e.source))
        errors.push(`wire references missing source ${e.source}`);
      if (!engineNodes.find((n) => n.id === e.target))
        errors.push(`wire references missing target ${e.target}`);
    });
    const result = { valid: errors.length === 0 && engineNodes.length > 0, errors };
    addToolLog('validate_workflow', {}, result, 'you');
  };

  // Build per-node result views
  const nodeResults = useMemo(() => {
    if (!executionResult) return [];
    const { outputs, status, order } = executionResult;
    return order.map((nodeId) => {
      const output = outputs[nodeId];
      const nodeStatus = status[nodeId];
      const label = getNodeLabel(nodes, nodeId);
      const isStart = nodeId === 'start' || nodeId.startsWith('start');
      return {
        nodeId,
        label,
        status: nodeStatus,
        output,
        isStart,
        hasOutput: output !== undefined && output !== null,
      };
    });
  }, [executionResult, nodes]);

  const finalOutputNode = useMemo(() => {
    if (!executionResult) return null;
    const { outputs, order } = executionResult;
    // Find the last non-start node that produced output
    for (let i = order.length - 1; i >= 0; i--) {
      const nodeId = order[i];
      if (nodeId !== 'start' && !nodeId.startsWith('start') && outputs[nodeId] !== undefined) {
        return { nodeId, output: outputs[nodeId], label: getNodeLabel(nodes, nodeId) };
      }
    }
    return null;
  }, [executionResult, nodes]);

  const [outputFilter, setOutputFilter] = useState('');
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);

  // auto-select final output when result changes, reset filter
  useMemo(() => {
    if (finalOutputNode) setSelectedOutputId(finalOutputNode.nodeId);
    else if (nodeResults.length) setSelectedOutputId(nodeResults.filter(r => !r.isStart)[0]?.nodeId ?? null);
    setOutputFilter('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionResult?.executedAt]);

  return (
    <div className="run-console">
      <div className="exec-stats">
        <div className="stat">
          <b>{nodes.length}</b>
          <span>Modules</span>
        </div>
        <div className="stat">
          <b>{edges.length}</b>
          <span>Wires</span>
        </div>
        <div className="stat">
          <b>{isExecuting ? '…' : executionResult ? (executionResult.success ? <CheckIcon size={14} /> : <CrossIcon size={14} />) : '—'}</b>
          <span>Status</span>
        </div>
      </div>

      <textarea
        className="exec-input"
        placeholder='{"key": "value"}'
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        rows={3}
        aria-label="Workflow input JSON"
      />
      {inputErrorValue && (
        <p className="exec-input-error" style={{ margin: '4px 0 8px', fontSize: '10px', color: 'var(--red)', background: 'rgba(224,93,68,0.1)', borderRadius: '3px', padding: '4px' }}>
          {inputErrorValue}
        </p>
      )}

      <div className="exec-actions">
        <button
          data-onboarding="run-button"
          className="btn-run"
          onClick={runFlow}
          disabled={isExecuting || nodes.length === 0}
        >
          {isExecuting ? 'RUNNING' : 'RUN'}
        </button>
        <button className="btn-ghost" onClick={validateWorkflow}>
          validate
        </button>
      </div>

      {executionResult ? (
        <div className="exec-result">
          <div className="exec-result-header">
            <h4>
              Output{executionResult.durationMs !== undefined ? ` · ${executionResult.durationMs}ms` : ''}
            </h4>
            <span className={`exec-status-badge ${executionResult.success ? 'success' : 'fault'}`}>
              {executionResult.success ? 'Completed' : 'Failed'}
            </span>
          </div>

          {finalOutputNode && (
            <div className="exec-final-output">
              <div className="exec-final-label">
                <span className="exec-final-kicker">Final output</span>
                <span className="exec-final-node">{finalOutputNode.label}</span>
              </div>
              <pre className="exec-final-data">{formatOutput(finalOutputNode.output?.delivered === 'download_ready' || finalOutputNode.output?.delivered === 'write_ready' ? finalOutputNode.output.data : finalOutputNode.output)}</pre>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn-ghost btn-small exec-copy-btn" onClick={() => navigator.clipboard.writeText(formatOutput(finalOutputNode.output?.data ?? finalOutputNode.output))}>
                  Copy JSON
                </button>
                {(finalOutputNode.output?.delivered === 'download_ready' || finalOutputNode.output?.delivered === 'write_ready') && (
                  <button className="btn-ghost btn-small" onClick={() => triggerDownload(finalOutputNode.output, finalOutputNode.output.filename || finalOutputNode.output.path || 'flow-output.json')}>
                    Download
                  </button>
                )}
              </div>
            </div>
          )}

          {(() => {
            const filtered = nodeResults.filter(r => !r.isStart).filter(r => {
              if (!outputFilter.trim()) return true;
              const q = outputFilter.toLowerCase();
              return r.label.toLowerCase().includes(q) || r.nodeId.toLowerCase().includes(q) || String(r.status).toLowerCase().includes(q);
            });
            const selected = filtered.find(r => r.nodeId === selectedOutputId) ?? filtered[0] ?? null;
            return (
              <div className="exec-output-nav-wrap">
                <div className="exec-output-nav-header">
                  <input
                    className="exec-output-filter"
                    placeholder="Filter nodes…"
                    value={outputFilter}
                    onChange={e => setOutputFilter(e.target.value)}
                    aria-label="Filter node outputs"
                  />
                  <span className="exec-output-count">{filtered.length} of {nodeResults.filter(r=>!r.isStart).length}</span>
                </div>
                <div className="exec-output-nav">
                  <div className="exec-output-nav-list" role="tablist" aria-label="Node outputs">
                    {filtered.length === 0 ? (
                      <div className="exec-output-empty">No matches for “{outputFilter}”</div>
                    ) : filtered.map(r => (
                      <button
                        key={r.nodeId}
                        role="tab"
                        aria-selected={selected?.nodeId === r.nodeId}
                        className={`exec-output-nav-item ${selected?.nodeId === r.nodeId ? 'active' : ''} status-${r.status}`}
                        onClick={() => setSelectedOutputId(r.nodeId)}
                        title={`${r.label} — ${r.status}`}
                      >
                        <span className={`exec-node-status-dot status-${r.status}`} />
                        <span className="exec-output-nav-label">{r.label}</span>
                        <span className="exec-output-nav-status">{r.status}</span>
                      </button>
                    ))}
                  </div>
                  <div className="exec-output-detail">
                    {!selected ? (
                      <div className="exec-output-empty">Select a node to view output</div>
                    ) : selected.hasOutput ? (
                      <>
                        <div className="exec-output-detail-head">
                          <span className={`exec-node-status-dot status-${selected.status}`} />
                          <span className="exec-output-detail-title">{selected.label}</span>
                          <span className="exec-output-detail-status">{selected.status}</span>
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                            <button className="btn-ghost btn-small" onClick={() => navigator.clipboard.writeText(formatOutput(selected.output?.data ?? selected.output))}>Copy</button>
                            {(selected.output?.delivered === 'download_ready' || selected.output?.delivered === 'write_ready') && (
                              <button className="btn-ghost btn-small" onClick={() => triggerDownload(selected.output, selected.output.filename || selected.output.path || 'flow-output.json')}>Download</button>
                            )}
                          </div>
                        </div>
                        <pre className="exec-output-detail-pre">{formatOutput(selected.output?.delivered === 'download_ready' || selected.output?.delivered === 'write_ready' ? selected.output.data : selected.output)}</pre>
                      </>
                    ) : (
                      <span className="exec-no-output">— no output —</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {executionResult.success === false && executionResult.outputs?.error && (
            <div className="exec-error">
              <span className="exec-error-icon"><WarningIcon size={12} /></span>
              <pre>{executionResult.outputs.error}</pre>
            </div>
          )}
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 10 }}>
          No run yet — press RUN to execute the workflow.
        </p>
      )}
    </div>
  );
}