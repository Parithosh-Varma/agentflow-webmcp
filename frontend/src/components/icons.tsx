interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/* ——— custom node icons ——— */

export function PlayIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" strokeOpacity={0.9} />
      <path d="M10 8.5 L17 12 L10 15.5 Z" fill="currentColor" stroke="none" />
      <path d="M10 8.5 L17 12 L10 15.5 Z" fill="none" stroke="currentColor" strokeWidth={1.4} />
    </svg>
  );
}

export function GlobeIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8.2" />
      <ellipse cx="12" cy="12" rx="4.2" ry="8.2" />
      <path d="M3.7 12h16.6" />
      <path d="M5.2 7.2h13.6" opacity={0.55} />
      <path d="M5.2 16.8h13.6" opacity={0.55} />
    </svg>
  );
}

export function TransformIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3.5" y="4.2" width="10" height="7.5" rx="1.6" />
      <rect x="10.5" y="12.3" width="10" height="7.5" rx="1.6" />
      <path d="M8.2 8l3 3-3 3" />
    </svg>
  );
}

export function BranchIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="7" r="3.5" />
      <path d="M12 10.5v6" />
      <path d="M12 16.5l-4 4" />
      <path d="M12 16.5l4 4" />
    </svg>
  );
}

export function SendIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 12l18-8-8 18-2-10-8 0z" />
    </svg>
  );
}

export function ClockIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function BoltIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13 2L3 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

export function FilterIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />
    </svg>
  );
}

export function SplitIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="6" r="2" />
      <path d="M12 8v4" />
      <path d="M12 12l-4 4" />
      <path d="M12 12l4 4" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

export function MergeIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="6" r="2" />
      <path d="M6 8l6 6" />
      <path d="M18 8l-6 6" />
      <circle cx="12" cy="18" r="2.5" />
    </svg>
  );
}

export function LoopIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 6v4a8 8 0 0 1-8 8h-4" />
      <path d="M4 12v4a8 8 0 0 0 8 8h4" />
      <path d="M18 6l2 2-2 2" />
      <path d="M6 18l-2-2 2-2" />
    </svg>
  );
}

export function CodeIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M16 18l-8-6 8-6" />
    </svg>
  );
}

export function WebhookIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12h6" />
      <path d="M12 9v6" />
    </svg>
  );
}

export function AiIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" />
    </svg>
  );
}

export function ValidatorIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2l8 4v6c0 4-3 7-8 8-5-1-8-4-8-8V6l8-4z" />
      <path d="M9 12l2 2 4-5" />
    </svg>
  );
}

export function LoggerIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 10h8M8 14h6" />
    </svg>
  );
}

export function FileIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export function AiBrainIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 13c0-4 3-7 7-7s7 3 7 7" />
      <path d="M5 13h14" />
    </svg>
  );
}

export function ChatGPTIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

export function GeminiIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l4 7h7l-5 5 2 8-7-4-7 4 2-8-5-5h7z" />
    </svg>
  );
}

/* ——— UI icons ——— */

export function CloseIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CheckIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12l5 5L19 7" />
    </svg>
  );
}

export function CrossIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function MenuIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 12h18M3 6h18M3 18h18" />
    </svg>
  );
}

export function ExternalLinkIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
    </svg>
  );
}

export function MinusIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function PlusIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function HomeIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function SettingsIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 1 4.6 9a1.65 1.65 0 0 1 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 1 1.51-1H9a1.65 1.65 0 0 1 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 1 15 4.6A1.65 1.65 0 0 1 16.83 3H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 1-1.51 1z" />
    </svg>
  );
}

/* ——— Additional UI icons ——— */

export function SparkleIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2l1 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4z" />
    </svg>
  );
}

export function CircleIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function FocusIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </svg>
  );
}

export function CopyIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function DiamondIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2L22 12L12 22L2 12Z" />
    </svg>
  );
}

export function HexagonIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

export function SkipBackIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" y1="19" x2="5" y2="5" />
    </svg>
  );
}

export function PauseIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

export function SkipForwardIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}

export function StopIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export function GithubIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0.3a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.04c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.83 1.23 1.83 1.23.96 1.64 2.59 1.17 3.22.89.09-.7.42-1.17.76-1.44-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.47 5.93.43.37.82 1.1.82 2.22v3.29c0 .32.22.69.82.57A12 12 0 0 0 12 0.3Z" />
    </svg>
  );
}

export function ScheduleIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 2v4M16 2v4M3 8h18" />
      <circle cx="12" cy="14" r="3" />
      <path d="M12 14v-2" />
    </svg>
  );
}

export function GraphQLIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2l9 6v8l-9 6-9-6V8z" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v4M12 18v4M3 8l4 2M17 10l4-2M3 16l4-2M17 14l4 2" />
    </svg>
  );
}

export function SetIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 12h8M8 15h5" />
    </svg>
  );
}

export function SwitchIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M7 10l-2 2 2 2M17 10l2 2-2 2" />
      <path d="M7 12h10" />
    </svg>
  );
}

export function AggregateIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="16" width="4" height="4" />
      <rect x="10" y="10" width="4" height="10" />
      <rect x="16" y="4" width="4" height="16" />
    </svg>
  );
}

export function SortIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 6l-3 3 3 3M16 18l3-3-3-3" />
      <path d="M5 9h8M19 15H11" />
    </svg>
  );
}

export function LimitIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 6h16M4 12h10M4 18h7" />
      <circle cx="18" cy="18" r="3" />
      <path d="M18 16v4M16 18h4" opacity={0.6} />
    </svg>
  );
}

export function ItemListsIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <rect x="3" y="10" width="18" height="5" rx="1" />
      <rect x="3" y="17" width="12" height="5" rx="1" />
    </svg>
  );
}

