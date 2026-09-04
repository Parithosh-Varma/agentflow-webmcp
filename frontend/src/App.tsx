import { useCallback, useEffect, useMemo, useState, useRef, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  SelectionMode,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { registerWebMCPTools } from './webmcp';
import { Sidebar } from './components/Sidebar';
const NodePopover = lazy(() => import('./components/NodePopover').then((m) => ({ default: m.NodePopover })));
import { WorkflowManager } from './components/WorkflowManager';
import { nodeTypes } from './components/nodes';
import { LabeledEdge } from './components/LabeledEdge';
import { useAuth } from './context/AuthContext';
import logo from './assets/logo.png';
import type { NodeStatus } from './engine';
import { localWireAdjust, snapAndPushOnDrop, snapToGrid, getSmartPlacement } from './utils/grid';
const HelpDrawer = lazy(() => import('./components/HelpDrawer').then((m) => ({ default: m.HelpDrawer })));
import { AgentToast } from './components/AgentToast';
import { GithubIcon } from './components/icons';

import { useOnboarding } from './onboarding/useOnboarding';
const TourOverlay = lazy(() => import('./onboarding/TourOverlay').then((m) => ({ default: m.TourOverlay })));
import { v4 as uuidv4 } from 'uuid';
import { NODE_DISPLAY_NAMES, getInstanceCount } from './components/nodes';
// Local judge-demo builder — duplicated from Sidebar.tsx to avoid circular import
function buildJudgeDemoFlow(): { nodes: Node[]; edges: any[] } {
  const typeMap: Record<string, string> = {
    api_call: 'apiCallNode',
    condition: 'conditionNode',
    output: 'outputNode',
    ai: 'aiNode',
    split: 'splitNode',
    logger: 'loggerNode',
    start: 'startNode',
  };
  const n = (id: string, type: string, x: number, y: number, label: string, config: any): Node => ({
    id,
    type: typeMap[type] || `${type}Node`,
    position: { x, y },
    data: { label, config, nodeType: type },
  });
  const nodes: Node[] = [
    n('start', 'start', 60, 200, 'Start', {}),
    n('jd_api', 'api_call', 320, 80, 'HackerNews front page', {
      url: 'https://hn.algolia.com/api/v1/search?tags=front_page',
      method: 'GET',
    }),
    n('jd_ai', 'ai', 620, 80, 'summarize top story', {
      prompt: 'Summarize the top HackerNews story title in one engaging sentence. Be concise.',
      model: 'gpt-3.5-turbo',
    }),
    n('jd_cond', 'condition', 620, 210, 'has summary?', {
      expression: '(data) => Boolean(data.response || data.hits || JSON.stringify(data).length > 80)',
    }),
    n('jd_split', 'split', 900, 80, 'fan-out', { batchSize: 1 }),
    n('jd_out_dl', 'output', 1180, 40, 'save report', { kind: 'download', filename: 'hn-summary-report' }),
    n('jd_logger', 'logger', 1180, 160, 'log it', { level: 'info', message: 'HackerNews summary ready' }),
    n('jd_out_log', 'output', 900, 280, 'log fallback', { kind: 'console' }),
  ];
  const edges = [
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'start', target: 'jd_api', label: '', type: 'labeled' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'jd_api', target: 'jd_ai', label: '', type: 'labeled' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'jd_ai', target: 'jd_cond', label: '', type: 'labeled' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'jd_cond', target: 'jd_split', label: 'true', type: 'labeled' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'jd_cond', target: 'jd_out_log', label: 'false', type: 'labeled' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'jd_split', target: 'jd_out_dl', label: '', type: 'labeled' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'jd_split', target: 'jd_logger', label: '', type: 'labeled' },
  ];
  return { nodes, edges };
}

const ONBOARDING_KEY = 'agentflow_onboarded_v1';
const COLLAB_HISTORY_LIMIT = 12;

const edgeTypes = { labeled: LabeledEdge };

