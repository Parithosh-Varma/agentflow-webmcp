import { useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';

const NODE_TYPES = [
  { type: 'api_call', nodeType: 'apiCallNode', label: 'API Call', icon: '🌐', color: '#6366f1' },
  { type: 'transform', nodeType: 'transformNode', label: 'Transform', icon: '⚙', color: '#f59e0b' },
  { type: 'condition', nodeType: 'conditionNode', label: 'Condition', icon: '◆', color: '#ec4899' },
  { type: 'output', nodeType: 'outputNode', label: 'Output', icon: '📤', color: '#14b8a6' },
  { type: 'delay', nodeType: 'delayNode', label: 'Delay', icon: '⏱', color: '#8b5cf6' },
];

interface Props {
  nodes: Node[];
  setNodes: any;
  setEdges: any;
  edges: Edge[];
  addToolLog: (tool: string, input: any, result: any) => void;
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
    addToolLog('add_node', { type, label: nodeLabel }, { success: true, nodeId: newNode.id });
    setLabel('');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <h3>Add Node</h3>
        <input
          className="sidebar-input"
          placeholder="Node label..."
          value={label}
          onChange={e => setLabel(e.target.value)}
        />
        <div className="node-grid">
          {NODE_TYPES.map(nt => (
            <button
              key={nt.type}
              className="node-btn"
              style={{ borderColor: nt.color + '40' }}
              onClick={() => addNode(nt.type, nt.nodeType)}
            >
              <span>{nt.icon}</span>
              <span>{nt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <h3>Canvas ({nodes.length} nodes)</h3>
        <div className="node-list">
          {nodes.map(n => (
            <div key={n.id} className="node-item">
              <span className="node-dot" style={{ background: '#6366f1' }} />
              <span>{String(n.data?.label)}</span>
              <span className="node-id">{n.id.slice(0, 12)}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
