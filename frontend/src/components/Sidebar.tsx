import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { getInstanceCount, NODE_DISPLAY_NAMES } from './nodes';
import {
  GlobeIcon, TransformIcon, BranchIcon, SendIcon, ClockIcon,
  FilterIcon, SplitIcon, MergeIcon, LoopIcon, CodeIcon, WebhookIcon,
  AiIcon, ValidatorIcon, LoggerIcon, FileIcon,
  PlayIcon, ScheduleIcon,
  CloseIcon, ChevronRightIcon, FocusIcon, CopyIcon, StarIcon,
} from './icons';
import { getSmartPlacement, snapToGrid } from '../utils/grid';
import type { NodeStatus } from '../engine';
import './Sidebar.css';

// ——— catalog with categories + descriptions ———
type Category = 'Triggers' | 'Connect' | 'Logic' | 'Transform' | 'Output' | 'AI';

export const NODE_CATALOG: Array<{
  type: string;
  nodeType: string;
  label: string;
  category: Category;
  desc: string;
  icon: ReactNode;
  color: string;
}> = [
  // Triggers
  { type: 'manual_trigger', nodeType: 'startNode', label: 'Manual Trigger', category: 'Triggers', desc: 'Click RUN to start',     icon: <PlayIcon size={13} />,     color: '#9ba657' },
  { type: 'schedule',  nodeType: 'scheduleNode', label: 'Schedule',  category: 'Triggers',   desc: 'Cron / interval tick',  icon: <ScheduleIcon size={13} />, color: '#f59e0b' },
  { type: 'webhook',   nodeType: 'webhookNode',  label: 'Webhook',   category: 'Triggers',   desc: 'Incoming HTTP trigger',    icon: <WebhookIcon size={13} />,   color: '#f0a07a' },
  // Connect
  { type: 'api_call',  nodeType: 'apiCallNode',  label: 'API Call',  category: 'Connect',   desc: 'Fetch any REST API',      icon: <GlobeIcon size={13} />,     color: '#8f9fdd' },
  { type: 'file',      nodeType: 'fileNode',     label: 'File',      category: 'Connect',   desc: 'Read / write files',      icon: <FileIcon size={13} />,      color: '#93c5fd' },
  // Logic
  { type: 'condition', nodeType: 'conditionNode',label: 'Condition', category: 'Logic',     desc: 'If / else branch',        icon: <BranchIcon size={13} />,    color: '#d98aa6' },
  { type: 'filter',    nodeType: 'filterNode',   label: 'Filter',    category: 'Logic',     desc: 'Keep matching rows',      icon: <FilterIcon size={13} />,    color: '#e8a33d' },
  { type: 'split',     nodeType: 'splitNode',    label: 'Split',     category: 'Logic',     desc: 'Fan-out parallel',        icon: <SplitIcon size={13} />,     color: '#56cdbd' },
  { type: 'merge',     nodeType: 'mergeNode',    label: 'Merge',     category: 'Logic',     desc: 'Join streams',            icon: <MergeIcon size={13} />,     color: '#7ec8e3' },
  { type: 'loop',      nodeType: 'loopNode',     label: 'Loop',      category: 'Logic',     desc: 'Repeat over items',       icon: <LoopIcon size={13} />,      color: '#c9a0dc' },
  // Transform
  { type: 'transform', nodeType: 'transformNode',label: 'Transform', category: 'Transform', desc: 'Map & reshape data',      icon: <TransformIcon size={13} />, color: '#e0b45c' },
  { type: 'code',      nodeType: 'codeNode',     label: 'Code',      category: 'Transform', desc: 'Run JS snippet',          icon: <CodeIcon size={13} />,      color: '#a8d8a8' },
  { type: 'validator', nodeType: 'validatorNode',label: 'Validator', category: 'Transform', desc: 'Schema check',            icon: <ValidatorIcon size={13} />, color: '#7dd3fc' },
  { type: 'delay',     nodeType: 'delayNode',    label: 'Delay',     category: 'Transform', desc: 'Wait / throttle',         icon: <ClockIcon size={13} />,     color: '#ab97d4' },
{ type: 'ai', nodeType: 'aiNode', label: 'AI', category: 'AI', desc: 'LLM inference', icon: <AiIcon size={13} />, color: '#ff6b9d' },
  // Output
  { type: 'output',    nodeType: 'outputNode',   label: 'Output',    category: 'Output',    desc: 'Save or POST result',     icon: <SendIcon size={13} />,      color: '#6cc7ba' },
  { type: 'logger',    nodeType: 'loggerNode',   label: 'Logger',    category: 'Output',    desc: 'Console telemetry',       icon: <LoggerIcon size={13} />,    color: '#d4a574' },
];

