import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { nodeTypes } from './components/nodes';
import { BoltIcon } from './components/icons';
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

const STEP_MS = 420;

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any[]);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [toolLogs, setToolLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  // Execution pulse state
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const timersRef = useRef<number[]>([]);

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
    });
  }, [nodes, edges, addToolLog, setNodes, setEdges]);

  // Stepper: light up nodes in topological order when a run completes
  useEffect(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (!executionResult?.success || !Array.isArray(executionResult?.order)) {
      setActiveIdx(-1);
      setOrderIds([]);
      return;
    }
    const order: string[] = executionResult.order.filter(Boolean);
    if (order.length === 0) {
      setActiveIdx(-1);
      setOrderIds([]);
      return;
    }
    setOrderIds(order);
    setActiveIdx(-1);
    order.forEach((_, i) => {
      timersRef.current.push(
        window.setTimeout(() => setActiveIdx(i), i * STEP_MS)
      );
    });
    timersRef.current.push(
      window.setTimeout(() => setActiveIdx(-1), order.length * STEP_MS + 900)
    );
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [executionResult]);

  const runState: 'idle' | 'running' | 'complete' | 'fault' = isExecuting
    ? 'running'
    : executionResult
      ? executionResult.success === false
        ? 'fault'
        : 'complete'
      : 'idle';

  const decoratedNodes = useMemo(() => {
    if (activeIdx < 0 && orderIds.length === 0) return nodes;
    const active = activeIdx >= 0 ? orderIds[activeIdx] : null;
    const doneSet = new Set(orderIds.slice(0, Math.max(activeIdx, -1) < 0 ? 0 : activeIdx));
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        status:
          n.id === active ? 'running' : doneSet.has(n.id) && activeIdx >= 0 ? 'done' : 'idle',
      },
    }));
  }, [nodes, activeIdx, orderIds]);

  const decoratedEdges = useMemo(() => {
    if (activeIdx < 0 || orderIds.length === 0) return edges;
    const active = orderIds[activeIdx];
    const doneSet = new Set(orderIds.slice(0, activeIdx));
    return edges.map((e: any) => {
      const flowing = e.target === active || (doneSet.has(e.target) && !doneSet.has(e.source) === false && e.source === orderIds[activeIdx - 1]);
      const done = doneSet.has(e.source) && doneSet.has(e.target);
      return {
        ...e,
        className: flowing ? 'edge-flowing' : done ? 'edge-done' : '',
      };
    });
  }, [edges, activeIdx, orderIds]);

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
        />

        <div className="canvas-area">
          <ReactFlow
            nodes={decoratedNodes}
            edges={decoratedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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