const WEBMCP_TOOLS_27: Array<{ name: string; desc: string; group: 'core' | 'advanced' }> = [
  // 8 core
  { name: 'add_node', desc: 'Add workflow node', group: 'core' },
  { name: 'connect_nodes', desc: 'Connect two nodes', group: 'core' },
  { name: 'execute_workflow', desc: 'Run workflow (topological)', group: 'core' },
  { name: 'get_available_tools', desc: 'List 27 tools + schemas', group: 'core' },
  { name: 'get_node_details', desc: 'Get node info', group: 'core' },
  { name: 'update_node_config', desc: 'Update node config (id or label, validates keys)', group: 'core' },
  { name: 'get_workflow_status', desc: 'Get nodes/edges + positions', group: 'core' },
  { name: 'validate_workflow', desc: 'Validate workflow', group: 'core' },
  // 11 advanced (original)
  { name: 'delete_node', desc: 'Remove node + wires (undoable)', group: 'advanced' },
  { name: 'clone_node', desc: 'Duplicate node', group: 'advanced' },
  { name: 'get_node_connections', desc: 'Incoming/outgoing wires', group: 'advanced' },
  { name: 'save_workflow', desc: 'Save to localStorage', group: 'advanced' },
  { name: 'load_workflow', desc: 'Load from localStorage', group: 'advanced' },
  { name: 'run_node', desc: 'Run single node isolate (stack traces)', group: 'advanced' },
  { name: 'set_node_position', desc: 'Move node', group: 'advanced' },
  { name: 'get_workflow_history', desc: 'Past runs', group: 'advanced' },
  { name: 'create_template', desc: 'Save as template', group: 'advanced' },
  { name: 'export_workflow', desc: 'Export JSON', group: 'advanced' },
  { name: 'import_workflow', desc: 'Import JSON', group: 'advanced' },
  // 8 new — addressing 10 limitations
  { name: 'find_nodes', desc: 'Search by label/type — no more ID guessing', group: 'advanced' },
  { name: 'get_execution_details', desc: 'Per-node outputs + stacks (debug)', group: 'advanced' },
  { name: 'get_node_output', desc: 'Single node output by id/label', group: 'advanced' },
  { name: 'get_canvas_snapshot', desc: 'Textual canvas map (visual blindness)', group: 'advanced' },
  { name: 'probe_api', desc: 'Test URL before wiring (CORS/JSON check)', group: 'advanced' },
  { name: 'undo_last_action', desc: 'Undo last mutation', group: 'advanced' },
  { name: 'redo_last_action', desc: 'Redo', group: 'advanced' },
  { name: 'get_undo_history', desc: 'Mutation history', group: 'advanced' },
];
const WEBMCP_TOOLS_19 = WEBMCP_TOOLS_27; void WEBMCP_TOOLS_27; void WEBMCP_TOOLS_19; // kept for docs, formerly shown in right drawer

const CANVAS_TOUR_STEPS = [
  { id: 'canvas-intro', target: 'canvas-root', title: 'Your canvas', body: 'Drag nodes here to build a flow.' },
  { id: 'canvas-add-node', target: 'add-node-button', title: 'Add a node', body: 'Click here, or drag from the sidebar.' },
  { id: 'canvas-connect', target: 'canvas-root', title: 'Connect nodes', body: 'Drag from one node’s edge to another to link them.' },
  { id: 'canvas-run', target: 'run-button', title: 'Run it', body: 'Press RUN to execute the workflow.' },
];

// ================================================================
// Signature: Live Collaboration Bar
// Thin strip showing human↔agent activity in real time
// ================================================================
interface CollabEvent { actor: 'human' | 'agent'; action: string; time: number; }

function CollaborationBar({ recentLogs }: { recentLogs: CollabEvent[] }) {
  const segments = recentLogs.slice(-COLLAB_HISTORY_LIMIT).map((e, i) => (
    <div
      key={i}
      className={`collab-bar__segment ${e.actor === 'human' ? 'collab-bar__segment--human' : 'collab-bar__segment--agent'}`}
      style={{ width: 'calc(100% / 12)' }}
      title={`${e.actor}: ${e.action}`}
    />
  ));
  const hasAgent = recentLogs.some(e => e.actor === 'agent');
  const hasHuman = recentLogs.some(e => e.actor === 'human');

  return (
    <div className="collab-bar" aria-label="Live collaboration activity">
      <div className="collab-bar__track" role="img" aria-label={`Human actions: ${hasHuman ? 'active' : 'idle'}, Agent actions: ${hasAgent ? 'active' : 'idle'}`}>
        {segments}
      </div>
      {hasAgent && <div className="collab-bar__pulse collab-bar__pulse--agent" aria-hidden="true" />}
      {hasHuman && <div className="collab-bar__pulse collab-bar__pulse--human" aria-hidden="true" />}
    </div>
  );
}

// ================================================================
// Thesis: Canvas Demo — auto-playing agent building the Judge Demo
// Real nodes, real grid, real animations — not a video
// ================================================================
interface CanvasDemoProps { onStartFlow: () => void; isPlaying: boolean; }