const CATEGORIES: Category[] = ['Triggers', 'Connect', 'Logic', 'Transform', 'Output', 'AI'];

interface Props {
  nodes: Node[];
  setNodes: any;
  setEdges: any;
  edges: Edge[];
  selectedId: string | null;
  setSelectedId?: (id: string | null) => void;
  liveStatus?: Record<string, NodeStatus>;
  addToolLog: (tool: string, input: any, result: any, actor?: 'agent' | 'you') => void;
  clearRunState: () => void;
  reactFlowRef?: React.MutableRefObject<any>;
  children?: ReactNode;
}

function buildExampleFlow(): { nodes: Node[]; edges: any[] } {
  const typeMap: Record<string, string> = {
    api_call: 'apiCallNode',
    transform: 'transformNode',
    condition: 'conditionNode',
    output: 'outputNode',
    delay: 'delayNode',
    start: 'startNode',
  };
  const n = (id: string, type: string, x: number, y: number, label: string, config: any): Node => ({
    id,
    type: typeMap[type] || `${type}Node`,
    position: { x, y },
    data: { label, config, nodeType: type },
  });
  const nodes: Node[] = [
    n('start', 'start', 80, 170, 'Start', {}),
    n('ex_api', 'api_call', 360, 80, 'github repo', {
      url: 'https://api.github.com/repos/cloudflare/workers-sdk',
      method: 'GET',
    }),
    n('ex_tf', 'transform', 640, 80, 'pick stars', {
      op: 'expression',
      expression: '(data) => ({ full_name: data.full_name, stars: data.stargazers_count })',
    }),
    n('ex_cond', 'condition', 640, 170, 'popular?', {
      expression: '(data) => Number(data.stars) > 10000',
    }),
    n('ex_out_dl', 'output', 920, 80, 'save report', {
      kind: 'download',
      filename: 'repo-stars',
    }),
    n('ex_out_log', 'output', 920, 260, 'log it', { kind: 'console' }),
  ];
  const edges = [
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'start', target: 'ex_api', label: '', type: 'labeled' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'ex_api', target: 'ex_tf', label: '', type: 'labeled' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'ex_tf', target: 'ex_cond', label: '', type: 'labeled' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'ex_cond', target: 'ex_out_dl', label: 'true', type: 'labeled' },
    { id: `edge_${uuidv4().slice(0, 8)}`, source: 'ex_cond', target: 'ex_out_log', label: 'false', type: 'labeled' },
  ];
  return { nodes, edges };
}

