import { type NodeProps, Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import {
  PlayIcon, GlobeIcon, TransformIcon, BranchIcon, SendIcon, ClockIcon,
  FilterIcon, SplitIcon, MergeIcon, LoopIcon, CodeIcon, WebhookIcon,
  AiIcon, ValidatorIcon, LoggerIcon, FileIcon,
} from '../icons';

const TYPE_META: Record<string, { tint: string; icon: ReactNode }> = {
  start:     { tint: '#9ba657', icon: <PlayIcon size={11} /> },
  api_call:  { tint: '#8f9fdd', icon: <GlobeIcon size={12} /> },
  transform: { tint: '#e0b45c', icon: <TransformIcon size={12} /> },
  condition: { tint: '#d98aa6', icon: <BranchIcon size={12} /> },
  output:    { tint: '#6cc7ba', icon: <SendIcon size={12} /> },
  delay:     { tint: '#ab97d4', icon: <ClockIcon size={12} /> },
  filter:    { tint: '#e8a33d', icon: <FilterIcon size={12} /> },
  split:     { tint: '#56cdbd', icon: <SplitIcon size={12} /> },
  merge:     { tint: '#7ec8e3', icon: <MergeIcon size={12} /> },
  loop:      { tint: '#c9a0dc', icon: <LoopIcon size={12} /> },
  code:      { tint: '#a8d8a8', icon: <CodeIcon size={12} /> },
  webhook:   { tint: '#f0a07a', icon: <WebhookIcon size={12} /> },
  ai:        { tint: '#ff6b9d', icon: <AiIcon size={12} /> },
  validator: { tint: '#7dd3fc', icon: <ValidatorIcon size={12} /> },
  logger:    { tint: '#d4a574', icon: <LoggerIcon size={12} /> },
  file:      { tint: '#93c5fd', icon: <FileIcon size={12} /> },
};

function Module(props: NodeProps) {
  const { data, type } = props;
  const key = (data?.nodeType as string) || (type === 'startNode' ? 'start' : 'api_call');
  const meta = TYPE_META[key] || TYPE_META.api_call;
  const typeLabel = key === 'start' ? 'start' : key.replace('_', ' ');
  const status = (data?.status as string) || 'idle';

  return (
    <div className="module" style={{ ['--tint' as any]: meta.tint }}>
      <Handle
        type="target"
        position={Position.Left}
        className="pin"
        style={{ background: 'var(--line)' }}
      />
      <span className="module-chip">{meta.icon}</span>
      <div className="module-body">
        <span className="module-type">{typeLabel}</span>
        <span className="module-label">{String(data?.label)}</span>
      </div>
      <span className="module-led" data-status={status} title={status} />
      <Handle
        type="source"
        position={Position.Right}
        className="pin"
        style={{ background: 'var(--line)' }}
      />
    </div>
  );
}

export const nodeTypes = {
  startNode: Module,
  apiCallNode: Module,
  transformNode: Module,
  conditionNode: Module,
  outputNode: Module,
  delayNode: Module,
  filterNode: Module,
  splitNode: Module,
  mergeNode: Module,
  loopNode: Module,
  codeNode: Module,
  webhookNode: Module,
  aiNode: Module,
  validatorNode: Module,
  loggerNode: Module,
  fileNode: Module,
};
