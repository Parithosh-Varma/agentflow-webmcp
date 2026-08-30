import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import {
  CloseIcon,
  SkipBackIcon,
  PlayIcon,
  PauseIcon,
  SkipForwardIcon,
  StopIcon,
} from './icons';

interface ReplayEvent {
  nodeId: string;
  status: 'running' | 'done' | 'fault' | 'skipped';
  timestamp: number;
  input?: any;
  output?: any;
  error?: string;
}

interface ReplayData {
  events: ReplayEvent[];
  totalDuration: number;
  order: string[];
  nodeLabels: Record<string, string>;
}

interface ReplayBarProps {
  replayData: ReplayData | null;
  onClose: () => void;
  onReplay: (speed?: number) => void;
  onPause: () => void;
  onStop: () => void;
  onStep: (direction: 'forward' | 'back') => void;
  onScrub: (progress: number) => void;
  isPlaying: boolean;
  currentTime: number;
  speed: number;
}

export function ReplayBar({
  replayData,
  onClose,
  onReplay,
  onPause,
  onStop,
  onStep,
  onScrub,
  isPlaying,
  currentTime,
  speed,
}: ReplayBarProps) {
  if (!replayData) return null;

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const progress = replayData.totalDuration > 0 ? (currentTime / replayData.totalDuration) * 100 : 0;

  return (
    <div className="replay-bar" role="region" aria-label="Execution replay controls">
      <div className="replay-bar__header">
        <div className="replay-bar__title">
          <span className="replay-bar__kicker">REPLAY</span>
          <span>Execution Timeline</span>
        </div>
        <button className="replay-bar__close" onClick={onClose} aria-label="Close replay"><CloseIcon size={14} /></button>
      </div>

      <div className="replay-bar__timeline" onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        onScrub(Math.max(0, Math.min(1, pct)));
      }}>
        <div className="replay-bar__track" role="slider" aria-label="Execution progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <div className="replay-bar__progress" style={{ width: `${progress}%` }} />
          <div className="replay-bar__playhead" style={{ left: `${progress}%` }} />
        </div>
        <div className="replay-bar__events" role="img" aria-label={`${replayData.events.length} execution events`}>
          {replayData.events.map((evt, i) => {
            const pct = replayData.totalDuration > 0 ? (evt.timestamp / replayData.totalDuration) * 100 : 0;
            return (
              <div
                key={i}
                className={`replay-bar__event replay-bar__event--${evt.status}`}
                style={{ left: `${pct}%` }}
                title={`${replayData.nodeLabels[evt.nodeId] || evt.nodeId}: ${evt.status} at ${formatTime(evt.timestamp)}`}
              />
            );
          })}
        </div>
      </div>

      <div className="replay-bar__controls">
        <div className="replay-bar__time">
          <span className="replay-bar__current">{formatTime(currentTime)}</span>
          <span className="replay-bar__separator">/</span>
          <span className="replay-bar__total">{formatTime(replayData.totalDuration)}</span>
        </div>

        <div className="replay-bar__buttons">
          <button
            className="replay-btn"
            onClick={() => onStep('back')}
            disabled={isPlaying}
            aria-label="Step back"
            title="Step back"
          >
            <SkipBackIcon size={12} />
          </button>
          <button
            className="replay-btn replay-btn--main"
            onClick={isPlaying ? onPause : () => onReplay(speed)}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>
          <button
            className="replay-btn"
            onClick={() => onStep('forward')}
            disabled={isPlaying}
            aria-label="Step forward"
            title="Step forward"
          >
            <SkipForwardIcon size={12} />
          </button>
          <button
            className="replay-btn"
            onClick={onStop}
            disabled={!isPlaying && currentTime === 0}
            aria-label="Stop"
            title="Stop"
          >
            <StopIcon size={12} />
          </button>
        </div>

        <div className="replay-bar__speed">
          <label>
            <span className="replay-bar__speed-label">Speed</span>
            <select
              value={speed}
              onChange={(e) => onReplay(Number(e.target.value))}
              disabled={isPlaying}
              className="replay-bar__speed-select"
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </label>
        </div>
      </div>

      <div className="replay-bar__hint">
        Click any node on canvas during replay to inspect its input/output at that moment
      </div>
    </div>
  );
}

// ================================================================
// Data Packet - animated particle flowing along edges
// ================================================================

interface DataPacketProps {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  progress: number; // 0-1
  color: string;
  size?: number;
}