export function buildJudgeDemoFlow(): { nodes: Node[]; edges: any[] } {
  const typeMap: Record<string, string> = {
    api_call: 'apiCallNode',
    transform: 'transformNode',
    condition: 'conditionNode',
    output: 'outputNode',
    delay: 'delayNode',
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
  // 30s wow: Start → HN API → AI Summarize → Condition → Split → [download + logger]
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
    n('jd_out_dl', 'output', 1180, 40, 'save report', {
      kind: 'download',
      filename: 'hn-summary-report',
    }),
    n('jd_logger', 'logger', 1180, 160, 'log it', {
      level: 'info',
      message: 'HackerNews summary ready',
    }),
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

export function Sidebar({
  nodes, setNodes, setEdges, selectedId, setSelectedId,
  liveStatus, addToolLog, clearRunState, reactFlowRef, children
}: Props) {
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<Category | 'All'>('All');
  const [collapsed, setCollapsed] = useState<Set<Category>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" to focus search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return NODE_CATALOG.filter((nt) => {
      const catOk = activeCat === 'All' || nt.category === activeCat;
      if (!catOk) return false;
      if (!q) return true;
      return (
        nt.label.toLowerCase().includes(q) ||
        nt.type.toLowerCase().includes(q) ||
        nt.desc.toLowerCase().includes(q) ||
        nt.category.toLowerCase().includes(q)
      );
    });
  }, [search, activeCat]);

  const grouped = useMemo(() => {
    const map: Record<string, typeof NODE_CATALOG> = {};
    for (const cat of CATEGORIES) map[cat] = [];
    for (const nt of filtered) map[nt.category].push(nt);
    return map;
  }, [filtered]);

  const toggleCollapse = (cat: Category) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const addNode = (type: string, nodeType: string, posOverride?: { x: number; y: number }) => {
    const nodeLabel = label.trim() || `${NODE_DISPLAY_NAMES[type] || type}_${getInstanceCount(type)}`;
    const pos = posOverride ? snapToGrid(posOverride.x, posOverride.y) : getSmartPlacement(nodes, selectedId);
    const newNode: Node = {
      id: `node_${uuidv4().slice(0, 8)}`,
      type: nodeType,
      position: posOverride ? { x: pos.x, y: pos.y } : pos,
      data: { label: nodeLabel, config: {}, nodeType: type },
    };
    setNodes((nds: Node[]) => [...nds, newNode]);
    addToolLog('add_node', { type, label: nodeLabel }, { success: true, nodeId: newNode.id }, 'you');
    setLabel('');
    // auto-select new node
    setSelectedId?.(newNode.id);
  };

  const handleDragStart = (e: React.DragEvent, type: string, nodeType: string) => {
    const payload = JSON.stringify({ type, nodeType });
    e.dataTransfer.setData('application/agentflow', payload);
    e.dataTransfer.setData('text/plain', type);
    e.dataTransfer.effectAllowed = 'copy';
    // subtle ghost image styling via opacity
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
      setTimeout(() => { if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = '1'; }, 0);
    }
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
    setSelectedId?.(null);
  };

  const loadJudgeDemo = () => {
    const { nodes: jdNodes, edges: jdEdges } = buildJudgeDemoFlow();
    clearRunState();
    setNodes(jdNodes);
    setEdges(
      jdEdges.map((e) => ({
        ...e,
        animated: false,
        style: { stroke: '#3a342c', strokeWidth: 1.6 },
      }))
    );
    addToolLog(
      'load_judge_demo',
      {},
      { success: true, message: 'Loaded JUDGE DEMO: HN API → AI summarize → Condition → Split → Download + Log — press RUN to see LEDs + ToolLog live' },
      'you'
    );
    setSelectedId?.(null);
    // update URL for shareable demo
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('workflow', 'judge-demo');
      window.history.replaceState({}, '', url.toString());
    } catch {}
  };

  void loadExample; void loadJudgeDemo;
  const clearCanvas = () => {
    const startNode = nodes.find((n) => n.id === 'start');
    const keep = startNode ? [startNode] : nodes.slice(0, 1);
    setNodes(keep);
    setEdges([]);
    clearRunState();
    setSelectedId?.(keep[0]?.id || null);
    addToolLog('clear_canvas', {}, { success: true, kept: keep.length }, 'you');
  };

  const focusNode = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    setSelectedId?.(id);
    // try to center via ReactFlow
    if (reactFlowRef?.current) {
      try {
        const rf = reactFlowRef.current;
        if (rf.setCenter) {
          const x = node.position.x + 90;
          const y = node.position.y + 32;
          rf.setCenter(x, y, { zoom: 1, duration: 400 });
        } else if (rf.fitView) {
          rf.fitView({ padding: 0.2, duration: 400, nodes: [{ id }] });
        }
      } catch { /* fallback: just select */ }
    }
  };

  const duplicateNode = (id: string) => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const newId = `node_${uuidv4().slice(0, 8)}`;
    const pos = { x: node.position.x + 40, y: node.position.y + 40 };
    const snapped = snapToGrid(pos.x, pos.y);
    const clone: Node = {
      ...node,
      id: newId,
      position: { x: snapped.x, y: snapped.y },
      data: { ...(node.data as any), label: `${String((node.data as any)?.label)} copy` },
    };
    setNodes((nds: Node[]) => [...nds, clone]);
    addToolLog('duplicate_node', { source: id }, { success: true, newId }, 'you');
    setSelectedId?.(newId);
  };

  const deleteNode = (id: string) => {
    if (id === 'start') return; // protected
    setNodes((nds: Node[]) => nds.filter((n) => n.id !== id));
    setEdges((eds: Edge[]) => eds.filter((e) => e.source !== id && e.target !== id));
    if (selectedId === id) setSelectedId?.(null);
    addToolLog('delete_node', { nodeId: id }, { success: true }, 'you');
  };

  const nonStartCount = nodes.filter((n) => n.id !== 'start').length;

  return (
    <aside className="sidebar" data-tour="sidebar">
      {/* Modules */}
      <div className="sb-header">
        <div className="sb-title-row">
          <h2 className="sidebar-section-title" style={{ margin: 0 }}>Modules</h2>
          <span className="sb-count">{filtered.length} / {NODE_CATALOG.length}</span>
        </div>

        <div className="kumo-search-outer">
          <label className="kumo-search-inner">
            <span className="kumo-search-icon" aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256"><path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z"/></svg>
            </span>
            <input
              ref={searchRef}
              className="kumo-search-input"
              placeholder="Search"
              aria-label="Search modules"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search ? (
              <button className="sb-search-clear" onClick={() => setSearch('')} aria-label="Clear search" style={{position:'static'}}><CloseIcon size={12} /></button>
            ) : (
              <span className="kumo-kbd-row" aria-hidden="true">
                <kbd className="kumo-kbd">⌘</kbd><kbd className="kumo-kbd">K</kbd>
              </span>
            )}
          </label>
        </div>

        <div className="sb-pills" role="tablist" aria-label="Filter by category">
          {(['All', ...CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={activeCat === cat}
              className={`sb-pill ${activeCat === cat ? 'active' : ''}`}
              onClick={() => setActiveCat(cat as any)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="sb-label-row">
          <input
            className="sidebar-input sb-label-input"
            placeholder="Custom label for next module (optional)"
            aria-label="New module name"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) setLabel(label.trim()); }}
          />
          {label && (
            <button className="sb-label-clear" onClick={() => setLabel('')} aria-label="Clear label"><CloseIcon size={12} /></button>
          )}
        </div>
      </div>

      <div className="sb-scroll">
        {filtered.length === 0 ? (
          <div className="sb-empty">
            <div className="sb-empty-icon">∅</div>
            <p>No modules match “{search}”</p>
            <button className="btn-ghost btn-small" onClick={() => { setSearch(''); setActiveCat('All'); }}>Clear filters</button>
          </div>
        ) : activeCat !== 'All' ? (
          <div className="node-grid">
            {filtered.map((nt) => (
              <button
                key={nt.type}
                data-onboarding={nt.type === 'api_call' ? 'add-node-button' : undefined}
                className="node-btn"
                draggable
                onDragStart={(e) => handleDragStart(e, nt.type, nt.nodeType)}
                onClick={() => addNode(nt.type, nt.nodeType)}
                title={`${nt.label} — ${nt.desc} (drag to canvas)`}
                aria-label={`Add ${nt.label}`}
              >
                <span className="node-btn-icon" style={{ color: nt.color }}>{nt.icon}</span>
                <span className="node-btn-text">
                  <b>{nt.label}</b>
                  <i>{nt.desc}</i>
                </span>
              </button>
            ))}
          </div>
        ) : (
          CATEGORIES.map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const isCollapsed = collapsed.has(cat);
            return (
              <div key={cat} className="sb-category">
                <button className="sb-cat-header" onClick={() => toggleCollapse(cat)} aria-expanded={!isCollapsed}>
                  <ChevronRightIcon size={10} className={`sb-cat-caret ${isCollapsed ? '' : 'open'}`} />
                  <span className="sb-cat-title">{cat}</span>
                  <span className="sb-cat-count">{items.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="node-grid">
                    {items.map((nt) => (
                      <button
                        key={nt.type}
                        data-onboarding={nt.type === 'api_call' ? 'add-node-button' : undefined}
                        className="node-btn"
                        draggable
                        onDragStart={(e) => handleDragStart(e, nt.type, nt.nodeType)}
                        onClick={() => addNode(nt.type, nt.nodeType)}
                        title={`${nt.label} — ${nt.desc} (drag to canvas)`}
                        aria-label={`Add ${nt.label}`}
                      >
                        <span className="node-btn-icon" style={{ color: nt.color }}>{nt.icon}</span>
                        <span className="node-btn-text">
                          <b>{nt.label}</b>
                          <i>{nt.desc}</i>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* On Canvas */}
      <div className="sidebar-section sb-canvas-section">
        <div className="sb-canvas-header">
          <div className="sidebar-section-title" style={{ margin: 0 }}>On Canvas</div>
          <span className="sb-canvas-count">{nodes.length}</span>
          {nonStartCount > 0 && (
            <button className="sb-canvas-clear" onClick={clearCanvas} title="Clear canvas (keeps Start)">Clear</button>
          )}
        </div>

        {nodes.length === 0 ? (
          <div className="sb-empty-canvas">
            <p className="sb-empty-canvas-title">No modules yet</p>
            <p className="hint sb-empty-canvas-hint">Start a new workflow. Drag a module here or try <b style={{display:'inline-flex',alignItems:'center',gap:4}}><StarIcon size={10} /> Judge Demo</b> for a 30s walkthrough.</p>
          </div>
        ) : (
          <div className="node-list">
            {nodes.map((n) => {
              const t = String((n.data as any)?.nodeType || 'start');
              const isStart = n.id === 'start';
              const isSelected = selectedId === n.id;
              const status = liveStatus?.[n.id] as NodeStatus | undefined;
              const dotColor: Record<string, string> = {
                start: '#9ba657', manual_trigger: '#9ba657', schedule: '#f59e0b', api_call: '#8f9fdd', transform: '#e0b45c',
                condition: '#d98aa6', output: '#6cc7ba', delay: '#ab97d4',
                filter: '#e8a33d', split: '#56cdbd', merge: '#7ec8e3',
                loop: '#c9a0dc', code: '#a8d8a8', webhook: '#f0a07a',
                ai: '#ff6b9d', validator: '#7dd3fc', logger: '#d4a574',
                file: '#93c5fd',
              };
              return (
                <div
                  key={n.id}
                  className={`node-item ${isSelected ? 'node-item-active' : ''} ${status ? `status-${status}` : ''}`}
                  onClick={() => focusNode(n.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusNode(n.id); } }}
                  title="Click to focus • hover for actions"
                >
                  <span className="node-dot" style={{ background: dotColor[t] || '#8f867a' }} />
                  <span className="node-item-label">{String(n.data?.label)}</span>
                  {status && status !== 'idle' && <span className={`node-status-dot s-${status}`} title={status} />}
                  <span className="node-actions">
                    <button
                      className="node-action"
                      onClick={(e) => { e.stopPropagation(); focusNode(n.id); }}
                      title="Focus in canvas"
                      aria-label="Focus"
                    >
                      <FocusIcon size={12} />
                    </button>
                    <button
                      className="node-action"
                      onClick={(e) => { e.stopPropagation(); duplicateNode(n.id); }}
                      title="Duplicate"
                      aria-label="Duplicate"
                    >
                      <CopyIcon size={12} />
                    </button>
                    <button
                      className="node-action danger"
                      onClick={(e) => { e.stopPropagation(); deleteNode(n.id); }}
                      title={isStart ? 'Start cannot be deleted' : 'Delete'}
                      aria-label="Delete"
                      disabled={isStart}
                      style={{ opacity: isStart ? 0.3 : 1, cursor: isStart ? 'not-allowed' : 'pointer' }}
                    >
                      <CloseIcon size={12} />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <p className="sb-canvas-hint">
          {selectedId ? 'Selected module opens tuner on right.' : 'Click a row to focus. Hover for duplicate / delete.'}
        </p>
      </div>



      {children}

      <div className="sidebar-section sb-footer">
        <p className="hint">
          <b>Drag</b> a module to canvas or <b>click</b> to add at smart position. Connect via pins; label condition wires{' '}
          <code>true</code>/<code>false</code>. Agent tools:{' '}
          <code>add_node</code> <code>connect_nodes</code> <code>run</code>.
        </p>
      </div>
    </aside>
  );
}
