import { useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { GlobeIcon, TransformIcon, BranchIcon, SendIcon, ClockIcon } from './icons';

const NODE_TYPES = [
  { type: 'api_call', nodeType: 'apiCallNode', label: 'API Call', icon: <GlobeIcon size={13} />, color: '#6366f1' },
  { type: 'transform', nodeType: 'transformNode', label: 'Transform', icon: <TransformIcon size={13} />, color: '#f59e0b' },
  { type: 'condition', nodeType: 'conditionNode', label: 'Condition', icon: <BranchIcon size={13} />, color: '#ec4899' },
  { type: 'output', nodeType: 'outputNode', label: 'Output', icon: <SendIcon size={13} />, color: '#14b8a6' },
  { type: 'delay', nodeType: 'delayNode', label: 'Delay', icon: <ClockIcon size={13} />, color: '#8b5cf6' },
];

interface Props {
  nodes: Node[];
  setNodes: any;
  setEdges: any;
  edges: Edge[];
  addToolLog: (tool: string, input: any, result: any, actor?: 'agent' | 'you') => void;
}

export function Sidebar({ nodes, setNodes, addToolLog }: Props) {
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

      <p className="hint">
        Drag wires between pins to route data — or let your agent do it:{' '}
        <code>add_node</code> <code>connect_nodes</code> <code>run</code>.
      </p>
    </aside>
  );
}
