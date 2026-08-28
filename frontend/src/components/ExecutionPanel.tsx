import { useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  executeWorkflow,
  toEngineNodes,
  toEngineEdges,
  type NodeStatus,
} from '../engine';

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
  executionResult: any;
  isExecuting: boolean;
  nodes: Node[];
  edges: Edge[];
  addToolLog: (tool: string, input: any, result: any, actor?: 'agent' | 'you') => void;
  setExecutionResult: (r: any) => void;
  setIsExecuting: (v: boolean) => void;
  setLiveStatus: (updater: (prev: Record<string, NodeStatus>) => Record<string, NodeStatus>) => void;
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
      // Show completion banner
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
        banner.textContent = `Workflow complete — ${result.durationMs !== undefined ? result.durationMs + 'ms' : ''} total`;
        document.body.appendChild(banner);
        // Auto-dismiss after 5 seconds
        setTimeout(() => banner.remove(), 5000);
      }, 100);
    } catch (err: any) {
      const errResult = { success: false, error: err?.message };
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
          <b>{isExecuting ? '…' : executionResult ? (executionResult.success ? '✓' : '✗') : '—'}</b>
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
          <h4>
            Output{executionResult.durationMs !== undefined ? ` · ${executionResult.durationMs}ms` : ''}
          </h4>
          <pre>{JSON.stringify(executionResult.outputs ?? executionResult, null, 2)}</pre>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 10 }}>
          No run yet — press RUN to execute the workflow.
        </p>
      )}
    </div>
  );
}
