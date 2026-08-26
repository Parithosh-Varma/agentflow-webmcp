import { useState } from 'react';
import type { Node, Edge } from '@xyflow/react';

const API_URL = import.meta.env.VITE_API_URL || '';

interface Props {
  executionResult: any;
  isExecuting: boolean;
  nodes: Node[];
  edges: Edge[];
  addToolLog: (tool: string, input: any, result: any) => void;
  setExecutionResult: (r: any) => void;
  setIsExecuting: (v: boolean) => void;
}

export function ExecutionPanel({ executionResult, isExecuting, nodes, edges, addToolLog, setExecutionResult, setIsExecuting }: Props) {
  const [workflowInput, setWorkflowInput] = useState('{}');

  const executeWorkflow = async () => {
    if (isExecuting || nodes.length === 0) return;
    setIsExecuting(true);
    try {
      const input = JSON.parse(workflowInput || '{}');
      const res = await fetch(`${API_URL}/api/execute-tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'execute_workflow', input: { input } }),
      });
      const result = await res.json();
      setExecutionResult(result);
      addToolLog('execute_workflow', { input }, result);
    } catch (e: any) {
      addToolLog('execute_workflow', {}, { error: e.message });
    }
    setIsExecuting(false);
  };

  const validateWorkflow = async () => {
    try {
      const res = await fetch(`${API_URL}/api/execute-tool`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'validate_workflow', input: {} }),
      });
      const result = await res.json();
      addToolLog('validate_workflow', {}, result);
    } catch (e: any) {
      addToolLog('validate_workflow', {}, { error: e.message });
    }
  };

  return (
    <div className="execution-panel">
      <h3>⚡ Execute</h3>

      <div className="exec-stats">
        <div className="stat">
          <span className="stat-value">{nodes.length}</span>
          <span className="stat-label">Nodes</span>
        </div>
        <div className="stat">
          <span className="stat-value">{edges.length}</span>
          <span className="stat-label">Edges</span>
        </div>
      </div>

      <textarea
        className="exec-input"
        placeholder='{"key": "value"}'
        value={workflowInput}
        onChange={e => setWorkflowInput(e.target.value)}
        rows={3}
      />

      <div className="exec-actions">
        <button className="exec-btn primary" onClick={executeWorkflow} disabled={isExecuting || nodes.length === 0}>
          {isExecuting ? '⏳ Running...' : '▶ Run Workflow'}
        </button>
        <button className="exec-btn secondary" onClick={validateWorkflow}>
          ✓ Validate
        </button>
      </div>

      {executionResult && (
        <div className="exec-result">
          <h4>Result</h4>
          <pre>{JSON.stringify(executionResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
