import { type NodeProps, Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import {
  PlayIcon, GlobeIcon, TransformIcon, BranchIcon, SendIcon, ClockIcon,
  FilterIcon, SplitIcon, MergeIcon, LoopIcon, CodeIcon, WebhookIcon,
  AiIcon, ValidatorIcon, LoggerIcon, FileIcon,
  ScheduleIcon, GraphQLIcon, SetIcon, SwitchIcon, AggregateIcon, SortIcon, LimitIcon, ItemListsIcon, FunctionIcon, NoOpIcon, WebhookResponseIcon, HtmlIcon, DateTimeIcon,
  SlackIcon, DiscordIcon, GithubIcon, GmailIcon, GoogleSheetsIcon, NotionIcon, AirtableIcon, PostgresIcon, MySQLIcon, MongoDBIcon, RedisIcon, StripeIcon, ShopifyIcon, AwsS3Icon, OpenAIIcon,
} from '../icons';

// Custom nodes — lazy to avoid circular import (engine imports nodes)
let customNodesCache: any[] = [];
function loadCustomNodesSync(): any[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = localStorage.getItem('agentflow_custom_nodes_v1');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    }
  } catch {}
  return [];
}
function getCustomIconByName(name: string, size = 11): ReactNode {
  const map: Record<string, ReactNode> = {
    CodeIcon: <CodeIcon size={size} />,
    GlobeIcon: <GlobeIcon size={size} />,
    TransformIcon: <TransformIcon size={size} />,
    BranchIcon: <BranchIcon size={size} />,
    SendIcon: <SendIcon size={size} />,
    ClockIcon: <ClockIcon size={size} />,
    FilterIcon: <FilterIcon size={size} />,
    SplitIcon: <SplitIcon size={size} />,
    MergeIcon: <MergeIcon size={size} />,
    LoopIcon: <LoopIcon size={size} />,
    WebhookIcon: <WebhookIcon size={size} />,
    AiIcon: <AiIcon size={size} />,
    ValidatorIcon: <ValidatorIcon size={size} />,
    LoggerIcon: <LoggerIcon size={size} />,
    FileIcon: <FileIcon size={size} />,
    ScheduleIcon: <ScheduleIcon size={size} />,
    GraphQLIcon: <GraphQLIcon size={size} />,
    SetIcon: <SetIcon size={size} />,
    SwitchIcon: <SwitchIcon size={size} />,
    AggregateIcon: <AggregateIcon size={size} />,
    SortIcon: <SortIcon size={size} />,
    LimitIcon: <LimitIcon size={size} />,
    ItemListsIcon: <ItemListsIcon size={size} />,
    FunctionIcon: <FunctionIcon size={size} />,
    NoOpIcon: <NoOpIcon size={size} />,
    WebhookResponseIcon: <WebhookResponseIcon size={size} />,
    HtmlIcon: <HtmlIcon size={size} />,
    DateTimeIcon: <DateTimeIcon size={size} />,
    SlackIcon: <SlackIcon size={size} />,
    DiscordIcon: <DiscordIcon size={size} />,
    GithubIcon: <GithubIcon size={size} />,
    GmailIcon: <GmailIcon size={size} />,
    GoogleSheetsIcon: <GoogleSheetsIcon size={size} />,
    NotionIcon: <NotionIcon size={size} />,
    AirtableIcon: <AirtableIcon size={size} />,
    PostgresIcon: <PostgresIcon size={size} />,
    MySQLIcon: <MySQLIcon size={size} />,
    MongoDBIcon: <MongoDBIcon size={size} />,
    RedisIcon: <RedisIcon size={size} />,
    StripeIcon: <StripeIcon size={size} />,
    ShopifyIcon: <ShopifyIcon size={size} />,
    AwsS3Icon: <AwsS3Icon size={size} />,
    OpenAIIcon: <OpenAIIcon size={size} />,
  };
  return map[name] || <CodeIcon size={size} />;
}

export const NODE_DISPLAY_NAMES: Record<string, string> = {
  start:     'Start',
  manual_trigger: 'Manual Trigger',
  api_call:  'API Call',
  transform: 'Transform',
  condition: 'Condition',
  output:    'Output',
  delay:     'Delay',
  filter:    'Filter',
  split:     'Split',
  merge:     'Merge',
  loop:      'Loop',
  code:      'Code',
  webhook:   'Webhook',
  ai:        'AI',
  validator: 'Validator',
  logger:    'Logger',
  file:      'File',
  // New major n8n nodes
  schedule:  'Schedule',
  graphql:   'GraphQL',
  set:       'Set',
  switch:    'Switch',
  aggregate: 'Aggregate',
  sort:      'Sort',
  limit:     'Limit',
  item_lists: 'Item Lists',
  function:  'Function',
  noop:      'NoOp',
  webhook_response: 'Webhook Response',
  html:      'HTML',
  date_time: 'Date & Time',
  slack:     'Slack',
  discord:   'Discord',
  github:    'GitHub',
  gmail:     'Gmail',
  google_sheets: 'Google Sheets',
  notion:    'Notion',
  airtable:  'Airtable',
  postgres:  'Postgres',
  mysql:     'MySQL',
  mongodb:   'MongoDB',
  redis:     'Redis',
  stripe:    'Stripe',
  shopify:   'Shopify',
  aws_s3:    'AWS S3',
  openai:    'OpenAI',
};

