import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  type Connection,
  type Node,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { registerWebMCPTools } from './webmcp';
import { Sidebar } from './components/Sidebar';
import { ExecutionPanel } from './components/ExecutionPanel';
import { ToolLog } from './components/ToolLog';
import { nodeTypes } from './components/nodes';
import { BoltIcon } from './components/icons';
import './App.css';

const initialNodes: Node[] = [
  {
    id: 'start',
    type: 'startNode',
    position: { x: 50, y: 200 },
    data: { label: 'Start', config: {} },
  },
];

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any[]);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [toolLogs, setToolLogs] = useState<Array<{ tool: string; input: any; result: any; time: string }>>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  const addToolLog = useCallback((tool: string, input: any, result: any) => {
    setToolLogs((prev) => [...prev, { tool, input, result, time: new Date().toLocaleTimeString() }]);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds: any[]) => addEdge({ ...params, animated: true }, eds));
    },
    [setEdges]
  );

  useEffect(() => {
    const cleanup = registerWebMCPTools({
      nodes,
      edges,
      setNodes,
      setEdges,
      addToolLog,
      setExecutionResult,
      setIsExecuting,
    });
    return cleanup;
  }, [nodes, edges, addToolLog, setNodes, setEdges]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon"><BoltIcon size={18} /></span>
            <h1>AgentFlow</h1>
          </div>
          <span className="tagline">Visual Workflow Builder × WebMCP</span>
        </div>
        <div className="header-right">
          <span className="tool-count">
            {nodes.length} nodes · {edges.length} connections · 8 WebMCP tools
          </span>
        </div>
      </header>

      <div className="main">
        <Sidebar nodes={nodes} setNodes={setNodes} setEdges={setEdges} edges={edges} addToolLog={addToolLog} />

        <div className="canvas-area">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ background: '#0f0f1a' }}
          >
            <Controls style={{ background: '#1a1a2e', borderRadius: 8, border: '1px solid #2a2a4a' }} />
            <MiniMap
              nodeColor="#6366f1"
              style={{ background: '#1a1a2e', borderRadius: 8, border: '1px solid #2a2a4a' }}
              maskColor="rgba(0,0,0,0.7)"
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#2a2a4a" />
          </ReactFlow>
        </div>

        <div className="right-panel">
          <ExecutionPanel
            executionResult={executionResult}
            isExecuting={isExecuting}
            nodes={nodes}
            edges={edges}
            addToolLog={addToolLog}
            setExecutionResult={setExecutionResult}
            setIsExecuting={setIsExecuting}
          />
          <ToolLog logs={toolLogs} />
        </div>
      </div>
    </div>
  );
}

export default App;
