import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
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
import { ExecutionPanel } from './components/ExecutionPanel';
import { ToolLog } from './components/ToolLog';
import { NodePopover } from './components/NodePopover';
import { WorkflowManager } from './components/WorkflowManager';
import { nodeTypes } from './components/nodes';
import { LabeledEdge } from './components/LabeledEdge';
import { useAuth } from './context/AuthContext';
import logo from './assets/logo.png';
import type { NodeStatus } from './engine';
import { localWireAdjust, snapAndPushOnDrop, snapToGrid, getSmartPlacement } from './utils/grid';
import { HelpDrawer } from './components/HelpDrawer';
import CommandPalette from './components/CommandPalette';
import { VaultDrawer } from './components/VaultDrawer';
import { HistoryTimeline } from './components/HistoryTimeline';
import { AgentToast } from './components/AgentToast';
import { GoogleAuthButton } from './components/GoogleAuthButton';
import { GithubIcon, VaultIcon, WarningIcon, EmptyIcon, StarIcon, DotFillIcon, DotOutlineIcon, CheckIcon, CrossIcon, ExternalLinkIcon, PanelLeftIcon, PanIcon, BoxSelectIcon } from './components/icons';

import { useOnboarding } from './onboarding/useOnboarding';
import { TourOverlay } from './onboarding/TourOverlay';
import { v4 as uuidv4 } from 'uuid';
import { NODE_DISPLAY_NAMES, getInstanceCount } from './components/nodes';
import {
  ReplayOverlay,
  ReplayInspector,
  useReplayController,
  buildReplayData,
} from './components/ExecutionReplay';

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
const WEBMCP_TOOLS_19 = WEBMCP_TOOLS_27; // compat alias

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
  if (recentLogs.length === 0) return null;
  const segments = recentLogs.slice(-COLLAB_HISTORY_LIMIT).map((e, i) => (
    <div
      key={i}
      className={`collab-bar__segment ${e.actor === 'human' ? 'collab-bar__segment--human' : 'collab-bar__segment--agent'}`}
      title={`${e.actor}: ${e.action}`}
    />
  ));

  return (
    <div className="collab-bar" aria-label="Live collaboration activity">
      <div className="collab-bar__track">
        {segments}
      </div>
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
          style: { stroke: 'var(--border)', strokeWidth: 1.6 },
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
        defaultEdgeOptions={{ type: 'labeled', style: { stroke: 'var(--border)', strokeWidth: 1.6 } }}
        fitView
        panOnDrag={[0, 1, 2]}
        panOnScroll
        zoomOnPinch
        zoomOnScroll
        style={{ background: 'var(--bg)', width: '100%', height: '100%' }}
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

function AvailableToolsDrawer({ hasWebMCP }: { hasWebMCP: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="available-tools">
      <button className="available-tools-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="available-tools-title">Available Tools (27)</span>
        <span className={`available-tools-badge ${hasWebMCP ? 'ready' : 'needs'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{hasWebMCP ? <><DotFillIcon size={7} /> ready</> : <><DotOutlineIcon size={7} /> needs enable</>}</span>
        <span className="available-tools-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="available-tools-body">
          <div className="available-tools-hint">Exposed via <code>document.modelContext.registerTool()</code> — agent calls these, you see ToolLog live. 8 new tools (find_nodes, get_execution_details, probe_api, undo…) fix the 10 reported limitations.</div>
          <div className="available-tools-group">
            <div className="available-tools-group-title">8 core</div>
            {WEBMCP_TOOLS_19.filter((t) => t.group === 'core').map((t) => (
              <div key={t.name} className="available-tool-row">
                <code className="available-tool-name">{t.name}</code>
                <span className="available-tool-desc">{t.desc}</span>
              </div>
            ))}
          </div>
          <div className="available-tools-group">
            <div className="available-tools-group-title">19 advanced (11+8 new)</div>
            {WEBMCP_TOOLS_19.filter((t) => t.group === 'advanced').map((t) => (
              <div key={t.name} className="available-tool-row">
                <code className="available-tool-name">{t.name}</code>
                <span className="available-tool-desc">{t.desc}</span>
              </div>
            ))}
          </div>
          <div className="available-tools-foot">See <code>webmcp.ts:22 registerTool</code> + <code>engine.ts:42 async runners</code> for execution. New tools: find_nodes, get_canvas_snapshot, probe_api, undo/redo.</div>
        </div>
      )}
    </div>
  );
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
  const { user, login, register, googleLogin } = useAuth();
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
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null);
  const [currentWorkflowName, setCurrentWorkflowName] = useState('Untitled');
  const [helpOpen, setHelpOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const onboarding = useOnboarding();
  const [showTour, setShowTour] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [showVaultLoginPrompt, setShowVaultLoginPrompt] = useState(false);
  const [vaultLoginMode, setVaultLoginMode] = useState<'login' | 'register'>('login');
  const [vaultEmail, setVaultEmail] = useState('');
  const [vaultUsername, setVaultUsername] = useState('');
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultLoginError, setVaultLoginError] = useState('');
  const [vaultLoginLoading, setVaultLoginLoading] = useState(false);
  const [popoverAnchorStyle, setPopoverAnchorStyle] = useState<React.CSSProperties>({});
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true); };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

  // Session ID for this tab
  const sessionId = getSessionId();
  const cacheKey = getCacheKey(sessionId);

  // Replay state
  const [replayData, setReplayData] = useState<any>(null);
  const [_showReplay, setShowReplay] = useState(false);
  const {
    isPlaying,
    currentTime,
    speed,
    inspectedNode,
    inspectNode,
    closeInspector,
  } = useReplayController(replayData);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const workflowHistoryRef = useRef<any[]>([]);
  const templatesRef = useRef<Record<string, { nodes: Node[]; edges: Edge[] }>>({});

  // Anchor popover to the right of the selected node (never covering it)
  const selectedNodeForPopover = nodes.find((n) => n.id === selectedId) || null;
  useEffect(() => {
    if (!selectedId || !selectedNodeForPopover) { setPopoverAnchorStyle({}); return; }
    const compute = () => {
      try {
        const NODE_W = 180; const POPOVER_W = 280; const POPOVER_H = 380; const GAP = 14;
        let screenX: number | null = null; let screenY: number | null = null;
        const inst: any = reactFlowRef.current;
        if (inst?.flowToScreenPosition) {
          const sp = inst.flowToScreenPosition({ x: selectedNodeForPopover.position.x, y: selectedNodeForPopover.position.y });
          screenX = sp.x; screenY = sp.y;
        } else {
          const el = document.querySelector(`.react-flow__node[data-id="${selectedId}"]`) as HTMLElement | null;
          if (el) { const r = el.getBoundingClientRect(); screenX = r.left; screenY = r.top; }
        }
        if (screenX == null || screenY == null) { setPopoverAnchorStyle({}); return; }
        const vw = window.innerWidth; const vh = window.innerHeight;
        let left = screenX + NODE_W + GAP;
        let top = screenY - 8;
        if (left + POPOVER_W > vw - 12) left = screenX - POPOVER_W - GAP;
        if (top + POPOVER_H > vh - 12) top = vh - POPOVER_H - 12;
        if (top < 64) top = 64;
        if (left < 12) left = 12;
        if (left + POPOVER_W > vw - 12) left = vw - POPOVER_W - 12;
        setPopoverAnchorStyle({ position: 'fixed' as const, left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, right: 'auto' as const, bottom: 'auto' as const });
      } catch { setPopoverAnchorStyle({}); }
    };
    compute();
    window.addEventListener('resize', compute);
    const iv = window.setInterval(compute, 250);
    const vp = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    let ro: ResizeObserver | null = null;
    if (vp) { ro = new ResizeObserver(compute); ro.observe(vp); }
    const mo = new MutationObserver(compute);
    if (vp) mo.observe(vp, { attributes: true, attributeFilter: ['style'] });
    return () => { window.removeEventListener('resize', compute); window.clearInterval(iv); if (ro) ro.disconnect(); mo.disconnect(); };
  }, [selectedId, selectedNodeForPopover?.position.x, selectedNodeForPopover?.position.y]);

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

  // Autosave disabled for results — workflow is saved to localStorage (nodes/edges only),
  // execution outputs stay in-memory and are never persisted to cloud/local cache.

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
      setNodes((nds: Node[]) => localWireAdjust(nds, [...edgesRef.current, params as any], params.source!, params.target!));
      setEdges((eds: any[]) =>
        addEdge({ ...params, type: 'labeled', animated: false, style: { stroke: 'var(--border)' } }, eds)
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
        data: { label: `${NODE_DISPLAY_NAMES[type] || type}_${getInstanceCount(type)}`, config: {}, nodeType: type },
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

  // P0.2 inline validation
  const validationErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    nodes.forEach((n: any) => {
      const t = (n.data as any)?.nodeType;
      const cfg = (n.data as any)?.config || {};
      if (t === 'api_call' && !cfg.url) errs[n.id] = 'Missing URL';
      if (t === 'email' && !cfg.to && !cfg.email) errs[n.id] = 'Missing recipient';
      if (t === 'slack' && !cfg.webhookUrl && !cfg.url) errs[n.id] = 'Missing webhook';
      if (t === 'database' && !cfg.query && !cfg.sql) errs[n.id] = 'Missing query';
      if (t === 'webhook' && !cfg.url) errs[n.id] = 'Missing URL';
      if (t === 'filter' && !cfg.expression) errs[n.id] = 'Missing expression';
      if (t === 'code' && !cfg.code && !cfg.expression) errs[n.id] = 'Missing code';
      if (t === 'ai' && !cfg.prompt) errs[n.id] = 'Missing prompt';
    });
    const nodeIds = new Set(nodes.map((n: any) => n.id));
    edges.forEach((e: any) => {
      if (!nodeIds.has(e.source)) errs[e.source] = 'Dangling wire';
      if (!nodeIds.has(e.target)) errs[e.target] = 'Dangling wire';
    });
    return errs;
  }, [nodes, edges]);

  const decoratedNodes = useMemo(() => {
    const hasLive = Object.keys(liveStatus).length > 0;
    const hasVal = Object.keys(validationErrors).length > 0;
    if (!hasLive && !hasVal) return nodes;
    return nodes.map((n: any) => ({
      ...n,
      data: {
        ...(n.data as any),
        status: liveStatus[n.id] || 'idle',
        validationError: validationErrors[n.id] || undefined,
      },
    }));
  }, [nodes, liveStatus, validationErrors]);

  const decoratedEdges = useMemo(() => {
    const hasLive = Object.keys(liveStatus).length > 0;
    const hasPreview = !!(executionResult as any)?.outputs;
    if (!hasLive && !hasPreview) return edges.map((e: any) => ({ ...e, className: '' }));
    return edges.map((e: any) => {
      const src = liveStatus[e.source];
      const dst = liveStatus[e.target];
      let cls = '';
      if (dst === 'running') cls = 'edge-flowing';
      else if ((src === 'done' || src === 'skipped') && (dst === 'done' || dst === 'skipped')) cls = 'edge-done';
      else if (dst === 'fault') cls = 'edge-faulted';
      else if (dst === 'skipped') cls = 'edge-skipped';
      // keep edge labels clean (true/false only) — data preview stays in e.data for tooltip, not in label text
      const preview = hasPreview ? (executionResult as any).outputs?.[e.source] : undefined;
      return { ...e, className: cls, data: { ...(e.data || {}), preview } };
    });
  }, [edges, liveStatus, executionResult]);

  const runState: 'idle' | 'running' | 'complete' | 'fault' = isExecuting
    ? 'running'
    : executionResult
      ? executionResult.success === false
        ? 'fault'
        : 'complete'
      : 'idle';

  const [showOutputModal, setShowOutputModal] = useState(false);
  const [modalOutputFilter, setModalOutputFilter] = useState('');

  // Display output when workflow is complete — ensure output is visible
  useEffect(() => {
    if (runState === 'complete' || runState === 'fault') {
      // Always open right panel so ExecutionPanel output is visible
      setRightPanelOpen(true);
      // Show prominent output modal overlay
      setShowOutputModal(true);
      // Scroll output into view after panel opens
      setTimeout(() => {
        document.querySelector('.exec-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 350);
    }
    if (runState === 'running') {
      // Hide previous output modal when a new run starts
      setShowOutputModal(false);
    }
  }, [runState]);

  // Allow Esc to dismiss output modal
  useEffect(() => {
    if (!showOutputModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowOutputModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showOutputModal]);

  // Build replay data when execution completes
  useEffect(() => {
    if ((runState === 'complete' || runState === 'fault') && executionResult) {
      const data = buildReplayData(executionResult, nodes, executionResult.order || []);
      if (data) {
        setReplayData(data);
        setShowReplay(true);
      }
    } else if (runState === 'idle') {
      setReplayData(null);
      setShowReplay(false);
    }
  }, [runState, executionResult, nodes]);

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
        setEdges(jdEdges.map((e: any) => ({ ...e, animated: false, style: { stroke: 'var(--border)', strokeWidth: 1.6 } })));
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

  const handleShareWorkflow = useCallback(async () => {
    const data = { nodes: nodesRef.current, edges: edgesRef.current, version: 1, sharedAt: new Date().toISOString() };
    const json = JSON.stringify(data);
    // encode safely for btoa (json is ascii-only in practice)
    const b64 = btoa(json);
    const url = `${window.location.origin}${window.location.pathname}?workflow=${encodeURIComponent(b64)}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
      addToolLog('export_workflow', { via: 'share' }, { success: true, url, byteLength: json.length }, 'you');
    } catch {
      window.prompt('Share this workflow URL:', url);
    }
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('workflow', b64);
      window.history.replaceState({}, '', u.toString());
    } catch {}
  }, [addToolLog]);

  const handleShareJudgeDemo = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?workflow=judge-demo`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1800);
      addToolLog('export_workflow', { via: 'share-judge' }, { success: true, url }, 'you');
    } catch {
      window.prompt('Share Judge Demo URL:', url);
    }
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('workflow', 'judge-demo');
      window.history.replaceState({}, '', u.toString());
    } catch {}
  }, [addToolLog]);

  const handleVaultLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultLoginError('');
    setVaultLoginLoading(true);
    try {
      if (vaultLoginMode === 'login') {
        await login(vaultEmail, vaultPassword);
      } else {
        await register(vaultUsername, vaultEmail, vaultPassword);
      }
      setShowVaultLoginPrompt(false);
      setVaultPassword('');
      setVaultLoginError('');
      // Auto-open vault after successful login
      setTimeout(() => setVaultOpen(true), 200);
    } catch (err: any) {
      setVaultLoginError(err?.message || 'Something went wrong');
    } finally {
      setVaultLoginLoading(false);
    }
  }, [vaultLoginMode, vaultEmail, vaultUsername, vaultPassword, login, register]);

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
      // favicon follows theme — white logo for dark bg, black logo for light paper
      const fav = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
      if (fav) fav.href = '/favicon.svg';
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
          <button
            className="rail-btn"
            onClick={() => {
              if (!user) {
                setShowVaultLoginPrompt(true);
                return;
              }
              setVaultOpen(v => !v);
            }}
            title={user ? "Secrets vault (Email/Slack/DB)" : "Sign in to manage secrets"}
            aria-label="Vault"
            style={{ position: 'relative', borderColor: vaultOpen ? 'var(--amber)' : undefined, color: vaultOpen ? 'var(--amber)' : undefined, opacity: !user ? 0.9 : 1 }}
          >
            <VaultIcon size={14} />
            {!user && <span style={{ position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', border: '1px solid var(--panel)', display: 'block' }} title="Login required" />}
          </button>
          {Object.keys(validationErrors).length > 0 && (
            <span title={Object.entries(validationErrors).map(([id, msg]) => `${id}: ${msg}`).join('\n')} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', border: '1px solid var(--red)', borderRadius: 99, padding: '3px 8px', background: 'rgba(224,93,68,0.08)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <WarningIcon size={10} /> {Object.keys(validationErrors).length} error{Object.keys(validationErrors).length > 1 ? 's' : ''}
            </span>
          )}
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
      {/* P0.1 palette + P1 drawers */}
      <CommandPalette onSelect={(type, nodeType) => {
        const pos = getSmartPlacement(nodesRef.current, selectedIdRef.current);
        const id = `node_${uuidv4().slice(0, 8)}`;
        const label = `${NODE_DISPLAY_NAMES[type] || type}_${getInstanceCount(type)}`;
        const actualPos = pos && typeof pos.x === 'number' ? pos : { x: 250, y: 150 };
        setNodes((nds: Node[]) => [...nds, { id, type: nodeType, position: actualPos, data: { label, config: {}, nodeType: type } } as any]);
        setSelectedId(id);
        setRightPanelOpen(true);
        addToolLog('add_node', { type, via: 'palette' }, { success: true, nodeId: id }, 'you');
      }} />
      <VaultDrawer open={vaultOpen && !!user} onClose={() => setVaultOpen(false)} />
      {Object.keys(validationErrors).length > 0 && (
        <div style={{ margin: '6px 12px 0', padding: '7px 10px', background: 'rgba(224,93,68,0.08)', border: '1px solid rgba(224,93,68,0.35)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <WarningIcon size={11} /> {Object.keys(validationErrors).length} validation issue{Object.keys(validationErrors).length > 1 ? 's' : ''}: {Object.values(validationErrors).slice(0, 2).join(' · ')}{Object.keys(validationErrors).length > 2 ? ` +${Object.keys(validationErrors).length - 2} more` : ''} — fix in node config or click error badge on module
        </div>
      )}

      <div className={`main ${sidebarOpen ? '' : 'sidebar-closed'} ${rightPanelOpen ? '' : 'right-closed'} ${isResizing ? 'resizing' : ''}`}>
        {!sidebarOpen && (
          <button
            className="sidebar-toggle sidebar-toggle--floating"
            onClick={() => setSidebarOpen(true)}
            title="Show sidebar"
            aria-label="Show sidebar"
          >
            <PanelLeftIcon size={16} />
          </button>
        )}
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
          {sidebarOpen && (
            <div className="sb-toggle-footer">
              <button
                className="sidebar-toggle sidebar-toggle--inside"
                onClick={() => setSidebarOpen(false)}
                title="Hide sidebar"
                aria-label="Hide sidebar"
              >
                <PanelLeftIcon size={16} />
              </button>
            </div>
          )}
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
                      <div className="canvas-empty-icon"><EmptyIcon size={20} /></div>
                      <div className="canvas-empty-title">No modules yet</div>
                      <p className="canvas-empty-desc canvas-empty-desc--bold">Start a workflow. Drag a module or try <b style={{display:'inline-flex', alignItems:'center', gap:4}}><StarIcon size={11} /> Judge Demo</b></p>
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
            onNodeDragStop={onNodeDragStop}
            selectionOnDrag={shiftHeld}
            panOnDrag={shiftHeld ? [1, 2] : [0, 1, 2]}
            panOnScroll
            panOnScrollSpeed={0.9}
            zoomOnPinch
            zoomOnScroll
            zoomOnDoubleClick
            selectionMode={SelectionMode.Partial}
            onSelectionChange={onSelectionChange}
            onNodeClick={(_, node) => {
              if (isPlaying && replayData) {
                inspectNode(node.id, null); // Will find latest event
              } else {
                setSelectedId(node.id);
                setRightPanelOpen(true);
              }
            }}
            onPaneClick={() => {
              setSelectedId(null);
              closeInspector();
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: 'labeled', style: { stroke: 'var(--border)', strokeWidth: 1.6 } }}
            style={{ background: 'var(--bg)' }}
          >
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMap
              nodeColor="var(--border)"
              maskColor="rgba(21,19,16,0.8)"
              style={{ background: 'var(--panel)', width: 130, height: 90 }}
              position="top-right"
            />
<Background variant={BackgroundVariant.Lines} gap={26} color="var(--grid-line)" />
          </ReactFlow>

          {/* Discoverable canvas gestures hint — hidden while box-selecting to avoid overlap */}
          {selectedIds.length <= 1 && (
            <div
              aria-live="polite"
              style={{
                position: 'absolute',
                bottom: 10,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 5,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 999,
                background: shiftHeld ? 'var(--amber-soft)' : 'var(--panel)',
                border: `1px solid ${shiftHeld ? 'var(--amber)' : 'var(--border)'}`,
                color: shiftHeld ? 'var(--amber)' : 'var(--faint)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.06em',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                transition: 'all 120ms ease',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: shiftHeld ? 'var(--amber)' : 'var(--ink-muted)', fontWeight: shiftHeld ? 700 : 500 }}>
                {shiftHeld ? <><BoxSelectIcon size={11} /> Box-select</> : <><PanIcon size={11} /> Pan</>}
              </span>
              <span style={{ opacity: 0.6 }}>·</span>
              <span>{shiftHeld ? 'drag to select nodes — release Shift to pan' : 'drag to pan • Hold Shift + drag to box-select • 2-finger swipe • pinch zoom'}</span>
            </div>
          )}

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

          {/* Replay Overlay - animated data packets */}
          {replayData && isPlaying && (
            <ReplayOverlay
              replayData={replayData}
              nodes={decoratedNodes}
              edges={decoratedEdges}
              currentTime={currentTime}
              isPlaying={isPlaying}
              speed={speed}
              onNodeInspect={inspectNode}
              reactFlowInstance={reactFlowRef.current}
            />
          )}
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
              <div className="share-row">
                <button className="btn-ghost btn-small" onClick={handleShareWorkflow} title="Copy shareable URL with current workflow encoded (?workflow=...)">
                  {shareCopied ? <><CheckIcon size={11} /> Copied link</> : <><ExternalLinkIcon size={11} /> Share workflow URL</>}
                </button>
                <button className="btn-ghost btn-small" onClick={handleShareJudgeDemo} title="Copy Judge Demo link (?workflow=judge-demo)">
                  <StarIcon size={11} /> Judge link
                </button>
              </div>
              <AvailableToolsDrawer hasWebMCP={hasWebMCP} />
              <div className="tool-log-highlight">
                <span className="actor-tag you">YOU</span> <span style={{ color: 'var(--faint)' }}>vs</span> <span className="actor-tag agent">AGENT</span>
                <span className="tool-log-highlight-desc">— every tool call streams here live with actor tags</span>
              </div>
              <ToolLog logs={toolLogs} />
              <div style={{ marginTop: 12 }}>
                <HistoryTimeline nodes={nodes} edges={edges} onRestore={(n,e) => { setNodes(n); setEdges(e); addToolLog('restore_history', {}, { success: true, nodes: n.length }, 'you'); }} />
              </div>
            </>
          )}
        </div>

        {selectedId && (
          <NodePopover
            node={nodes.find((n) => n.id === selectedId) || null}
            onChange={applyConfig}
            onDelete={deleteNode}
            onClose={() => setSelectedId(null)}
            anchorStyle={popoverAnchorStyle}
          />
        )}
      </div>

      {!onboarding.isDismissed('canvas-tour') && showTour && (
        <TourOverlay steps={CANVAS_TOUR_STEPS} onComplete={completeTour} onSkip={completeTour} />
      )}
      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} onReplay={resetOnboarding} />
      <AgentToast suppress={suppressAgentToast} delayMs={2500} autoHideMs={14000} />

      {/* Replay Node Inspector */}
      {inspectedNode && (
        <ReplayInspector
          node={nodes.find(n => n.id === inspectedNode.nodeId) || null}
          event={inspectedNode.event}
          onClose={closeInspector}
        />
      )}

      {/* Workflow Output — prominently displayed when workflow is complete */}
      {showOutputModal && executionResult && (() => {
        const formatOutput = (data: any): string => {
          if (data === undefined) return '—';
          if (data === null) return 'null';
          if (typeof data === 'string') return data;
          try { return JSON.stringify(data, null, 2); } catch { return String(data); }
        };
        const getLabel = (id: string): string => {
          const node = nodes.find((n: any) => n.id === id);
          if (!node) return id;
          const t = (node.data as any)?.nodeType || 'start';
          return `${NODE_DISPLAY_NAMES[t] || t}: ${(node.data as any)?.label || id}`;
        };
        const { outputs, status, order, durationMs, executedAt, success } = executionResult as any;
        // final output = last non-start node with data
        let finalNode: { id: string; output: any } | null = null;
        for (let i = order.length - 1; i >= 0; i--) {
          const oid = order[i];
          if (oid === 'start' || oid.startsWith('start')) continue;
          if (outputs[oid] !== undefined) { finalNode = { id: oid, output: outputs[oid] }; break; }
        }
        const nodeRows = order.filter((id: string) => id !== 'start' && !id.startsWith('start')).map((id: string) => ({
          id, label: getLabel(id), status: status[id] || 'idle', output: outputs[id]
        }));
        const isFault = success === false;
        const triggerDownload = (data: any, filename: string) => {
          const payload = data?.data ?? data;
          const content = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
          const blob = new Blob([content], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        };
        const finalIsDownload = finalNode?.output?.delivered === 'download_ready' || finalNode?.output?.delivered === 'write_ready';
        const finalDisplay = finalIsDownload ? finalNode?.output?.data : finalNode?.output;
        const finalJson = finalNode ? formatOutput(finalDisplay) : '';
        return (
          <div
            className="workflow-output-backdrop"
            onClick={() => setShowOutputModal(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Workflow output"
          >
            <div className="workflow-output-modal" onClick={(e) => e.stopPropagation()} role="document">
              <div className="workflow-output-header">
                <div className="workflow-output-title">
                  <span className={`workflow-output-badge ${isFault ? 'fault' : 'success'}`}>
                    {isFault ? <><CrossIcon size={10} /> Failed</> : <><CheckIcon size={10} /> Completed</>}
                  </span>
                  <h3>Workflow output</h3>
                  <span className="workflow-output-meta">
                    {durationMs}ms · {new Date(executedAt).toLocaleTimeString()} · {order.length} modules
                  </span>
                </div>
                <button
                  className="workflow-output-close"
                  onClick={() => setShowOutputModal(false)}
                  aria-label="Close output"
                  title="Close (Esc)"
                >
                  ✕
                </button>
              </div>

              {finalNode ? (
                <div className="workflow-output-final">
                  <div className="workflow-output-final-head">
                    <span className="workflow-output-kicker">Final output — {getLabel(finalNode.id)}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn-ghost btn-small"
                        onClick={() => navigator.clipboard.writeText(finalJson)}
                      >
                        Copy JSON
                      </button>
                      {finalIsDownload && (
                        <button
                          className="btn-ghost btn-small"
                          onClick={() => triggerDownload(finalNode.output, finalNode.output.filename || finalNode.output.path || 'flow-output.json')}
                        >
                          Download
                        </button>
                      )}
                    </div>
                  </div>
                  <pre className="workflow-output-pre">{finalJson}</pre>
                </div>
              ) : (
                <div className="workflow-output-final">
                  <span className="workflow-output-kicker">No final output — see node outputs below</span>
                </div>
              )}

              <details className="workflow-output-details" open>
                <summary>All node outputs ({nodeRows.length})</summary>
                <div style={{ padding: '8px 12px 0' }}>
                  <input
                    className="exec-output-filter"
                    placeholder="Filter nodes…"
                    value={modalOutputFilter}
                    onChange={e => setModalOutputFilter(e.target.value)}
                    aria-label="Filter node outputs"
                    style={{ width: '100%' }}
                  />
                </div>
                <div className="workflow-output-list">
                  {nodeRows.filter((r: any) => {
                    if (!modalOutputFilter.trim()) return true;
                    const q = modalOutputFilter.toLowerCase();
                    return r.label.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || String(r.status).toLowerCase().includes(q);
                  }).map((r: any) => {
                    const isDl = r.output?.delivered === 'download_ready' || r.output?.delivered === 'write_ready';
                    const display = isDl ? r.output.data : r.output;
                    return (
                    <div key={r.id} className={`workflow-output-row status-${r.status}`}>
                      <div className="workflow-output-row-head">
                        <span className={`exec-node-status-dot status-${r.status}`} title={r.status} />
                        <span className="workflow-output-row-label">{r.label}</span>
                        <span className="workflow-output-row-status">{r.status}</span>
                      </div>
                      <pre className="workflow-output-row-pre">{formatOutput(display)}</pre>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button className="btn-ghost btn-small" onClick={() => navigator.clipboard.writeText(formatOutput(display))}>Copy</button>
                        {isDl && (
                          <button className="btn-ghost btn-small" onClick={() => triggerDownload(r.output, r.output.filename || r.output.path || 'flow-output.json')}>Download</button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </details>

              {isFault && executionResult.outputs?.error && (
                <div className="exec-error" style={{ marginTop: 12 }}>
                  <span className="exec-error-icon"><WarningIcon size={12} /></span>
                  <pre>{executionResult.outputs.error}</pre>
                </div>
              )}

              <div className="workflow-output-actions">
                <button className="btn-ghost" onClick={() => setShowOutputModal(false)}>Close</button>
                <button
                  className="btn-run"
                  onClick={() => {
                    setShowOutputModal(false);
                    setRightPanelOpen(true);
                    setTimeout(() => document.querySelector('.exec-result')?.scrollIntoView({ behavior: 'smooth' }), 120);
                  }}
                >
                  View in panel
                </button>
              </div>

              <div className="workflow-output-hint">
                Output is also pinned in the right panel — copy any node, inspect telemetry, or press RUN again.
              </div>
            </div>
          </div>
        );
      })()}

      {/* Vault login required — secrets require authentication */}
      {showVaultLoginPrompt && (
        <div
          className="workflow-output-backdrop"
          onClick={() => setShowVaultLoginPrompt(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Login required for secrets"
          style={{ zIndex: 390 }}
        >
          <div
            className="vault-login-modal"
            onClick={(e) => e.stopPropagation()}
            role="document"
            style={{
              width: 'min(420px, 92vw)',
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              animation: 'workflow-output-card 0.28s var(--ease-entrance) forwards',
            }}
          >
            <div style={{ padding: '18px 18px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-raised)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><VaultIcon size={10} /> Vault locked</div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Login to manage secrets</h3>
                <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', lineHeight: 1.5 }}>Secrets are per-account and encrypted. Sign in to store Email / Slack / Database credentials.</p>
              </div>
              <button onClick={() => setShowVaultLoginPrompt(false)} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--faint)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
            </div>

            <div style={{ padding: '14px 18px', background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
              <button
                onClick={() => { setVaultLoginMode('login'); setVaultLoginError(''); }}
                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${vaultLoginMode === 'login' ? 'var(--amber)' : 'var(--border)'}`, background: vaultLoginMode === 'login' ? 'var(--amber-soft)' : 'var(--bg)', color: vaultLoginMode === 'login' ? 'var(--amber)' : 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer' }}
              >
                Sign In
              </button>
              <button
                onClick={() => { setVaultLoginMode('register'); setVaultLoginError(''); }}
                style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${vaultLoginMode === 'register' ? 'var(--amber)' : 'var(--border)'}`, background: vaultLoginMode === 'register' ? 'var(--amber-soft)' : 'var(--bg)', color: vaultLoginMode === 'register' ? 'var(--amber)' : 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer' }}
              >
                Create Account
              </button>
            </div>

            {vaultLoginError && <div role="alert" style={{ margin: '12px 18px 0', padding: '8px 10px', background: 'var(--red-soft)', border: '1px solid var(--fault)', borderRadius: 8, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fault)' }}>{vaultLoginError}</div>}

            <div style={{ padding: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <GoogleAuthButton
                text={vaultLoginMode === 'login' ? 'signin_with' : 'signup_with'}
                label={vaultLoginMode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}
                disabled={vaultLoginLoading}
                onSuccess={async (cred) => {
                  setVaultLoginError('');
                  setVaultLoginLoading(true);
                  try {
                    await googleLogin(cred);
                    setShowVaultLoginPrompt(false);
                    setVaultLoginError('');
                    setTimeout(() => setVaultOpen(true), 200);
                  } catch (err: any) {
                    setVaultLoginError(err?.message || 'Google sign-in failed');
                  } finally {
                    setVaultLoginLoading(false);
                  }
                }}
                onError={(msg) => setVaultLoginError(msg)}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)' }}>
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                or with email
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
            </div>

            <form onSubmit={handleVaultLogin} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {vaultLoginMode === 'register' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)' }}>Username</span>
                  <input
                    value={vaultUsername}
                    onChange={(e) => setVaultUsername(e.target.value)}
                    placeholder="your name"
                    required
                    autoComplete="username"
                    style={{ padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }}
                  />
                </label>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)' }}>Email</span>
                <input
                  value={vaultEmail}
                  onChange={(e) => setVaultEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  required
                  autoComplete="email"
                  style={{ padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)' }}>Password</span>
                <input
                  value={vaultPassword}
                  onChange={(e) => setVaultPassword(e.target.value)}
                  placeholder="••••••••"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={vaultLoginMode === 'login' ? 'current-password' : 'new-password'}
                  style={{ padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none' }}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)' }}>At least 6 characters</span>
              </label>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowVaultLoginPrompt(false)}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={vaultLoginLoading}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, border: 'none', background: 'var(--amber)', color: '#1a1408', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: vaultLoginLoading ? 'not-allowed' : 'pointer', opacity: vaultLoginLoading ? 0.6 : 1 }}
                >
                  {vaultLoginLoading ? 'Please wait…' : vaultLoginMode === 'login' ? 'Sign In → Vault' : 'Create Account → Vault'}
                </button>
              </div>

              <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)', marginTop: 2 }}>
                Secrets are saved per-account and synced across devices. <span style={{ color: 'var(--faint)' }}>Cancel keeps existing local vault until login.</span>
              </div>
            </form>
          </div>
        </div>
      )}
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
