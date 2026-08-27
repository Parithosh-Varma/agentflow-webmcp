import { useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  executeWorkflow,
  toEngineNodes,
  toEngineEdges,
  type NodeStatus,
} from '../engine';

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
  const [workflowInput, setWorkflowInput] = useState('{}');

  const runFlow = async () => {
    if (isExecuting || nodes.length === 0) return;
    setIsExecuting(true);
    setLiveStatus(() => ({}));
    let input: any = {};
    try {
      input = JSON.parse(workflowInput || '{}');
    } catch {
      addToolLog('execute_workflow', {}, { error: 'input is not valid JSON' }, 'you');
      setIsExecuting(false);
      return;
    }

    try {
      const result = await executeWorkflow(toEngineNodes(nodes), toEngineEdges(edges), {
        input,
        onEvent: (e) =>
          setLiveStatus((prev) => ({ ...prev, [e.id]: e.status })),
      });
      setExecutionResult(result);
      addToolLog('execute_workflow', { input }, result, 'you');
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
        value={workflowInput}
        onChange={(e) => setWorkflowInput(e.target.value)}
        rows={3}
        aria-label="Workflow input JSON"
      />

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