function CanvasDemo({ onStartFlow, isPlaying }: CanvasDemoProps) {
  const [demoNodes, setDemoNodes] = useState<Node[]>([]);
  const [demoEdges, setDemoEdges] = useState<any[]>([]);
  const [showCTA, setShowCTA] = useState(false);
  const reactFlowRef = useRef<any>(null);

  useCtaKeyframes();

  const judgeFlow = buildJudgeDemoFlow();

  // Phase timings (ms): 0=idle, 1=start, 2=api, 3=ai, 4=cond, 5=split, 6=outputs, 7=cta
  const PHASES = [
    { nodes: ['start'], edges: [], duration: 400 },
    { nodes: ['start', 'jd_api'], edges: [{ source: 'start', target: 'jd_api' }], duration: 600 },
    { nodes: ['start', 'jd_api', 'jd_ai'], edges: [{ source: 'start', target: 'jd_api' }, { source: 'jd_api', target: 'jd_ai' }], duration: 700 },
    { nodes: ['start', 'jd_api', 'jd_ai', 'jd_cond'], edges: [{ source: 'start', target: 'jd_api' }, { source: 'jd_api', target: 'jd_ai' }, { source: 'jd_ai', target: 'jd_cond' }], duration: 600 },
    { nodes: ['start', 'jd_api', 'jd_ai', 'jd_cond', 'jd_split', 'jd_out_log'], edges: [
      { source: 'start', target: 'jd_api' }, { source: 'jd_api', target: 'jd_ai' },
      { source: 'jd_ai', target: 'jd_cond' }, { source: 'jd_cond', target: 'jd_split', label: 'true' },
      { source: 'jd_cond', target: 'jd_out_log', label: 'false' }
    ], duration: 800 },
    { nodes: ['start', 'jd_api', 'jd_ai', 'jd_cond', 'jd_split', 'jd_out_dl', 'jd_logger', 'jd_out_log'], edges: [
      { source: 'start', target: 'jd_api' }, { source: 'jd_api', target: 'jd_ai' },
      { source: 'jd_ai', target: 'jd_cond' }, { source: 'jd_cond', target: 'jd_split', label: 'true' },
      { source: 'jd_cond', target: 'jd_out_log', label: 'false' },
      { source: 'jd_split', target: 'jd_out_dl' }, { source: 'jd_split', target: 'jd_logger' }
    ], duration: 1000 },
    { nodes: ['start', 'jd_api', 'jd_ai', 'jd_cond', 'jd_split', 'jd_out_dl', 'jd_logger', 'jd_out_log'], edges: [
      { source: 'start', target: 'jd_api' }, { source: 'jd_api', target: 'jd_ai' },
      { source: 'jd_ai', target: 'jd_cond' }, { source: 'jd_cond', target: 'jd_split', label: 'true' },
      { source: 'jd_cond', target: 'jd_out_log', label: 'false' },
      { source: 'jd_split', target: 'jd_out_dl' }, { source: 'jd_split', target: 'jd_logger' }
    ], duration: 1200, cta: true },
  ];

  useEffect(() => {
    if (!isPlaying) { setShowCTA(false); return; }
    let cancelled = false;
    async function run() {
      for (let i = 0; i < PHASES.length; i++) {
        if (cancelled) break;
        const p = PHASES[i];
        const nodesToShow = judgeFlow.nodes.filter(n => p.nodes.includes(n.id));
        const edgesToShow = p.edges.map((e, idx) => ({
          id: `demo_edge_${idx}`,
          source: e.source,
          target: e.target,
          label: e.label || '',
          type: 'labeled',
          animated: false,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        }));
        setDemoNodes(nodesToShow);
        setDemoEdges(edgesToShow);
        if (p.cta) setShowCTA(true);
        await new Promise(r => setTimeout(r, p.duration));
      }
    }
    run();
    return () => { cancelled = true; };
  }, [isPlaying]);

  useEffect(() => {
    if (reactFlowRef.current) {
      reactFlowRef.current.fitView({ padding: 0.2, duration: 400 });
    }
  }, [demoNodes.length]);

  if (!isPlaying || demoNodes.length === 0) return null;

  return (
    <div className="canvas-demo playing" role="region" aria-label="Agent building workflow demo">
      <ReactFlow
        ref={reactFlowRef}
        nodes={demoNodes}
        edges={demoEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ type: 'labeled', style: { stroke: '#3a342c', strokeWidth: 1.6 } }}
        fitView
        style={{ background: 'var(--bg)', width: '100%', height: '100%' }}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Lines} gap={26} color="#262119" />
      </ReactFlow>
      {showCTA && (
        <div className="canvas-demo-cta" style={{
          position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, textAlign: 'center', pointerEvents: 'auto',
          animation: 'cta-in 0.4s var(--ease-entrance) forwards'
        }}>
          <button
            className="btn-run"
            onClick={onStartFlow}
            style={{ padding: '12px 28px', fontSize: '13px' }}
          >
            Press RUN to execute
          </button>
        </div>
      )}
    </div>
  );
}

