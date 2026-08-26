import { type NodeProps, Handle, Position } from '@xyflow/react';
import { PlayIcon, GlobeIcon, TransformIcon, BranchIcon, SendIcon, ClockIcon } from '../icons';

const baseStyle = (color: string) => ({
  padding: '12px 16px',
  borderRadius: 10,
  border: `1px solid ${color}40`,
  background: `linear-gradient(135deg, ${color}15, ${color}08)`,
  minWidth: 140,
  fontSize: 13,
  color: '#e2e8f0',
  boxShadow: `0 2px 8px ${color}20`,
});

function NodeWrapper({ children, color, hasInput = true, hasOutput = true }: any) {
  return (
    <div style={baseStyle(color)}>
      {hasInput && <Handle type="target" position={Position.Left} style={{ background: color, width: 10, height: 10 }} />}
      {children}
      {hasOutput && <Handle type="source" position={Position.Right} style={{ background: color, width: 10, height: 10 }} />}
    </div>
  );
}

function NodeTitle({ icon, color, label }: { icon: React.ReactNode; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ display: 'inline-flex', color, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontWeight: 600, color }}>{label}</span>
    </div>
  );
}

export function StartNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#10b981" hasInput={false}>
      <NodeTitle icon={<PlayIcon size={12} />} color="#10b981" label="Start" />
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export function ApiCallNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#6366f1">
      <NodeTitle icon={<GlobeIcon size={13} />} color="#818cf8" label="API Call" />
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export function TransformNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#f59e0b">
      <NodeTitle icon={<TransformIcon size={13} />} color="#fbbf24" label="Transform" />
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export function ConditionNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#ec4899">
      <NodeTitle icon={<BranchIcon size={13} />} color="#f472b6" label="Condition" />
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export function OutputNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#14b8a6" hasOutput={false}>
      <NodeTitle icon={<SendIcon size={13} />} color="#2dd4bf" label="Output" />
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export function DelayNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#8b5cf6">
      <NodeTitle icon={<ClockIcon size={13} />} color="#a78bfa" label="Delay" />
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export const nodeTypes = {
  startNode: StartNode,
  apiCallNode: ApiCallNode,
  transformNode: TransformNode,
  conditionNode: ConditionNode,
  outputNode: OutputNode,
  delayNode: DelayNode,
};