const TYPE_META: Record<string, { tint: string; icon: ReactNode }> = {
  start:     { tint: '#9ba657', icon: <PlayIcon size={11} /> },
  manual_trigger: { tint: '#9ba657', icon: <PlayIcon size={11} /> },
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
  // New
  schedule:  { tint: '#f59e0b', icon: <ScheduleIcon size={12} /> },
  graphql:   { tint: '#e535ab', icon: <GraphQLIcon size={12} /> },
  set:       { tint: '#34d399', icon: <SetIcon size={12} /> },
  switch:    { tint: '#f43f5e', icon: <SwitchIcon size={12} /> },
  aggregate: { tint: '#8b5cf6', icon: <AggregateIcon size={12} /> },
  sort:      { tint: '#06b6d4', icon: <SortIcon size={12} /> },
  limit:     { tint: '#a3a3a3', icon: <LimitIcon size={12} /> },
  item_lists:{ tint: '#f97316', icon: <ItemListsIcon size={12} /> },
  function:  { tint: '#a8d8a8', icon: <FunctionIcon size={12} /> },
  noop:      { tint: '#a8a3a3', icon: <NoOpIcon size={12} /> },
  webhook_response: { tint: '#f0a07a', icon: <WebhookResponseIcon size={12} /> },
  html:      { tint: '#ea580c', icon: <HtmlIcon size={12} /> },
  date_time: { tint: '#0ea5e9', icon: <DateTimeIcon size={12} /> },
  slack:     { tint: '#e01e5a', icon: <SlackIcon size={12} /> },
  discord:   { tint: '#5865f2', icon: <DiscordIcon size={12} /> },
  github:    { tint: '#24292e', icon: <GithubIcon size={12} /> },
  gmail:     { tint: '#ea4335', icon: <GmailIcon size={12} /> },
  google_sheets: { tint: '#0f9d58', icon: <GoogleSheetsIcon size={12} /> },
  notion:    { tint: '#000000', icon: <NotionIcon size={12} /> },
  airtable:  { tint: '#18bfff', icon: <AirtableIcon size={12} /> },
  postgres:  { tint: '#336791', icon: <PostgresIcon size={12} /> },
  mysql:     { tint: '#00758f', icon: <MySQLIcon size={12} /> },
  mongodb:   { tint: '#47a248', icon: <MongoDBIcon size={12} /> },
  redis:     { tint: '#dc382d', icon: <RedisIcon size={12} /> },
  stripe:    { tint: '#635bff', icon: <StripeIcon size={12} /> },
  shopify:   { tint: '#96bf48', icon: <ShopifyIcon size={12} /> },
  aws_s3:    { tint: '#ff9900', icon: <AwsS3Icon size={12} /> },
  openai:    { tint: '#10a37f', icon: <OpenAIIcon size={12} /> },
};

function Module(props: NodeProps) {
  const { data, type } = props;
  const key = (data?.nodeType as string) || (type === 'startNode' ? 'start' : 'api_call');
  const meta = TYPE_META[key] || TYPE_META.api_call;
  const displayName = NODE_DISPLAY_NAMES[key] || key.replace('_', ' ').split(' ').map((s: string) => s[0].toUpperCase() + s.slice(1)).join(' ');
  const typeLabel = displayName;
  const status = (data?.status as string) || 'idle';

  return (
    <div className="module" style={{ ['--tint' as any]: meta.tint }}>
      <Handle
        type="target"
        position={Position.Left}
        className="pin"
        isConnectable={true}
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
        isConnectable={true}
        style={{ background: 'var(--line)' }}
      />
    </div>
  );
}

const instanceCounters = new Map<string, number>();

export function getInstanceCount(typeKey: string): number {
  const prev = instanceCounters.get(typeKey) ?? 0;
  const next = prev + 1;
  instanceCounters.set(typeKey, next);
  return next;
}

export const nodeTypes: Record<string, any> = {
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
  scheduleNode: Module,
  graphqlNode: Module,
  setNode: Module,
  switchNode: Module,
  aggregateNode: Module,
  sortNode: Module,
  limitNode: Module,
  itemListsNode: Module,
  functionNode: Module,
  noopNode: Module,
  webhookResponseNode: Module,
  htmlNode: Module,
  dateTimeNode: Module,
  slackNode: Module,
  discordNode: Module,
  githubNode: Module,
  gmailNode: Module,
  googleSheetsNode: Module,
  notionNode: Module,
  airtableNode: Module,
  postgresNode: Module,
  mysqlNode: Module,
  mongodbNode: Module,
  redisNode: Module,
  stripeNode: Module,
  shopifyNode: Module,
  awsS3Node: Module,
  openaiNode: Module,
  customNode: Module,
};

// Inject custom nodes at load-time + on updates
function syncCustomNodes() {
  try {
    const customs = loadCustomNodesSync();
    customNodesCache = customs;
    for (const c of customs) {
      NODE_DISPLAY_NAMES[c.type] = c.displayName;
      TYPE_META[c.type] = { tint: c.color || '#a8d8a8', icon: getCustomIconByName(c.icon || 'CodeIcon', 11) };
      const rt = `${c.type}Node`;
      if (!(nodeTypes as any)[rt]) (nodeTypes as any)[rt] = Module;
      if (!(nodeTypes as any)['customNode']) (nodeTypes as any)['customNode'] = Module;
    }
    const customTypes = new Set(customs.map((c: any) => c.type));
    for (const k of Object.keys(NODE_DISPLAY_NAMES)) {
      if (k.startsWith('custom_') && !customTypes.has(k)) {
        delete NODE_DISPLAY_NAMES[k];
        delete TYPE_META[k];
      }
    }
  } catch {}
}
try {
  syncCustomNodes();
  if (typeof window !== 'undefined') {
    window.addEventListener('custom-nodes-updated', () => syncCustomNodes());
    window.addEventListener('storage', (e: any) => { if (e.key === 'agentflow_custom_nodes_v1') syncCustomNodes(); });
  }
} catch {}

export function getCustomNodesCache() { return customNodesCache; }