function DataPacket({ sourceX, sourceY, targetX, targetY, progress, color, size = 6 }: DataPacketProps) {
  // Quadratic bezier for curved flow
  const cpX = (sourceX + targetX) / 2;
  const cpY = (sourceY + targetY) / 2 - 60;
  
  const x = Math.pow(1 - progress, 2) * sourceX + 2 * (1 - progress) * progress * cpX + Math.pow(progress, 2) * targetX;
  const y = Math.pow(1 - progress, 2) * sourceY + 2 * (1 - progress) * progress * cpY + Math.pow(progress, 2) * targetY;

  return (
    <circle
      className="replay-packet"
      cx={x}
      cy={y}
      r={size}
      fill={color}
      filter="url(#packet-glow)"
      style={{
        animation: 'packet-pulse 0.6s ease-in-out infinite',
      }}
    />
  );
}

// ================================================================
// Replay Overlay - renders on top of ReactFlow canvas
// ================================================================

interface ReplayOverlayProps {
  replayData: ReplayData | null;
  nodes: Node[];
  edges: Edge[];
  currentTime: number;
  isPlaying: boolean;
  speed: number;
  onNodeInspect: (nodeId: string, event: ReplayEvent | null) => void;
  reactFlowInstance: any;
}

export function ReplayOverlay({
  replayData,
  nodes,
  edges,
  currentTime,
  isPlaying,
  onNodeInspect: _onNodeInspect,
}: ReplayOverlayProps) {
  // Get node positions from ReactFlow
  const nodePositions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      pos[n.id] = { x: n.position.x + (n.width || 180) / 2, y: n.position.y + (n.height || 64) / 2 };
    });
    return pos;
  }, [nodes]);

  // Calculate which packets should be visible at current time
  const activePackets = useMemo(() => {
    if (!replayData || !isPlaying) return [];
    
    const packets: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      progress: number;
      color: string;
      eventIndex: number;
    }> = [];

    replayData.events.forEach((evt, i) => {
      if (evt.status !== 'done' && evt.status !== 'running' && evt.status !== 'fault') return;
      
      // Find the edge that leads to this node
      const incomingEdge = edges.find(e => e.target === evt.nodeId);
      if (!incomingEdge) return;
      
      const prevEvent = replayData.events[i - 1];
      if (!prevEvent) return;

      const startTime = prevEvent.timestamp;
      const endTime = evt.timestamp;
      const duration = endTime - startTime;
      
      if (duration <= 0) return;

      const elapsed = currentTime - startTime;
      if (elapsed < 0 || elapsed > duration) return;

      const progress = elapsed / duration;
      packets.push({
        id: `packet-${incomingEdge.id}-${i}`,
        sourceId: incomingEdge.source,
        targetId: evt.nodeId,
        progress,
        color: evt.status === 'fault' ? 'var(--fault)' : 'var(--amber)',
        eventIndex: i,
      });
    });

    return packets;
  }, [replayData, edges, currentTime, isPlaying]);

  // SVG filter for packet glow
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const existingFilter = document.getElementById('packet-glow');
    if (!existingFilter) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.position = 'absolute';
      svg.style.width = '0';
      svg.style.height = '0';
      svg.innerHTML = `
        <defs>
          <filter id="packet-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      `;
      document.body.appendChild(svg);
    }
  }, []);

  if (!replayData || !isPlaying) return null;

  return (
    <svg
      className="replay-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 50,
        overflow: 'visible',
      }}
    >
      <defs>
        <filter id="packet-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      
      {activePackets.map((packet) => {
        const sourcePos = nodePositions[packet.sourceId];
        const targetPos = nodePositions[packet.targetId];
        if (!sourcePos || !targetPos) return null;

        // Adjust for node centers (ReactFlow nodes have handles at edges)
        const sourceNode = nodes.find(n => n.id === packet.sourceId);
        const targetNode = nodes.find(n => n.id === packet.targetId);
        
        const sx = sourcePos.x + (sourceNode?.width || 180) / 2;
        const sy = sourcePos.y;
        const tx = targetPos.x - (targetNode?.width || 180) / 2;
        const ty = targetPos.y;

        return (
          <DataPacket
            key={packet.id}
            sourceX={sx}
            sourceY={sy}
            targetX={tx}
            targetY={ty}
            progress={packet.progress}
            color={packet.color}
            size={7}
          />
        );
      })}
    </svg>
  );
}

// ================================================================
// Node Inspector Popover (during replay)
// ================================================================

interface ReplayInspectorProps {
  node: Node | null;
  event: ReplayEvent | null;
  onClose: () => void;
}

