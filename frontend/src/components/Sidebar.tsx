import { useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { GlobeIcon, TransformIcon, BranchIcon, SendIcon, ClockIcon } from './icons';

const NODE_TYPES = [
  { type: 'api_call', nodeType: 'apiCallNode', label: 'API Call', icon: <GlobeIcon size={13} />, color: '#8f9fdd' },
  { type: 'transform', nodeType: 'transformNode', label: 'Transform', icon: <TransformIcon size={13} />, color: '#e0b45c' },
  { type: 'condition', nodeType: 'conditionNode', label: 'Condition', icon: <BranchIcon size={13} />, color: '#d98aa6' },
  { type: 'output', nodeType: 'outputNode', label: 'Output', icon: <SendIcon size={13} />, color: '#6cc7ba' },
  { type: 'delay', nodeType: 'delayNode', label: 'Delay', icon: <ClockIcon size={13} />, color: '#ab97d4' },
];

interface Props {
  nodes: Node[];
  setNodes: any;
  setEdges: any;
  edges: Edge[];
  addToolLog: (tool: string, input: any, result: any, actor?: 'agent' | 'you') => void;
  clearRunState: () => void;
}

function buildExampleFlow(): { nodes: Node[]; edges: any[] } {
  const n = (id: string, type: string, x: number, y: number, label: string, config: any): Node => ({
    id,
    type: `${type}Node`,
    position: { x, y },
    data: { label, config, nodeType: type },
  });

  const nodes: Node[] = [
    n('start', 'start', 20, 130, 'Start', {}),
    n('ex_api', 'api_call', 240, 60, 'github repo', {
      url: 'https://api.github.com/repos/cloudflare/workers-sdk',
      method: 'GET',
    }),
    n('ex_tf', 'transform', 500, 60, 'pick stars', {
      op: 'expression',
      expression: '(data) => ({ full_name: data.full_name, stars: data.stargazers_count })',
    }),
    n('ex_cond', 'condition', 500, 210, 'popular?', {
      expression: '(data) => Number(data.stars) > 10000',
    }),
    n('ex_out_dl', 'output', 780, 120, 'save report', {
      kind: 'download',
      filename: 'repo-stars',
    }),
    n('ex_out_log', 'output', 780, 300, 'log it', { kind: 'console' }),
  ];

  const edges = [
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'start', target: 'ex_api', label: '' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'ex_api', target: 'ex_tf', label: '' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'ex_tf', target: 'ex_cond', label: '' },
    {
      id: `edge_${uuidv4().slice(0, 8)}`,
      source: 'ex_cond',
      target: 'ex_out_dl',
      label: 'true',
    },
    {
      id: `edge_${uuidv4().slice(0, 8)}`,
      source: 'ex_cond',
      target: 'ex_out_log',
      label: 'false',
    },
  ];

  return { nodes, edges };
}

export function Sidebar({ nodes, setNodes, setEdges, addToolLog, clearRunState }: Props) {
  const [label, setLabel] = useState('');

  const addNode = (type: string, nodeType: string) => {
    const nodeLabel = label || `${type}_${nodes.length}`;
    const newNode: Node = {
      id: `node_${uuidv4().slice(0, 8)}`,
      type: nodeType,
      position: { x: 200 + Math.random() * 300, y: 100 + Math.random() * 300 },
      data: { label: nodeLabel, config: {}, nodeType: type },
    };
    setNodes((nds: Node[]) => [...nds, newNode]);
    addToolLog('add_node', { type, label: nodeLabel }, { success: true, nodeId: newNode.id }, 'you');
    setLabel('');
  };

  const loadExample = () => {
    const { nodes: exNodes, edges: exEdges } = buildExampleFlow();
    clearRunState();
    setNodes(exNodes);
    setEdges(
      exEdges.map((e) => ({
        ...e,
        animated: false,
        style: { stroke: '#3a342c', strokeWidth: 1.6 },
      }))
    );
    addToolLog(
      'load_example',
      {},
      { success: true, message: 'Loaded "GitHub repo popularity" flow — press RUN' },
      'you'
    );
  };

  return (
    <aside className="sidebar">
      <div className="panel-section">
        <h3>Modules</h3>
        <input
          className="sidebar-input"
          placeholder="module name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <div className="node-grid">
          {NODE_TYPES.map((nt) => (
            <button
              key={nt.type}
              className="node-btn"
              onClick={() => addNode(nt.type, nt.nodeType)}
              title={`Add ${nt.label}`}
            >
              <span style={{ display: 'inline-flex', color: nt.color }}>{nt.icon}</span>
              <span>{nt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel-section">
        <h3>On Canvas</h3>
        <div className="node-list">
          {nodes.map((n) => (
            <div key={n.id} className="node-item">
              <span className="node-dot" style={{ background: '#8f867a' }} />
              <span>{String(n.data?.label)}</span>
              <span className="node-id">{n.id.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      </div>

      <button className="btn-example" onClick={loadExample}>
        load example flow
      </button>

      <p className="hint">
        Click a module to tune it. Label a condition's wires{' '}
        <code>true</code>/<code>false</code> to branch — or let your agent do all of it via{' '}
        <code>add_node</code> <code>connect_nodes</code> <code>run</code>.
      </p>
    </aside>
  );
}
