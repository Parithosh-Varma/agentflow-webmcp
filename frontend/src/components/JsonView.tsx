// Neat output presenter — collapsible, syntax-tinted JSON tree for run results.
// Dependency-free, theme-aware via CSS vars, circular-safe.

import { useState } from 'react';

const MAX_DEPTH = 8;
const MAX_STRING = 220;

function preview(value: Record<string, unknown> | unknown[]): string {
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.length} item${value.length === 1 ? '' : 's'}]`;
  const keys = Object.keys(value);
  return keys.length === 0 ? '{}' : `{${keys.length} key${keys.length === 1 ? '' : 's'}}`;
}

function JsonNode({ name, value, depth, seen }: { name?: string; value: unknown; depth: number; seen: object[] }) {
  const [open, setOpen] = useState(depth < 2);

  const label = name !== undefined ? <span className="jv-key">{name}</span> : null;
  const colon = name !== undefined ? <span className="jv-colon">: </span> : null;

  if (value === undefined) return <div className="jv-row">{label}{colon}<span className="jv-null">—</span></div>;
  if (value === null) return <div className="jv-row">{label}{colon}<span className="jv-null">null</span></div>;
  if (typeof value === 'boolean') return <div className="jv-row">{label}{colon}<span className="jv-bool">{String(value)}</span></div>;
  if (typeof value === 'number') return <div className="jv-row">{label}{colon}<span className="jv-number">{String(value)}</span></div>;
  if (typeof value === 'string') {
    const long = value.length > MAX_STRING;
    const text = long && !open ? `${value.slice(0, MAX_STRING)}…` : value;
    return (
      <div className="jv-row">
        {label}{colon}
        <span className="jv-string" title={long ? `${value.length} chars — click to ${open ? 'collapse' : 'expand'}` : undefined} onClick={long ? () => setOpen((v) => !v) : undefined} style={long ? { cursor: 'pointer' } : undefined}>
          “{text}”{long && <span className="jv-meta">{open ? ' · less' : ` · +${value.length - MAX_STRING}`}</span>}
        </span>
      </div>
    );
  }
  if (typeof value !== 'object') return <div className="jv-row">{label}{colon}<span className="jv-text">{String(value)}</span></div>;

  if (seen.includes(value)) return <div className="jv-row">{label}{colon}<span className="jv-meta">[Circular]</span></div>;
  if (depth >= MAX_DEPTH) return <div className="jv-row">{label}{colon}<span className="jv-meta">…</span></div>;
  const next = [...seen, value];

  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  const isArray = Array.isArray(value);

  if (!open) {
    return (
      <div className="jv-row">
        <button type="button" className="jv-toggle" onClick={() => setOpen(true)} aria-label="Expand">▸</button>
        {label}{colon}
        <button type="button" className="jv-preview" onClick={() => setOpen(true)}>{preview(value as Record<string, unknown>)}</button>
      </div>
    );
  }
  return (
    <div className="jv-group">
      <div className="jv-row">
        <button type="button" className="jv-toggle" onClick={() => setOpen(false)} aria-label="Collapse">▾</button>
        {label}{colon}
        <span className="jv-bracket">{isArray ? '[' : '{'}</span>
      </div>
      <div className="jv-children">
        {entries.map(([k, v]) => (
          <JsonNode key={k} name={isArray ? undefined : k} value={v} depth={depth + 1} seen={next} />
        ))}
      </div>
      <div className="jv-row"><span className="jv-bracket">{isArray ? ']' : '}'}</span></div>
    </div>
  );
}

export function JsonView({ data }: { data: unknown }) {
  if (typeof data === 'string') return <div className="jv-tree"><span className="jv-text">{data}</span></div>;
  return (
    <div className="jv-tree">
      <JsonNode value={data} depth={0} seen={[]} />
    </div>
  );
}
