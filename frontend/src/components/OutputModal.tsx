import { useEffect, useMemo, useState } from 'react';
import type { Node } from '@xyflow/react';
import { NODE_DISPLAY_NAMES } from './nodes';

interface Props {
  result: any | null;
  nodes: Node[];
  onClose: () => void;
}

function formatOutput(data: any): string {
  if (data === undefined) return '—';
  if (data === null) return 'null';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function labelFor(nodes: Node[], nodeId: string): string {
  const n = nodes.find((x) => x.id === nodeId);
  if (!n) return nodeId;
  const t = (n.data?.nodeType as string) || 'start';
  return `${NODE_DISPLAY_NAMES[t] || t}: ${String(n.data?.label || nodeId)}`;
}

function copyText(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable — ignore */
  }
}

export function OutputModal({ result, nodes, onClose }: Props) {
  const [filter, setFilter] = useState<'all' | 'done' | 'fault' | 'skipped'>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const rows = useMemo(() => {
    if (!result) return [];
    const { outputs = {}, status = {}, order = [] } = result;
    const ids: string[] = Array.isArray(order) && order.length ? order : Object.keys(outputs);
    return ids.map((id: string) => ({
      id,
      label: labelFor(nodes, id),
      status: (status[id] as string) || 'idle',
      output: outputs[id],
    }));
  }, [result, nodes]);

  const finalNode = useMemo(() => {
    if (!result) return null;
    const { outputs = {}, order = [] } = result;
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      if (id !== 'start' && !String(id).startsWith('start') && outputs[id] !== undefined) {
        return { id, label: labelFor(nodes, id), output: outputs[id] };
      }
    }
    return null;
  }, [result, nodes]);

  const visible = rows.filter((r) => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!r.label.toLowerCase().includes(q) && !r.id.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const done = rows.filter((r) => r.status === 'done').length;
  const faulted = rows.filter((r) => r.status === 'fault').length;
  const skipped = rows.filter((r) => r.status === 'skipped').length;
  // Top-level failure (e.g. run threw before producing per-node results)
  const topError: string | null =
    (result as any)?.error || (rows.length === 0 ? (result as any)?.outputs?.error || null : null);
  const topStack: string | null = (result as any)?.stack || null;

  if (!result) return null;

  return (
    <div
      className="output-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="output-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Workflow output"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="output-modal-header">
          <div>
            <div className="output-modal-kicker">Workflow output</div>
            <div className="output-modal-title">
              {result.success ? 'Completed' : 'Failed'}
              {result.durationMs !== undefined ? ` · ${result.durationMs}ms` : ''}
              {result.executedAt ? ` · ${new Date(result.executedAt).toLocaleTimeString()}` : ''}
            </div>
          </div>
          <div className="output-modal-actions">
            <span className={`exec-status-badge ${result.success ? 'success' : 'fault'}`}>
              {done} done · {faulted} fault · {skipped} skipped
            </span>
            <button className="btn-ghost btn-small" onClick={() => copyText(formatOutput(result))}>
              Copy all
            </button>
            <button className="popover-close" onClick={onClose} aria-label="Close output">
              ×
            </button>
          </div>
        </div>

        {topError && (
          <div className="exec-error" style={{ margin: '12px 16px 0' }}>
            <span className="exec-error-icon">⚠</span>
            <pre>{topStack ? `${topError}\n${String(topStack).slice(0, 1200)}` : topError}</pre>
          </div>
        )}

        {finalNode && (
          <div className="exec-final-output" style={{ margin: '12px 16px 0' }}>
            <div className="exec-final-label">
              <span className="exec-final-kicker">Final output</span>
              <span className="exec-final-node">{finalNode.label}</span>
              <button
                className="btn-ghost btn-small exec-copy-btn"
                onClick={() => copyText(formatOutput(finalNode.output))}
              >
                Copy JSON
              </button>
            </div>
            <pre className="exec-final-data">{formatOutput(finalNode.output)}</pre>
          </div>
        )}

        <div className="output-modal-toolbar">
          <div className="output-modal-filters" role="tablist" aria-label="Filter by status">
            {(['all', 'done', 'fault', 'skipped'] as const).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                className={`sb-pill ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            className="sidebar-input"
            placeholder="Filter nodes…"
            aria-label="Filter nodes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </div>

        <div className="output-modal-body">
          {visible.length === 0 ? (
            <p className="hint" style={{ padding: 12 }}>No nodes match this filter.</p>
          ) : (
            visible.map((r) => (
              <div key={r.id} className={`exec-node-row status-${r.status}`}>
                <div className="exec-node-info">
                  <span className={`exec-node-status-dot status-${r.status}`} title={r.status} />
                  <span className="exec-node-name" title={`${r.label} (${r.id})`}>{r.label}</span>
                </div>
                <div className="exec-node-output">
                  {r.output !== undefined && r.output !== null ? (
                    <>
                      <pre>{formatOutput(r.output)}</pre>
                      {r.output?.stack && (
                        <pre className="output-modal-stack">{String(r.output.stack).slice(0, 1200)}</pre>
                      )}
                      <button className="btn-ghost btn-small" onClick={() => copyText(formatOutput(r.output))}>
                        Copy
                      </button>
                    </>
                  ) : (
                    <span className="exec-no-output">— no output —</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="output-modal-footer">
          <span className="hint">{rows.length} nodes · order: {(result.order || []).join(' → ') || '—'}</span>
          <button className="btn-run btn-small" onClick={onClose} autoFocus>Done</button>
        </div>
      </div>
    </div>
  );
}