// CTA animation keyframe (injected once)
function useCtaKeyframes() {
  useEffect(() => {
    if (typeof document !== 'undefined' && !document.getElementById('cta-keyframes')) {
      const style = document.createElement('style');
      style.id = 'cta-keyframes';
      style.textContent = `
        @keyframes cta-in {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);
}

import './App.css';
import './components/Sidebar.css';

interface LogEntry {
  tool: string;
  input: any;
  result: any;
  time: string;
  actor: 'agent' | 'you';
}

const initialNodes: Node[] = [];

const CACHE_KEY = 'agentflow_workflow_cache_v2';
const SESSION_KEY = 'agentflow_session_id_v1';

// Generate or get session ID for this tab
function getSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function getCacheKey(sessionId: string): string {
  return `${CACHE_KEY}_${sessionId}`;
}

function CanvasPage() {
  const { user } = useAuth();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as any[]);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [toolLogs, setToolLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [liveStatus, setLiveStatus] = useState<Record<string, NodeStatus>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('agentflow_sidebar_width_v1')); return v >= 220 && v <= 520 ? v : 276; } catch { return 276; }
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const SIDEBAR_MIN = 220;
  const SIDEBAR_MAX = 520;
  const SIDEBAR_DEFAULT = 276;
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);
  const [currentWorkflowName, setCurrentWorkflowName] = useState('Untitled');
  const [helpOpen, setHelpOpen] = useState(false);
  const onboarding = useOnboarding();
  const [showTour, setShowTour] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDraggingNode, setIsDraggingNode] = useState(false);

  // Session ID for this tab
  const sessionId = getSessionId();
  const cacheKey = getCacheKey(sessionId);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const workflowHistoryRef = useRef<any[]>([]);
  const templatesRef = useRef<Record<string, { nodes: Node[]; edges: Edge[] }>>({});

  // Auto-save workflow to session-specific localStorage cache
  useEffect(() => {
    const cache = {
      sessionId,
      nodes,
      edges,
      timestamp: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(cache));
  }, [nodes, edges, cacheKey]);

  // Load workflow from cache on mount - try same session first
  useEffect(() => {
    try {
      // 1. Try to restore from this session's cache
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { nodes: cachedNodes, edges: cachedEdges, timestamp, sessionId: cachedSid } = JSON.parse(cached);
        if (cachedSid === sessionId && cachedNodes?.length && Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000) {
          setNodes(cachedNodes);
          setEdges(cachedEdges);
          addToolLog('load_cache', { sessionId }, { success: true, nodeCount: cachedNodes.length, edgeCount: cachedEdges.length }, 'you');
          return;
        }
      }

      // 2. Check for other session caches (for recovery UI) - commented out for now
      // const otherCaches = getAllCacheKeys()
      //   .map(k => { try { return { key: k, ...JSON.parse(localStorage.getItem(k)!) }; } catch { return null; } })
      //   .filter((c) => c !== null && c.nodes?.length && Date.now() - c.timestamp < 7 * 24 * 60 * 60 * 1000)
      //   .sort((a, b) => b.timestamp - a.timestamp);

      // If there are other recent caches, we could show a restore prompt
      // For now, just start fresh - user can use "load_workflow" tool or sidebar to recover
} catch {
      // Ignore cache errors
    }
  }, [cacheKey, sessionId]);

  // Broadcast session changes to other tabs (optional sync)
  useEffect(() => {
    const channel = new BroadcastChannel('agentflow_sync');
    channel.postMessage({ type: 'session_active', sessionId, timestamp: Date.now() });
    return () => channel.close();
  }, [sessionId]);

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
      if (params.source === params.target) return;
      const dup = edgesRef.current.some(
        (e: any) =>
          e.source === params.source &&
          e.target === params.target &&
          (e.sourceHandle || null) === (params.sourceHandle || null) &&
          (e.targetHandle || null) === (params.targetHandle || null)
      );
      if (dup) return;
      setNodes((nds: Node[]) => localWireAdjust(nds, [...edgesRef.current, params as any], params.source!, params.target!));
      setEdges((eds: any[]) =>
        addEdge({ ...params, type: 'labeled', animated: false, style: { stroke: '#6366f1', strokeWidth: 2 } }, eds)
      );
      setTimeout(() => {
        const tgt = nodesRef.current.find((n) => n.id === params.target);
        if (tgt) fitAllNodes();
      }, 90);
    },
    [setNodes, setEdges, fitAllNodes]
  );

  const isValidConnection = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return false;
    if (connection.source === connection.target) return false;
    const dup = edgesRef.current.some(
      (e: any) =>
        e.source === connection.source &&
        e.target === connection.target &&
        (e.sourceHandle || null) === (connection.sourceHandle || null) &&
        (e.targetHandle || null) === (connection.targetHandle || null)
    );
    if (dup) return false;
    // Prevent cycles: disallow if target can reach source via existing edges
    const visited = new Set<string>();
    const stack = [connection.target];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === connection.source) return false;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const e of edgesRef.current) {
        if (e.source === cur && !visited.has(e.target)) stack.push(e.target);
      }
    }
    return true;
  }, []);

  // Ensure port dragging renders bezier preview under zoom/pan via React Flow's project()
  const onConnectStart = useCallback((_e: any, _params: any) => {
    void _e; void _params;
  }, []);
  const onConnectEnd = useCallback((_e: any) => {
    void _e;
  }, []);

  const onNodeDragStop = useCallback(
    (_: any, node: Node) => {
      setNodes((nds: Node[]) => snapAndPushOnDrop(node.id, node.position, nds));
      setIsDraggingNode(false);
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
        try {
          const flowPos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          if (Number.isFinite(flowPos?.x) && Number.isFinite(flowPos?.y)) {
            const snapped = snapToGrid(flowPos.x, flowPos.y);
            pos = { x: snapped.x, y: snapped.y };
          } else {
            pos = getSmartPlacement(nodesRef.current, selectedIdRef.current);
          }
        } catch {
          pos = getSmartPlacement(nodesRef.current, selectedIdRef.current);
        }
      } else {
        // screenToFlowPosition unavailable — smart-place instead of piling at 0,0
        pos = getSmartPlacement(nodesRef.current, selectedIdRef.current);
      }
      const newNode: Node = {
        id: `node_${uuidv4().slice(0, 8)}`,
        type: nodeType,
        position: pos,
        data: { label: `${NODE_DISPLAY_NAMES[type] || type}_${getInstanceCount(type)}`, config: {}, nodeType: type },
      };
      setNodes((nds: Node[]) => [...nds, newNode]);
      setSelectedId(newNode.id);
      addToolLog('add_node', { type, via: 'drag' }, { success: true, nodeId: newNode.id }, 'you');
    } catch {
      // ignore malformed payload
    }
  }, [setNodes, addToolLog]);

  const prevNodesRef = useRef(nodes.length);
  useEffect(() => {
    const prev = prevNodesRef.current;
    prevNodesRef.current = nodes.length;
    if (nodes.length <= prev) return;
    // Only auto-fit bulk loads (demo/import add many); single adds keep viewport stable
    if (nodes.length - prev <= 1 && prev !== 0) return;
    const t = setTimeout(() => fitAllNodes(), 80);
    return () => clearTimeout(t);
  }, [nodes.length, fitAllNodes]);

  const prevEdgesPanRef = useRef(edges.length);
  useEffect(() => {
    const prev = prevEdgesPanRef.current;
    prevEdgesPanRef.current = edges.length;
    if (edges.length <= prev) return;
    if (edges.length - prev <= 1 && prev !== 0) return;
    const t = setTimeout(() => fitAllNodes(), 120);
    return () => clearTimeout(t);
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
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as any), config, isConfigured: true } } : n))
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
      if (nodeId === 'start') return;
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
      else if (dst === 'skipped') cls = 'edge-skipped';
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



  // New onboarding — data-onboarding TourOverlay (replaces WelcomeModal/OnboardingTour)
  useEffect(() => {
    if (!onboarding.isDismissed('canvas-tour')) {
      const t = setTimeout(() => setShowTour(true), 700);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !showTour) {
        const ae = document.activeElement as HTMLElement | null;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTour]);

  // Hard-remove any stray floating ? FAB that overlapped +/- (cache-bust failsafe)
  useEffect(() => {
    const killFab = () => document.querySelectorAll('.help-fab, button.help-fab').forEach(el => el.remove());
    killFab();
    const mo = new MutationObserver(killFab);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // Rectangle multi-select — Delete / Backspace removes selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        const ae = document.activeElement as HTMLElement | null;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
        e.preventDefault();
        const toDelete = selectedIds.filter((id) => id !== 'start');
        if (!toDelete.length) return;
        setNodes((nds: Node[]) => nds.filter((n) => !toDelete.includes(n.id)));
        setEdges((eds: any[]) => eds.filter((e) => !toDelete.includes(e.source) && !toDelete.includes(e.target)));
        setSelectedIds([]);
        setSelectedId(null);
        addToolLog('delete_nodes', { count: toDelete.length, ids: toDelete }, { success: true }, 'you');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, setNodes, setEdges, addToolLog]);

  const onSelectionChange = useCallback(({ nodes: sel }: any) => {
    const ids = sel.map((n: any) => n.id);
    setSelectedIds((prev) => (prev.length === ids.length && prev.every((v, i) => v === ids[i]) ? prev : ids));
  }, []);

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

  // Shareable workflow URL (?workflow=<id> or base64 or judge-demo)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const w = params.get('workflow');
    if (!w) return;
    const t = setTimeout(() => {
      if (w === 'judge-demo') {
        const { nodes: jdNodes, edges: jdEdges } = buildJudgeDemoFlow();
        setNodes(jdNodes);
        setEdges(jdEdges.map((e: any) => ({ ...e, animated: false, style: { stroke: '#3a342c', strokeWidth: 1.6 } })));
        addToolLog('load_judge_demo', { via: 'url' }, { success: true, message: 'Loaded Judge Demo from URL — press RUN' }, 'you');
        setTimeout(() => fitAllNodes(), 220);
        return;
      }
      // try base64 JSON
      try {
        const decoded = atob(decodeURIComponent(w));
        const data = JSON.parse(decoded);
        if (data.nodes && data.edges) {
          setNodes(data.nodes);
          setEdges(data.edges);
          addToolLog('import_workflow', { via: 'url' }, { success: true, message: `Imported ${data.nodes.length} nodes from URL` }, 'you');
          setTimeout(() => fitAllNodes(), 220);
          return;
        }
      } catch {}
      // try localStorage key agentflow_<name>
      try {
        const raw = localStorage.getItem(`agentflow_${w}`) || localStorage.getItem(w);
        if (raw) {
          const data = JSON.parse(raw);
          if (data.nodes) {
            setNodes(data.nodes);
            setEdges(data.edges || []);
            addToolLog('load_workflow', { name: w, via: 'url' }, { success: true }, 'you');
            setTimeout(() => fitAllNodes(), 220);
          }
        }
      } catch {}
    }, 320);
    return () => clearTimeout(t);
  }, [fitAllNodes, setNodes, setEdges, addToolLog]);

  const completeTour = useCallback(() => {
    onboarding.dismissTour('canvas-tour');
    setShowTour(false);
  }, [onboarding]);
  const resetOnboarding = useCallback(() => {
    onboarding.resetTour('canvas-tour');
    localStorage.removeItem(ONBOARDING_KEY); // legacy
    try { localStorage.removeItem('agentflow_agent_toast_snoozed_until_v1'); } catch {}
    setHelpOpen(false);
    setShowTour(true);
  }, [onboarding]);

  // WebMCP pill — persistent agent-ready indicator
  const [hasWebMCP, setHasWebMCP] = useState(false);
  useEffect(() => {
    const check = () => {
      // @ts-ignore
      const mc = (document as any).modelContext;
      setHasWebMCP(!!mc && typeof mc.registerTool === 'function');
    };
    check();
    const t1 = setTimeout(check, 800);
    const t2 = setTimeout(check, 1800);
    const iv = setInterval(check, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearInterval(iv); };
  }, []);

  // Theme — white / dark
  const [theme, setTheme] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('agentflow_theme_v1');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch { return 'dark'; }
  });
  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('agentflow_theme_v1', theme);
    } catch {}
  }, [theme]);

  // Agent toast suppress while onboarding/help modals are open
  const suppressAgentToast = showTour || helpOpen;

  // Demo thesis state — auto-plays once on first visit
  const [demoPlayed, setDemoPlayed] = useState(() => localStorage.getItem('agentflow_demo_played_v1') === 'true');
  const [demoPlaying, setDemoPlaying] = useState(false);

  const startDemo = useCallback(() => {
    if (!demoPlayed) {
      localStorage.setItem('agentflow_demo_played_v1', 'true');
      setDemoPlayed(true);
    }
    setDemoPlaying(true);
  }, [demoPlayed]);

  // Convert toolLogs to collab events
  const recentCollabEvents = useMemo(() => {
    return toolLogs
      .slice(-COLLAB_HISTORY_LIMIT)
      .map(l => ({ actor: l.actor === 'you' ? 'human' as const : 'agent' as const, action: l.tool, time: Date.now() }));
  }, [toolLogs]);

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
          <div className={`webmcp-pill ${hasWebMCP ? 'ready' : 'needs'}`} title={hasWebMCP ? 'WebMCP: 27 tools ready — 8 new (find_nodes, get_execution_details, probe_api, undo) fix 10 limitations' : 'Enable one setting: chrome://flags/#enable-webmcp-testing → Enabled → Relaunch'}>
            <span className="webmcp-pill-dot" />
            {hasWebMCP ? 'WebMCP: 27 tools ready' : 'WebMCP: Enable one setting'}
          </div>
        </div>

        <div className="readout" data-state={runState}>
          <span className="led" />
          {runState.toUpperCase()}
        </div>

        <div className="rail-right">
          <div className="rail-counts">
            <b>{nodes.length}</b> MODULES · <b>{edges.length}</b> WIRES
          </div>
          <div className="rail-controls" style={{display:'none'}}>
            <button
              className={`rail-btn ${snapEnabled ? 'active' : ''}`}
              onClick={() => setSnapEnabled((v) => !v)}
              title={snapEnabled ? 'Disable snap-to-grid' : 'Enable snap-to-grid'}
              aria-label={snapEnabled ? 'Disable snap-to-grid' : 'Enable snap-to-grid'}
            >
              <span>{snapEnabled ? '✂' : '☐'}</span>
            </button>
            <button
              className="rail-btn"
              onClick={fitAllNodes}
              title="Fit to screen"
              aria-label="Fit to screen"
            >
              <span>⊕</span>
            </button>
          </div>
          <a
            className="rail-github-btn"
            href="https://github.com/Parithosh-Varma/agentflow-webmcp"
            target="_blank"
            rel="noreferrer"
            title="View on GitHub"
            aria-label="View on GitHub"
          >
            <GithubIcon size={16} />
            <span>GitHub</span>
          </a>
          <button
            className="rail-btn"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            title={theme === 'light' ? 'Switch to dark' : 'Switch to white mode'}
            aria-label="Toggle theme"
          >
            <span>{theme === 'light' ? '◐' : '◑'}</span>
          </button>
          <button
            className="rail-help-btn"
            onClick={() => setHelpOpen((v) => !v)}
            title="How to use (?)"
            aria-label="How to use"
          >
            ?
          </button>
        </div>
      </header>

      <CollaborationBar recentLogs={recentCollabEvents} />

      <div className={`main ${sidebarOpen ? '' : 'sidebar-closed'} ${isResizing ? 'resizing' : ''}`}>
        <div
          className={`sidebar-wrap ${sidebarOpen ? 'sidebar-wrap--open' : 'sidebar-wrap--closed'} ${isResizing ? 'resizing' : ''}`}
          aria-hidden={!sidebarOpen}
          style={sidebarOpen ? { width: sidebarWidth, transition: isResizing ? 'none' : undefined } : undefined}
        >
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
            executionResult={executionResult}
            isExecuting={isExecuting}
            setExecutionResult={setExecutionResult}
            setIsExecuting={setIsExecuting}
            setLiveStatus={setLiveStatus}
            toolLogs={toolLogs}
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
        </div>
        {sidebarOpen && (
          <div
            className={`sidebar-resizer ${isResizing ? 'resizing' : ''}`}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar — drag to resize, double-click to reset"
            title="Drag to resize • Double-click to reset"
            onDoubleClick={() => { setSidebarWidth(SIDEBAR_DEFAULT); try { localStorage.setItem('agentflow_sidebar_width_v1', String(SIDEBAR_DEFAULT)); } catch {} }}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
              const startX = e.clientX;
              const startW = sidebarWidthRef.current;
              let latest = startW;
              const onMove = (ev: MouseEvent) => {
                const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + ev.clientX - startX));
                latest = next;
                setSidebarWidth(next);
              };
              const onUp = () => {
                setIsResizing(false);
                try { localStorage.setItem('agentflow_sidebar_width_v1', String(latest)); } catch {}
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
              };
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              if (!touch) return;
              const startX = touch.clientX;
              const startW = sidebarWidthRef.current;
              let latest = startW;
              const onMove = (ev: TouchEvent) => {
                const t = (ev as TouchEvent).touches[0];
                if (!t) return;
                const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + t.clientX - startX));
                latest = next;
                setSidebarWidth(next);
              };
              const onUp = () => {
                setIsResizing(false);
                try { localStorage.setItem('agentflow_sidebar_width_v1', String(latest)); } catch {}
                window.removeEventListener('touchmove', onMove as any);
                window.removeEventListener('touchend', onUp);
              };
              setIsResizing(true);
              window.addEventListener('touchmove', onMove as any, { passive: false } as any);
              window.addEventListener('touchend', onUp);
            }}
          >
            <div className="sidebar-resizer-grip" aria-hidden="true" />
          </div>
        )}

        <div className="canvas-area" data-tour="canvas" data-onboarding="canvas-root" onDragOver={onDragOver} onDrop={onDrop} style={{ position: 'relative' }}>
          {(() => {
            const nonStartCount = nodes.filter((n) => n.id !== 'start').length;
            const showDemo = !demoPlayed && nonStartCount === 0 && !demoPlaying;
            const showEmpty = nonStartCount === 0 && !demoPlaying && !showDemo;
            return (
              <>
                {showDemo && <CanvasDemo onStartFlow={startDemo} isPlaying={demoPlaying} />}
                {showEmpty && (
                  <div className="canvas-empty" aria-live="polite">
                    <div className="canvas-empty-card canvas-empty-card--minimal">
                      <div className="canvas-empty-icon">◎</div>
                      <div className="canvas-empty-title">No modules yet</div>
                      <p className="canvas-empty-desc canvas-empty-desc--bold">Drag or ask agent — or hit ★ Judge Demo</p>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
          <ReactFlow
            nodes={decoratedNodes}
            edges={decoratedEdges}
            onInit={(inst: any) => { reactFlowRef.current = inst; }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onNodeDragStart={() => setIsDraggingNode(true)}
            onNodeDragStop={onNodeDragStop}
            isValidConnection={isValidConnection}
            deleteKeyCode={null}
            selectionOnDrag
            panOnDrag={[1, 2]}
            selectionMode={SelectionMode.Partial}
            connectionLineType={0 as any}
            connectionLineStyle={{ stroke: '#e8a33d', strokeWidth: 2 }}
            onSelectionChange={onSelectionChange}
            onNodeClick={(_, node) => {
              if (isDraggingNode) return;
              setSelectedId(node.id);
            }}
            onPaneClick={() => {
              setSelectedId(null);
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: 'labeled', style: { stroke: '#6366f1', strokeWidth: 2 } }}
            style={{ background: 'var(--bg)', width: '100%', height: '100%' }}
            proOptions={{ hideAttribution: false }}
          >
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMap
              nodeColor="#3a342c"
              maskColor="rgba(21,19,16,0.8)"
              style={{ background: 'var(--panel)', width: 130, height: 90 }}
              position="top-right"
            />
<Background variant={BackgroundVariant.Lines} gap={26} color="var(--grid-line)" />
          </ReactFlow>

          {selectedIds.length > 1 && (
            <div className="selection-bar">
              <span className="selection-bar-count">{selectedIds.length} selected</span>
              <button
                className="btn-ghost btn-small"
                onClick={() => {
                  const toDelete = selectedIds.filter((id) => id !== 'start');
                  if (!toDelete.length) return;
                  setNodes((nds: Node[]) => nds.filter((n) => !toDelete.includes(n.id)));
                  setEdges((eds: any[]) => eds.filter((e) => !toDelete.includes(e.source) && !toDelete.includes(e.target)));
                  setSelectedIds([]);
                  setSelectedId(null);
                  addToolLog('delete_nodes', { count: toDelete.length, ids: toDelete }, { success: true }, 'you');
                }}
              >
                Delete
              </button>
              <button className="btn-ghost btn-small" onClick={() => setSelectedIds([])}>
                Clear
              </button>
            </div>
          )}

        </div>

        {selectedId && (
          <Suspense fallback={null}>
            <NodePopover
              node={nodes.find((n) => n.id === selectedId) || null}
              onChange={applyConfig}
              onDelete={deleteNode}
              onClose={() => setSelectedId(null)}
            />
          </Suspense>
        )}
      </div>

      {!onboarding.isDismissed('canvas-tour') && showTour && (
        <Suspense fallback={null}>
          <TourOverlay steps={CANVAS_TOUR_STEPS} onComplete={completeTour} onSkip={completeTour} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} onReplay={resetOnboarding} />
      </Suspense>
      {!helpOpen && !showTour && (
        <button
          data-onboarding="help-tour-trigger"
          onClick={() => setShowTour(true)}
          title="Take a tour"
          className="tour-trigger-btn"
        >
          Take a tour
        </button>
      )}
      <AgentToast suppress={suppressAgentToast} delayMs={2500} autoHideMs={14000} />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* TOOL is public — single demo key */}
      <Route path="/" element={<CanvasPage />} />
      <Route path="/tool" element={<CanvasPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}


