import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
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
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { registerWebMCPTools } from './webmcp';
import { Sidebar } from './components/Sidebar';
import { ExecutionPanel } from './components/ExecutionPanel';
import { ToolLog } from './components/ToolLog';
import { NodePopover } from './components/NodePopover';
import { WorkflowManager } from './components/WorkflowManager';
import { nodeTypes } from './components/nodes';
import { LabeledEdge } from './components/LabeledEdge';
import { useAuth } from './context/AuthContext';
import logo from './assets/logo.png';
import type { NodeStatus } from './engine';
import { localWireAdjust, snapAndPushOnDrop, snapToGrid } from './utils/grid';
import { WelcomeModal } from './components/WelcomeModal';
import { OnboardingTour } from './components/OnboardingTour';
import { HelpDrawer, HelpButton } from './components/HelpDrawer';
import { AgentToast } from './components/AgentToast';
import { ChallengeBanner } from './components/ChallengeBanner';
import { AuthPage } from './pages/AuthPage';
import { LandingPage } from './pages/LandingPage';
import { v4 as uuidv4 } from 'uuid';

const ONBOARDING_KEY = 'agentflow_onboarded_v1';

const edgeTypes = { labeled: LabeledEdge };
import './App.css';
import './components/Sidebar.css';

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

function CanvasPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any[]);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [toolLogs, setToolLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [liveStatus, setLiveStatus] = useState<Record<string, NodeStatus>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);
  const [currentWorkflowName, setCurrentWorkflowName] = useState('Untitled');
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const workflowHistoryRef = useRef<any[]>([]);
  const templatesRef = useRef<Record<string, { nodes: Node[]; edges: Edge[] }>>({});

  const addToolLog = useCallback(
    (tool: string, input: any, result: any, actor: 'agent' | 'you' = 'agent') => {
      setToolLogs((prev) => [
        ...prev,
        { tool, input, result, time: new Date().toLocaleTimeString(), actor },
      ]);
    },
    []
  );

  const reactFlowRef = useRef<any>(null);

  const fitAllNodes = useCallback(() => {
    reactFlowRef.current?.fitView({ padding: 0.15, duration: 400, maxZoom: 1 });
  }, []);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      setNodes((nds: Node[]) => localWireAdjust(nds, [...edgesRef.current, params as any], params.source!, params.target!));
      setEdges((eds: any[]) =>
        addEdge({ ...params, type: 'labeled', animated: false, style: { stroke: '#3a342c' } }, eds)
      );
      setTimeout(() => {
        const tgt = nodesRef.current.find((n) => n.id === params.target);
        if (tgt) fitAllNodes();
      }, 90);
    },
    [setNodes, setEdges, fitAllNodes]
  );

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      setNodes((nds: Node[]) => snapAndPushOnDrop(node.id, node.position, nds));
    },
    [setNodes]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/agentflow');
    if (!raw) return;
    try {
      const { type, nodeType } = JSON.parse(raw);
      let pos: { x: number; y: number };
      const rf = reactFlowRef.current;
      if (rf && typeof rf.screenToFlowPosition === 'function') {
        const flowPos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const snapped = snapToGrid(flowPos.x, flowPos.y);
        pos = { x: snapped.x, y: snapped.y };
      } else {
        pos = { x: 0, y: 0 };
      }
      const newNode: Node = {
        id: `node_${uuidv4().slice(0, 8)}`,
        type: nodeType,
        position: pos,
        data: { label: `${type}_${nodesRef.current.length}`, config: {}, nodeType: type },
      };
      setNodes((nds: Node[]) => [...nds, newNode]);
      setSelectedId(newNode.id);
      setRightPanelOpen(true);
      addToolLog('add_node', { type, via: 'drag' }, { success: true, nodeId: newNode.id }, 'you');
    } catch {
      // ignore malformed payload
    }
  }, [setNodes, addToolLog]);

  const prevNodesRef = useRef(nodes.length);
  useEffect(() => {
    if (nodes.length <= prevNodesRef.current) { prevNodesRef.current = nodes.length; return; }
    setTimeout(() => fitAllNodes(), 80);
    prevNodesRef.current = nodes.length;
  }, [nodes.length, fitAllNodes]);

  const prevEdgesPanRef = useRef(edges.length);
  useEffect(() => {
    if (edges.length <= prevEdgesPanRef.current) { prevEdgesPanRef.current = edges.length; return; }
    setTimeout(() => fitAllNodes(), 120);
    prevEdgesPanRef.current = edges.length;
  }, [edges.length, fitAllNodes]);

  useEffect(() => {
    return registerWebMCPTools({
      nodes,
      edges,
      nodesRef,
      edgesRef,
      selectedIdRef,
      setNodes,
      setEdges,
      addToolLog,
      setExecutionResult,
      setIsExecuting,
      setLiveStatus,
      workflowHistory: workflowHistoryRef,
      templates: templatesRef,
    });
  }, [nodes, edges, addToolLog, setNodes, setEdges]);

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

  useEffect(() => {
    if (runState === 'complete' || runState === 'fault') {
      const timer = setTimeout(() => setRightPanelOpen(false), 800);
      return () => clearTimeout(timer);
    }
  }, [runState]);

  useEffect(() => {
    const isCompleted = localStorage.getItem(ONBOARDING_KEY);
    if (!isCompleted) {
      const t = setTimeout(() => setWelcomeOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !welcomeOpen && !tourOpen) {
        const ae = document.activeElement as HTMLElement | null;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [welcomeOpen, tourOpen]);

  // Warn on tab close / reload if workflow has unsaved work
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasWork = nodes.length > 1 || edges.length > 0 || isExecuting;
      if (!hasWork) return;
      e.preventDefault();
      // Chrome requires returnValue to be set
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [nodes.length, edges.length, isExecuting]);

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setWelcomeOpen(false);
    setTimeout(() => setTourOpen(true), 260);
  }, []);

  const skipWelcome = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setWelcomeOpen(false);
  }, []);

  const completeTour = useCallback(() => {
    setTourOpen(false);
  }, []);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(ONBOARDING_KEY);
    setHelpOpen(false);
    setWelcomeOpen(true);
  }, []);

  // Agent toast suppress while onboarding/help modals are open
  const suppressAgentToast = welcomeOpen || tourOpen || helpOpen;

  return (
    <div className="app">
      <header className="rail">
        <div className="rail-left">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <div className="wordmark">
            <img src={logo} alt="AgentFlow" className="wordmark-logo" />
            <h1>AGENTFLOW</h1>
          </div>
          <span className="rail-tag">HUMAN × AGENT CANVAS</span>
        </div>

        <div className="readout" data-state={runState}>
          <span className="led" />
          {runState.toUpperCase()}
        </div>

        <div className="rail-right">
          <div className="rail-counts">
            <b>{nodes.length}</b> MODULES · <b>{edges.length}</b> WIRES
          </div>
          <button
            className="rail-help-btn"
            onClick={() => setHelpOpen((v) => !v)}
            title="How to use (?)"
            aria-label="How to use"
          >
            ?
          </button>
          <button
            className="auth-toggle-btn"
            onClick={() => navigate('/auth')}
            title={user ? `${user.username} — account` : 'Sign in'}
          >
            {user ? (
              <span className="auth-avatar">{user.username[0].toUpperCase()}</span>
            ) : (
              <span className="auth-icon">↗</span>
            )}
          </button>
        </div>
      </header>

      <ChallengeBanner variant="banner" />

      <div className={`main ${sidebarOpen ? '' : 'sidebar-closed'} ${rightPanelOpen ? '' : 'right-closed'}`}>
        {sidebarOpen && (
          <Sidebar
            nodes={nodes}
            setNodes={setNodes}
            setEdges={setEdges}
            edges={edges}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            liveStatus={liveStatus}
            reactFlowRef={reactFlowRef}
            addToolLog={addToolLog}
            clearRunState={() => {
              setLiveStatus({});
              setExecutionResult(null);
            }}
          >
            {user && (
              <WorkflowManager
                nodes={nodes}
                edges={edges}
                setNodes={setNodes}
                setEdges={setEdges}
                addToolLog={addToolLog}
                currentWorkflowId={currentWorkflowId}
                setCurrentWorkflowId={setCurrentWorkflowId}
                currentWorkflowName={currentWorkflowName}
                setCurrentWorkflowName={setCurrentWorkflowName}
              />
            )}
          </Sidebar>
        )}

        <div className="canvas-area" data-tour="canvas" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={decoratedNodes}
            edges={decoratedEdges}
            onInit={(inst: any) => { reactFlowRef.current = inst; }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_, node) => {
              setSelectedId(node.id);
              setRightPanelOpen(true);
            }}
            onPaneClick={() => setSelectedId(null)}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: 'labeled', style: { stroke: '#3a342c', strokeWidth: 1.6 } }}
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

        <div className={`right-panel ${rightPanelOpen ? '' : 'collapsed'}`} data-tour="run">
          <button
            className="right-panel-toggle"
            onClick={() => setRightPanelOpen((v) => !v)}
            title={rightPanelOpen ? 'Hide panel' : 'Show panel'}
          >
            {rightPanelOpen ? '▶' : '◀'}
          </button>
          
          {rightPanelOpen && (
            <>
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
            </>
          )}
        </div>

        {selectedId && rightPanelOpen && (
          <NodePopover
            node={nodes.find((n) => n.id === selectedId) || null}
            onChange={applyConfig}
            onDelete={deleteNode}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>

      <WelcomeModal open={welcomeOpen} onClose={skipWelcome} onComplete={completeOnboarding} />
      <OnboardingTour open={tourOpen} onClose={completeTour} onComplete={completeTour} />
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} onReplay={resetOnboarding} />
      {!helpOpen && !welcomeOpen && !tourOpen && <HelpButton onClick={() => setHelpOpen(true)} />}
      <AgentToast suppress={suppressAgentToast} delayMs={2500} />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/tool" element={<CanvasPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
