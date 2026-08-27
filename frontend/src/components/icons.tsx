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

export function PlayIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M7 4.5 L19 12 L7 19.5 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function GlobeIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15.3 15.3 0 0 1 4 9 15.3 15.3 0 0 1-4 9 15.3 15.3 0 0 1-4-9 15.3 15.3 0 0 1 4-9z" />
    </svg>
  );
}

export function TransformIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 6h11l3 3-3 3H4" />
      <path d="M20 18H9l-3-3 3-3h11" />
    </svg>
  );
}

export function BranchIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="8.5" y="3.5" width="7" height="7" rx="1" transform="rotate(45 12 7)" />
      <path d="M12 11v4" />
      <path d="M12 15l-4.5 4.5M12 15l4.5 4.5" />
    </svg>
  );
}

export function SendIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M21 3L10.5 13.5" />
      <path d="M21 3l-6.5 18-4-7.5L3 9.5 21 3z" />
    </svg>
  );
}

export function ClockIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5" />
      <path d="M9 2h6" />
    </svg>
  );
}

export function BoltIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />
    </svg>
  );
}

export function FilterIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3 4h18l-7 8.5V20l-4 2v-9.5L3 4z" />
    </svg>
  );
}

export function SplitIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 3v6" />
      <path d="M12 9l-4 5" />
      <path d="M12 9l4 5" />
      <path d="M8 14v4" />
      <path d="M16 14v4" />
    </svg>
  );
}

export function MergeIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 3v6" />
      <path d="M16 3v6" />
      <path d="M8 9l4 5" />
      <path d="M16 9l-4 5" />
      <path d="M12 14v6" />
    </svg>
  );
}

export function LoopIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M17 2l3 3-3 3" />
      <path d="M4 12V9a4 4 0 0 1 4-4h13" />
      <path d="M7 22l-3-3 3-3" />
      <path d="M20 12v3a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

export function CodeIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

export function WebhookIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 16.98h-5.99c-1.1 0-1.95.51-2.45 1.09" />
      <path d="M18 16.98c.51.58.51 1.5 0 2.08-.5.58-1.36.58-1.86 0" />
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export function AiIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
      <path d="M8 6a4 4 0 0 1 8 0" />
      <path d="M6 12h12" />
      <path d="M8 16l-2 4" />
      <path d="M16 16l2 4" />
      <path d="M10 20h4" />
    </svg>
  );
}

export function ValidatorIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

export function LoggerIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  );
}

export function FileIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M13 2v7h7" />
    </svg>
  );
}

export function AiBrainIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="8" r="5" />
      <path d="M7 13c-2.5 0-4 1.5-4 4v1h18v-1c0-2.5-1.5-4-4-4" />
      <path d="M10 8h4" />
      <path d="M12 6v4" />
    </svg>
  );
}

export function ChatGPTIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 7.36 8.207 5.807.546-1.615.717-7.305 1.607-7.305 1.845 0 6.365 3.437 11.978 7.123 11.978v2.187l-1.68-1.188c-.563-.393-1.528-.393-2.091 0L12 24l-3.235-2.267c-.566-.397-1.53-.393-2.093 0L.84 22.813C2.289 24 5.067 24 6.51 24c3.192 0 7.927-2.654 9.41-5.238-1.125.928-2.563 1.35-4.41 1.35-5.938 0-9.625-5.088-9.625-9.625 0-4.718 2.967-7.418 5.807-7.936.545.086.783.136.98.136 4.975 0 9.093 4.038 9.093 9.093 0 5.413-3.138 7.743-6.73 7.936.918.393 1.267.442 1.912.21 1.513-.562 2.96-.062 3.636-.393.525-.325.93-.6 1.19-.39.228-.678-.165-.842-.375-.163-.21-.245-.442-.245-.777v-2.235c0-.333-.033-.488-.05-.61-.026-.193-.06-.358-.115-.483zm0-2c-6.626 0-12 5.373-12 12 0 5.302 3.438 7.36 8.207 5.807-.545 1.615-.717 7.305-1.606 7.305-1.845 0-6.365-3.438-11.978-7.123-11.978-1.845 0-6.364 3.437-11.978 7.123 0 .538.168.91.42 1.19.6.6 1.624 1.464 2.565 1.75 5.305 1.295 1.26 2.934 3.044 5.123 4.255-.637 2.683-2.233 4.618-4.418 5.526.415.167.91.23 1.43.23s.998-.062 1.41-.23c2.185-1.15 3.74-2.617 4.41-4.036 1.568-2.563 1.607-5.883 1.587-5.883-1.415 0-2.318-.67-2.565-1.145a14.06 14.06 0 00-.393-2.016 5.978 5.978 0 00-3.008-.805 5.993 5.993 0 00-3.305 2.057 5.99 5.99 0 00-1.532 3.075c-.44 1.978-1.017 3.3 2.068 3.3 2.625 0 3.718-1.08 4.198-2.175a13.978 13.978 0 003.018-1.75 5.967 5.967 0 001.987-3.057 5.994 5.994 0 00-.568-3.018 5.996 5.996 0 00-3.062-1.195z"/>
    </svg>
  );
}

export function GeminiIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 2c1.657 0 3 .895 3 2s-1.343 2-3 2-3-.895-3-2-1.343-2-3-2S2 5.895 2 7.5 3.343 9.5 5 9.5c1.657 0 3 .895 3 2s-1.343 2-3 2-3-.895-3-2-1.343-2-3-2S2 5.895 2 7.5c0-2.208 1.464-3.333 3.536-3.032V7.5c0 .582.339 1.04.824 1.304-1.42.81-2.716.186-3.535-1.065-.53-.546-1.037-1.237-1.48-2.155V5.5C8.89 6.808 8.36 6 7.5 6 5.39 6 3.61 3.367 2.225.075A6.968 6.968 0 0 0 12 2Zm9.65 12.5-2.156-1.276a.75.75 0 0 0-.529-.237l-.163.128.528-.855a1.25 1.25 0 0 0-.07-.651l-.855-.163-1.276 2.156a.75.75 0 0 0 .237.529l.128.163.855.528a1.25 1.25 0 0 0 .651.07l.528.855 1.276-2.156ZM9.03 12.338a3.5 3.5 0 1 1 1.238-6.988A3.5 3.5 0 0 1 9.03 12.338Z"/>
    </svg>
  );
}
