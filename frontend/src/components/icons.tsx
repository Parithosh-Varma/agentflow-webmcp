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
