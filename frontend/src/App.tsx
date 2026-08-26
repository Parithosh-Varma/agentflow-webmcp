import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type Connection,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { registerWebMCPTools } from './webmcp';
import { Sidebar } from './components/Sidebar';
import { ExecutionPanel } from './components/ExecutionPanel';
import { ToolLog } from './components/ToolLog';
import { ConfigPanel } from './components/ConfigPanel';
import { nodeTypes } from './components/nodes';
import { BoltIcon } from './components/icons';
import type { NodeStatus } from './engine';
import './App.css';

interface LogEntry {
  tool: string;
  input: any;
  result: any;
  time: string;
  actor: 'agent' | 'you';
}

const initialNodes: Node[] = [
  {
    id: 'start',
    type: 'startNode',
    position: { x: 40, y: 200 },
    data: { label: 'Start', config: {} },
  },
];

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any[]);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [toolLogs, setToolLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [liveStatus, setLiveStatus] = useState<Record<string, NodeStatus>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const addToolLog = useCallback(
    (tool: string, input: any, result: any, actor: 'agent' | 'you' = 'agent') => {
      setToolLogs((prev) => [
        ...prev,
        { tool, input, result, time: new Date().toLocaleTimeString(), actor },
      ]);
    },
    []
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds: any[]) =>
        addEdge({ ...params, animated: false, style: { stroke: '#3a342c' } }, eds)
      );
    },
    [setEdges]
  );

  useEffect(() => {
    return registerWebMCPTools({
      nodes,
      edges,
      setNodes,
      setEdges,
      addToolLog,
      setExecutionResult,
      setIsExecuting,
      setLiveStatus,
    });
  }, [nodes, edges, addToolLog, setNodes, setEdges]);

  // ---- selection / tuning ----
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) || null,
    [nodes, selectedId]
  );

  const applyConfig = useCallback(
    (nodeId: string, config: any) => {
      setNodes((nds: Node[]) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as any), config } } : n))
      );
      addToolLog(
        'update_node_config',
        { nodeId },
        { success: true, message: `tuned ${nodeId}` },
        'you'
      );
    },
    [setNodes, addToolLog]
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds: Node[]) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds: any[]) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedId(null);
    },
    [setNodes, setEdges]
  );

  // ---- decoration from live statuses ----
  const decoratedNodes = useMemo(() => {
    if (Object.keys(liveStatus).length === 0) return nodes;
    return nodes.map((n) => ({
      ...n,
      data: { ...(n.data as any), status: liveStatus[n.id] || 'idle' },
    }));
  }, [nodes, liveStatus]);

  const decoratedEdges = useMemo(() => {
    if (Object.keys(liveStatus).length === 0)
      return edges.map((e: any) => ({ ...e, className: '' }));
    return edges.map((e: any) => {
      const src = liveStatus[e.source];
      const dst = liveStatus[e.target];
      let cls = '';
      if (dst === 'running') cls = 'edge-flowing';
      else if ((src === 'done' || src === 'skipped') && (dst === 'done' || dst === 'skipped'))
        cls = 'edge-done';
      else if (dst === 'fault') cls = 'edge-faulted';
      return { ...e, className: cls };
    });
  }, [edges, liveStatus]);

  const runState: 'idle' | 'running' | 'complete' | 'fault' = isExecuting
    ? 'running'
    : executionResult
      ? executionResult.success === false
        ? 'fault'
        : 'complete'
      : 'idle';

  return (
    <div className="app">
      <header className="rail">
        <div className="rail-left">
          <div className="wordmark">
            <BoltIcon size={16} />
            <h1>AGENTFLOW</h1>
          </div>
          <span className="rail-tag">HUMAN × AGENT CANVAS</span>
        </div>

        <div className="readout" data-state={runState}>
          <span className="led" />
          {runState.toUpperCase()}
        </div>

        <div className="rail-counts">
          <b>{nodes.length}</b> MODULES · <b>{edges.length}</b> WIRES
        </div>
      </header>

      <div className="main">
        <Sidebar
          nodes={nodes}
          setNodes={setNodes}
          setEdges={setEdges}
          edges={edges}
          addToolLog={addToolLog}
          clearRunState={() => {
            setLiveStatus({});
            setExecutionResult(null);
          }}
        />

        <div className="canvas-area">
          <ReactFlow
            nodes={decoratedNodes}
            edges={decoratedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={{ style: { stroke: '#3a342c', strokeWidth: 1.6 } }}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ background: 'var(--bg)' }}
          >
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMap
              nodeColor="#3a342c"
              maskColor="rgba(21,19,16,0.8)"
              style={{ background: 'var(--panel)', width: 130, height: 90 }}
              position="top-right"
            />
            <Background variant={BackgroundVariant.Lines} gap={26} color="#262119" />
          </ReactFlow>
        </div>

        <div className="right-panel">
          <ConfigPanel node={selectedNode} onChange={applyConfig} onDelete={deleteNode} />

          <ExecutionPanel
            executionResult={executionResult}
            isExecuting={isExecuting}
            nodes={nodes}
            edges={edges}
            addToolLog={addToolLog}
            setExecutionResult={setExecutionResult}
            setIsExecuting={setIsExecuting}
            setLiveStatus={setLiveStatus}
          />
          <ToolLog logs={toolLogs} />
        </div>
      </div>
    </div>
  );
}

export default App;