export function FunctionIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 6h10l-4 6 4 6H5" />
      <circle cx="17" cy="12" r="2" />
    </svg>
  );
}

export function NoOpIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M8 8l8 8" />
    </svg>
  );
}

export function WebhookResponseIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 4l8 6-8 6-8-6z" />
      <path d="M12 10v8" />
    </svg>
  );
}

export function HtmlIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 3l2 8 3-8 3 8 2-8" />
      <path d="M5 15h14" />
      <path d="M7 15l-1 6M17 15l1 6M9 18h6" />
    </svg>
  );
}

export function DateTimeIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
      <circle cx="12" cy="14" r="2.5" />
    </svg>
  );
}

export function SlackIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="3" width="6" height="6" rx="1.5" />
      <rect x="15" y="3" width="6" height="6" rx="1.5" />
      <rect x="3" y="15" width="6" height="6" rx="1.5" />
      <rect x="15" y="15" width="6" height="6" rx="1.5" />
    </svg>
  );
}

export function DiscordIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 5c4-1 8-1 12 0l1 10c-1 2-3 3-6 4-3-1-5-2-6-4z" />
      <circle cx="9" cy="13" r="1.5" />
      <circle cx="15" cy="13" r="1.5" />
    </svg>
  );
}

export function GmailIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 7 9-7" />
    </svg>
  );
}

export function GoogleSheetsIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 3v4h8" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  );
}

export function NotionIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
      <path d="M12 8v8" />
    </svg>
  );
}

export function AirtableIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 7h4v10H7zM13 7h4v6h-4z" />
    </svg>
  );
}

export function PostgresIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12c0 1.7 3 3 7 3s7-1.3 7-3" />
    </svg>
  );
}

export function MySQLIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M7 16V8l3-2 3 2v8l-3 2z" />
      <path d="M7 8l3 2 3-2" />
      <path d="M10 14l3-2" />
    </svg>
  );
}

export function MongoDBIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3c-4 3-6 6-6 9 0 3 2 6 6 9 4-3 6-6 6-9 0-3-2-6-6-9z" />
      <path d="M12 8c-2 1.5-3 3-3 4.5 0 1.8 1 3.5 3 5.5" />
    </svg>
  );
}

export function RedisIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 9l7-5 7 5-7 5z" />
      <path d="M5 15l7 5 7-5" />
      <path d="M5 9v6l7 5v-6z" />
    </svg>
  );
}

export function StripeIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function ShopifyIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 7l3-4 5 1-1 5-7 6-3-2z" />
      <circle cx="12" cy="16" r="2" />
    </svg>
  );
}

export function AwsS3Icon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 10l9-6 9 6-9 6z" />
      <path d="M3 14l9 6 9-6" />
      <path d="M3 10v4l9 6v-4z" />
    </svg>
  );
}

export function OpenAIIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3l2 3h3l-2 3 1 4-4-1-4 1 1-4-2-3h3z" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

export function ChatIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4" width="18" height="13" rx="2.5" />
      <path d="M7 17 L7 21 L11 17" fill="currentColor" stroke="none" />
      <path d="M7 21.5 L7 17 L11 17" fill="none" stroke="currentColor" />
      <path d="M8 8h8M8 11h8M8 14h5" opacity={0.95} />
    </svg>
  );
}

export function VaultIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M9 11V8.5a3 3 0 0 1 6 0V11" />
      <circle cx="12" cy="16" r="1.8" fill="currentColor" stroke="none" />
      <path d="M12 17.8v1.7" />
    </svg>
  );
}

export function WarningIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3 L22 20 H2 Z" />
      <path d="M12 9v6M12 17.5h.01" strokeWidth={2} />
    </svg>
  );
}

export function StarIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2.8l2.2 4.6 5.1.7-3.7 3.6.9 5.1L12 14.3l-4.5 2.5.9-5.1-3.7-3.6 5.1-.7L12 2.8z" />
    </svg>
  );
}

export function EmptyIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.5" opacity={0.9} />
      <circle cx="12" cy="12" r="3.2" opacity={0.95} />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function DotFillIcon({ size = 8, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export function DotOutlineIcon({ size = 8, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className={className}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export function UndoIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 8H5v4" />
      <path d="M5 8a8 8 0 1 0 8 8" />
      <path d="M9 12l-4-4 4-4" opacity={0.0} />
    </svg>
  );
}

export function RedoIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M15 8h4v4" />
      <path d="M19 8a8 8 0 1 1-8 8" />
    </svg>
  );
}

export function RefreshIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v6h-6" />
    </svg>
  );
}

export function PanelLeftIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

export function PanIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12 11V5a1 1 0 0 1 1-1h.5a1 1 0 0 1 1 1v5" />
      <path d="M9 9V6a1 1 0 0 1 1-1h.5a1 1 0 0 1 1 1v6" />
      <path d="M15 11V7a1 1 0 0 1 1-1h.5a1 1 0 0 1 1 1v6.5a3.5 3.5 0 0 1-3.5 3.5H10a3 3 0 0 1-3-3V11" />
      <path d="M6 10V9a1 1 0 0 1 1-1h.5a1 1 0 0 1 1 1v3.5" />
    </svg>
  );
}

export function BoxSelectIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="13" rx="1.8" strokeDasharray="3.5 2.5" />
      <circle cx="3.5" cy="4.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="20.5" cy="17.5" r="1" fill="currentColor" stroke="none" />
      <path d="M12 8.5l-1.2 2.2H8l2 1.6-.7 2.2L12 12.8l2.7 1.7-.7-2.2 2-1.6h-2.8z" opacity={0.0} />
    </svg>
  );
}
