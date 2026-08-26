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
    setToolLogs(prev => [...prev, { tool, input, result, time: new Date().toLocaleTimeString() }]);
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds: any[]) => addEdge({ ...params, animated: true }, eds));
    },
    [setEdges]
  );

  const syncToBackend = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/workflow`);
      const data = await res.json();
      if (data.nodes?.length > 0) {
        const mappedNodes = data.nodes.map((n: any) => ({
          id: n.id,
          type: `${n.type}Node`,
          position: n.position || { x: 250, y: 150 },
          data: { label: n.label, config: n.config, nodeType: n.type },
        }));
        const mappedEdges = data.edges.map((e: any) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.label,
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        }));
        setNodes(mappedNodes);
        setEdges(mappedEdges);
      }
    } catch (e) {
      console.log('Backend not connected yet, using local state');
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    syncToBackend();
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
  }, [nodes, edges, syncToBackend, addToolLog, setNodes, setEdges]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <h1>AgentFlow</h1>
          </div>
          <span className="tagline">Visual Workflow Builder × WebMCP</span>
        </div>
        <div className="header-right">
          <span className="tool-count">{nodes.length} nodes · {edges.length} connections</span>
        </div>
      </header>

      <div className="main">
        <Sidebar
          nodes={nodes}
          setNodes={setNodes}
          setEdges={setEdges}
          edges={edges}
          addToolLog={addToolLog}
        />

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