export function ReplayInspector({ node, event, onClose }: ReplayInspectorProps) {
  if (!node || !event) return null;

  const formatData = (data: any) => {
    if (!data) return '—';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const nodeLabel = String(node.data?.label ?? node.id);

  return (
    <div className="replay-inspector" role="dialog" aria-label="Node replay inspection">
      <div className="replay-inspector__header">
        <div>
          <div className="replay-inspector__node-name">{nodeLabel}</div>
          <div className="replay-inspector__timestamp">
            {new Date(event.timestamp).toLocaleTimeString()} · {event.status.toUpperCase()}
          </div>
        </div>
        <button className="replay-inspector__close" onClick={onClose} aria-label="Close"><CloseIcon size={14} /></button>
      </div>

      <div className="replay-inspector__body">
        {event.input !== undefined ? (
          <div className="replay-inspector__section">
            <div className="replay-inspector__section-title">Input</div>
            <pre className="replay-inspector__data">{formatData(event.input)}</pre>
          </div>
        ) : null}

        {event.output !== undefined ? (
          <div className="replay-inspector__section">
            <div className="replay-inspector__section-title">Output</div>
            <pre className="replay-inspector__data">{formatData(event.output)}</pre>
          </div>
        ) : null}

        {event.error ? (
          <div className="replay-inspector__section replay-inspector__section--error">
            <div className="replay-inspector__section-title">Error</div>
            <pre className="replay-inspector__data replay-inspector__data--error">{event.error}</pre>
          </div>
        ) : null}

        {!event.input && !event.output && !event.error ? (
          <div className="replay-inspector__empty">No data captured for this moment</div>
        ) : null}
      </div>
    </div>
  );
}

// ================================================================
// Replay Controller Hook
// ================================================================

export function useReplayController(replayData: ReplayData | null) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [inspectedNode, setInspectedNode] = useState<{ nodeId: string; event: ReplayEvent | null } | null>(null);
  const lastFrameRef = useRef<number>(0);
  const rafRef = useRef<number | undefined>(undefined);

  const play = useCallback((newSpeed?: number) => {
    if (!replayData || isPlaying) return;
    if (newSpeed !== undefined) setSpeed(newSpeed);
    if (currentTime >= replayData.totalDuration) setCurrentTime(0);
    setIsPlaying(true);
    lastFrameRef.current = performance.now();
  }, [replayData, isPlaying, currentTime]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
  }, []);

  const stop = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
  }, []);

  const step = useCallback((direction: 'forward' | 'back') => {
    if (!replayData) return;
    const stepSize = replayData.totalDuration / 100; // 1% steps
    setCurrentTime(prev => Math.max(0, Math.min(replayData.totalDuration, prev + (direction === 'forward' ? stepSize : -stepSize))));
  }, [replayData]);

  const scrub = useCallback((progress: number) => {
    if (!replayData) return;
    setCurrentTime(replayData.totalDuration * progress);
  }, [replayData]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !replayData) return;
    
    const tick = (now: number) => {
      const delta = (now - lastFrameRef.current) * speed;
      lastFrameRef.current = now;
      
      setCurrentTime(prev => {
        const next = prev + delta;
        if (next >= replayData.totalDuration) {
          setIsPlaying(false);
          return replayData.totalDuration;
        }
        return next;
      });
      
      rafRef.current = requestAnimationFrame(tick);
    };
    
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPlaying, speed, replayData]);

  const inspectNode = useCallback((nodeId: string, event: ReplayEvent | null) => {
    setInspectedNode({ nodeId, event });
  }, []);

  const closeInspector = useCallback(() => {
    setInspectedNode(null);
  }, []);

  return {
    isPlaying,
    currentTime,
    speed,
    play,
    pause,
    stop,
    step,
    scrub,
    inspectedNode,
    inspectNode,
    closeInspector,
  };
}

// ================================================================
// Build ReplayData from execution result
// ================================================================

export function buildReplayData(
  executionResult: any,
  _nodes: Node[],
  _executionOrder: string[]
): ReplayData | null {
  if (!executionResult || !executionResult.outputs) return null;

  const { outputs, status, order, durationMs } = executionResult;

  const events: ReplayEvent[] = order.map((nodeId: string, index: number) => {
    const nodeStatus = status[nodeId];
    const output = outputs[nodeId];
    
    // Estimate timestamp based on order and total duration
    const timestamp = index * (durationMs / Math.max(1, order.length - 1));
    
    return {
      nodeId,
      status: nodeStatus,
      timestamp,
      output,
      error: output?.error,
    };
  });

  const nodeLabels: Record<string, string> = {};
  _nodes.forEach((n: Node) => {
    const type = (n.data?.nodeType as string) || 'start';
    nodeLabels[n.id] = `${type}: ${n.data?.label || n.id}`;
  });

  return {
    events,
    totalDuration: durationMs || 1000,
    order,
    nodeLabels,
  };
}