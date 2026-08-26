import { type NodeProps, Handle, Position } from '@xyflow/react';

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

export function StartNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#10b981" hasInput={false}>
      <div style={{ fontWeight: 600, color: '#10b981' }}>▶ Start</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export function ApiCallNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#6366f1">
      <div style={{ fontWeight: 600, color: '#818cf8' }}>🌐 API Call</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export function TransformNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#f59e0b">
      <div style={{ fontWeight: 600, color: '#fbbf24' }}>⚙ Transform</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export function ConditionNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#ec4899">
      <div style={{ fontWeight: 600, color: '#f472b6' }}>◆ Condition</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export function OutputNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#14b8a6" hasOutput={false}>
      <div style={{ fontWeight: 600, color: '#2dd4bf' }}>📤 Output</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{String(data.label)}</div>
    </NodeWrapper>
  );
}

export function DelayNode({ data }: NodeProps) {
  return (
    <NodeWrapper color="#8b5cf6">
      <div style={{ fontWeight: 600, color: '#a78bfa' }}>⏱ Delay</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{String(data.label)}</div>
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
