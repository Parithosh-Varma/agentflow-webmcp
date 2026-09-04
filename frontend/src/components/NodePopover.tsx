import { useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import type { Node } from '@xyflow/react';
import { CloseIcon } from './icons';

interface Props {
  node: Node | null;
  onChange: (nodeId: string, config: any) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

type TabId = 'basic' | 'advanced' | 'output';

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="cfg-row cfg-toggle-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`toggle ${checked ? 'toggle--on' : ''}`}
      >
        <span className="toggle-thumb" />
      </button>
      {hint && <span className="hint" style={{ fontSize: 10, marginTop: 2 }}>{hint}</span>}
    </label>
  );
}

function MultiSelect({ label, options, value, onChange, placeholder }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('');
  const filtered = useMemo(() => options.filter(o => o.toLowerCase().includes(input.toLowerCase()) && !value.includes(o)).slice(0, 6), [options, input, value]);
  const add = (v: string) => {
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setInput('');
  };
  const remove = (v: string) => onChange(value.filter(x => x !== v));
  return (
    <div className="cfg-row">
      <span>{label}</span>
      <div className="multi-select">
        <div className="multi-select-chips">
          {value.map(v => (
            <span key={v} className="chip">
              {v}<button type="button" onClick={() => remove(v)} aria-label={`remove ${v}`}>×</button>
            </span>
          ))}
        </div>
        <div className="multi-select-input-wrap">
          <input className="cfg-input" placeholder={placeholder || 'type and press Enter'} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (filtered[0]) add(filtered[0]); else if (input.trim()) add(input.trim()); } if (e.key === 'Backspace' && !input && value.length) remove(value[value.length - 1]); }} />
          {input && filtered.length > 0 && (
            <div className="multi-select-dropdown">
              {filtered.map(o => (
                <button key={o} type="button" onClick={() => add(o)}>{o}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KeyValueTable({ label, pairs, onChange, keyPlaceholder, valuePlaceholder }: { label: string; pairs: Array<{ k: string; v: string }>; onChange: (p: Array<{ k: string; v: string }>) => void; keyPlaceholder?: string; valuePlaceholder?: string }) {
  const update = (idx: number, field: 'k' | 'v', val: string) => {
    const next = pairs.map((p, i) => i === idx ? { ...p, [field]: val } : p);
    onChange(next);
  };
  const addRow = () => onChange([...pairs, { k: '', v: '' }]);
  const removeRow = (idx: number) => onChange(pairs.filter((_, i) => i !== idx));
  return (
    <div className="cfg-row">
      <span>{label}</span>
      <div className="kv-table">
        {pairs.length === 0 && <span className="hint" style={{ fontSize: 10 }}>No entries — add one.</span>}
        {pairs.map((p, i) => (
          <div key={i} className="kv-row">
            <input className="cfg-input" placeholder={keyPlaceholder || 'key'} value={p.k} onChange={e => update(i, 'k', e.target.value)} />
            <input className="cfg-input" placeholder={valuePlaceholder || 'value'} value={p.v} onChange={e => update(i, 'v', e.target.value)} />
            <button type="button" className="kv-remove" onClick={() => removeRow(i)} aria-label="remove row">×</button>
          </div>
        ))}
        <button type="button" className="btn-ghost btn-small kv-add" onClick={addRow}>+ Add mapping</button>
      </div>
    </div>
  );
}

function CodeEditor({ label, value, onChange, placeholder, languageHint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; languageHint?: string }) {
  const [local, setLocal] = useState(value || '');
  useEffect(() => setLocal(value || ''), [value]);
  return (
    <div className="cfg-row">
      <span>{label} {languageHint && <em style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--faint)', fontStyle: 'normal' }}>· {languageHint}</em>}</span>
      <div className="code-editor-wrap">
        <textarea
          className="cfg-input cfg-area code-editor"
          rows={8}
          spellCheck={false}
          placeholder={placeholder}
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => onChange(local)}
        />
        <div className="code-editor-bar">
          <span className="hint" style={{ fontSize: 10 }}>{local.length} chars · blurs to save</span>
          <button type="button" className="btn-ghost btn-small" onClick={() => { try { const p = JSON.parse(local); onChange(JSON.stringify(p, null, 2)); setLocal(JSON.stringify(p, null, 2)); } catch {} }}>Format JSON</button>
        </div>
      </div>
    </div>
  );
}

export function NodePopover({ node, onChange, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<any>({});
  const popoverRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const [tab, setTab] = useState<TabId>('basic');
  const [expanded, setExpanded] = useState(false);
  const [drawerWidth, setDrawerWidth] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('agentflow_drawer_width_v1')); return v >= 340 && v <= 800 ? v : 420; } catch { return 420; }
  });
  const [isResizing, setIsResizing] = useState(false);
  const prevNodeIdRef = useRef<string | null>(null);
  const prevConfigRef = useRef<string | null>(null);

  useEffect(() => {
    if (!node) return;
    const newConfig = node?.data?.config || {};
    const newConfigStr = JSON.stringify(newConfig);
    const prevId = prevNodeIdRef.current;
    if (node.id !== prevId) {
      setDraft({ ...newConfig });
      setTab('basic');
      prevNodeIdRef.current = node.id;
      prevConfigRef.current = newConfigStr;
      return;
    }
    if (prevConfigRef.current !== newConfigStr) {
      setDraft((prevDraft: any) => {
        const prevDraftStr = JSON.stringify(prevDraft);
        if (prevDraftStr === prevConfigRef.current) {
          prevConfigRef.current = newConfigStr;
          return { ...newConfig };
        }
        prevConfigRef.current = newConfigStr;
        return prevDraft;
      });
    }
  }, [node?.id, JSON.stringify(node?.data?.config)]);

  // Keep draft -> advanced helpers in sync
  const kvPairs: Array<{ k: string; v: string }> = useMemo(() => {
    const src = draft.kvPairs || draft.headersMap || draft.fieldMap || [];
    if (Array.isArray(src)) return src.map((p: any) => ({ k: String(p.k ?? p.key ?? ''), v: String(p.v ?? p.value ?? '') }));
    if (src && typeof src === 'object') return Object.entries(src).map(([k, v]) => ({ k, v: String(v) }));
    return [];
  }, [draft.kvPairs, draft.headersMap, draft.fieldMap]);

  const tags: string[] = useMemo(() => {
    const v = draft.tags || draft.selectedFields || draft.columns || [];
    return Array.isArray(v) ? v.map(String) : [];
  }, [draft.tags, draft.selectedFields, draft.columns]);

  const set = (k: string, v: any) => setDraft((d: any) => ({ ...d, [k]: v }));
  const setKvPairs = (pairs: Array<{ k: string; v: string }>) => {
    set('kvPairs', pairs);
    // also mirror to headers for api-like nodes so engine can read either
    const obj: Record<string, string> = {};
    pairs.forEach(p => { if (p.k.trim()) obj[p.k.trim()] = p.v; });
    set('headers', obj);
  };

  // Anchor modal directly above the selected node (screen-space), tracking pan/zoom/drag — only when not expanded
  useLayoutEffect(() => {
    if (!node || expanded) { setAnchor(null); return; }
    const MARGIN = 12;
    const compute = () => {
      if (window.innerWidth <= 720) { setAnchor(null); return; }
      const nodeEl = document.querySelector(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`) as HTMLElement | null;
      const popEl = popoverRef.current;
      if (!nodeEl || !popEl) return;
      const nodeRect = nodeEl.getBoundingClientRect();
      const modalW = popEl.offsetWidth || 280;
      const modalH = popEl.offsetHeight || 200;
      let left = nodeRect.left + nodeRect.width / 2 - modalW / 2;
      let top = nodeRect.top - modalH - MARGIN;
      const pad = 8;
      left = Math.max(pad, Math.min(left, window.innerWidth - modalW - pad));
      if (top < 60) top = nodeRect.bottom + MARGIN;
      top = Math.max(8, Math.min(top, window.innerHeight - modalH - pad));
      setAnchor({ left, top });
    };
    compute();
    const raf1 = requestAnimationFrame(compute);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(compute));
    const ro = new ResizeObserver(compute);
    if (popoverRef.current) ro.observe(popoverRef.current);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    const viewportEl = document.querySelector('.react-flow__viewport') as HTMLElement | null;
    let mo: MutationObserver | null = null;
    if (viewportEl) {
      mo = new MutationObserver(compute);
      mo.observe(viewportEl, { attributes: true, attributeFilter: ['style', 'transform'] });
    }
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro.disconnect();
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
      mo?.disconnect();
    };
  }, [node?.id, (node as any)?.position?.x, (node as any)?.position?.y, expanded]);

  if (!node) return null;

  const nodeType = (node.data?.nodeType as string) || 'start';
  const label = String(node.data?.label || node.id);

  const drawerStyle = expanded ? { width: drawerWidth } as any : undefined;
  const popoverStyle = !expanded && anchor ? { left: anchor.left, top: anchor.top, right: 'auto' } : undefined;

  return (
    <div
      ref={popoverRef}
      className={`${expanded ? 'node-drawer' : 'node-popover'}${!expanded && anchor ? ' node-popover--anchored' : ''}${isResizing ? ' resizing' : ''}`}
      style={expanded ? drawerStyle : popoverStyle}
      onClick={(e) => e.stopPropagation()}
    >
      {expanded && (
        <div
          className="drawer-resizer"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
            const startX = e.clientX;
            const startW = drawerWidth;
            let latest = startW;
            const onMove = (ev: MouseEvent) => {
              const next = Math.min(800, Math.max(340, startW + (startX - ev.clientX)));
              latest = next;
              setDrawerWidth(next);
            };
            const onUp = () => {
              setIsResizing(false);
              try { localStorage.setItem('agentflow_drawer_width_v1', String(latest)); } catch {}
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            };
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        />
      )}

      <div className="popover-header">
        <div className="popover-title-wrap">
          <span className="popover-title">{label}</span>
          <span className="popover-subtitle">{nodeType}</span>
        </div>
        <div className="popover-header-actions">
          <button
            className="btn-ghost btn-small drawer-expand-btn"
            onClick={() => {
              if (!expanded) {
                setExpanded(true);
                setTab('advanced');
              } else {
                setExpanded(false);
              }
            }}
            title={expanded ? 'Collapse to floating popover' : 'Expand to side drawer (resizable, full-height)'}
          >
            {expanded ? '◀ Collapse' : 'Expand ⤢'}
          </button>
          <button className="popover-close" onClick={onClose}><CloseIcon size={14} /></button>
        </div>
      </div>

      <div className="drawer-tabs" role="tablist">
        {(['basic', 'advanced', 'output'] as TabId[]).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`drawer-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'basic' ? 'Basic' : t === 'advanced' ? 'Advanced' : 'Output Schema'}
          </button>
        ))}
      </div>

      <div className="popover-body">
        {tab === 'basic' && (
          <>
            {nodeType === 'api_call' && (
              <>
                <label className="cfg-row">
                  <span>URL</span>
                  <input className="cfg-input" placeholder="https://api.github.com/repos/..." value={draft.url || ''} onChange={(e) => set('url', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Method</span>
                  <select className="cfg-input" value={draft.method || 'GET'} onChange={(e) => set('method', e.target.value)}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (<option key={m}>{m}</option>))}
                  </select>
                </label>
                {(draft.method || 'GET') !== 'GET' && (
                  <label className="cfg-row">
                    <span>Body (JSON)</span>
                    <textarea className="cfg-input cfg-area" rows={3} placeholder='{"name": "world"}' value={typeof draft.body === 'string' ? draft.body : draft.body ? JSON.stringify(draft.body) : ''} onChange={(e) => set('body', e.target.value)} />
                  </label>
                )}
              </>
            )}
            {nodeType === 'transform' && (
              <>
                <label className="cfg-row">
                  <span>Operation</span>
                  <select className="cfg-input" value={draft.op || 'passthrough'} onChange={(e) => set('op', e.target.value)}>
                    <option value="passthrough">passthrough</option>
                    <option value="pick">pick keys</option>
                    <option value="count">count items</option>
                    <option value="first">first item</option>
                    <option value="expression">expression (JS)</option>
                  </select>
                </label>
                {draft.op === 'pick' && (
                  <label className="cfg-row">
                    <span>Keys (comma sep)</span>
                    <input className="cfg-input" placeholder="full_name, stargazers_count" value={draft.keys || ''} onChange={(e) => set('keys', e.target.value)} />
                  </label>
                )}
                {draft.op === 'expression' && (
                  <label className="cfg-row">
                    <span>(data) =&gt; …</span>
                    <textarea className="cfg-input cfg-area" rows={4} placeholder="(data) => ({ stars: data.stargazers_count })" value={draft.expression || ''} onChange={(e) => set('expression', e.target.value)} />
                  </label>
                )}
              </>
            )}
            {nodeType === 'condition' && (
              <label className="cfg-row">
                <span>(data) =&gt; boolean</span>
                <textarea className="cfg-input cfg-area" rows={4} placeholder="(data) => data.passed === true" value={draft.expression || ''} onChange={(e) => set('expression', e.target.value)} />
              </label>
            )}
            {nodeType === 'delay' && (
              <label className="cfg-row">
                <span>Wait (ms)</span>
                <input className="cfg-input" type="number" min={0} step={100} value={draft.ms ?? 1000} onChange={(e) => set('ms', Number(e.target.value))} />
              </label>
            )}
            {nodeType === 'output' && (
              <>
                <label className="cfg-row">
                  <span>Deliver via</span>
                  <select className="cfg-input" value={draft.kind || 'console'} onChange={(e) => set('kind', e.target.value)}>
                    <option value="console">browser console</option>
                    <option value="download">download .json</option>
                    <option value="webhook">webhook POST</option>
                  </select>
                </label>
                {draft.kind === 'webhook' && (
                  <label className="cfg-row">
                    <span>Webhook URL</span>
                    <input className="cfg-input" placeholder="https://webhook.site/your-id" value={draft.url || ''} onChange={(e) => set('url', e.target.value)} />
                  </label>
                )}
                {draft.kind === 'download' && (
                  <label className="cfg-row">
                    <span>Filename</span>
                    <input className="cfg-input" placeholder="flow-output" value={draft.filename || ''} onChange={(e) => set('filename', e.target.value)} />
                  </label>
                )}
              </>
            )}
            {nodeType === 'filter' && (
              <label className="cfg-row">
                <span>(data) =&gt; boolean</span>
                <textarea className="cfg-input cfg-area" rows={4} placeholder="(data) => data.status === 'active'" value={draft.expression || ''} onChange={(e) => set('expression', e.target.value)} />
              </label>
            )}
            {nodeType === 'split' && (
              <label className="cfg-row">
                <span>Batch size</span>
                <input className="cfg-input" type="number" min={1} value={draft.batchSize ?? 10} onChange={(e) => set('batchSize', Number(e.target.value))} />
              </label>
            )}
            {nodeType === 'merge' && (<p className="hint" style={{ fontSize: 11 }}>Combines all inputs into one object. No config needed.</p>)}
            {nodeType === 'loop' && (
              <label className="cfg-row">
                <span>Max iterations</span>
                <input className="cfg-input" type="number" min={1} value={draft.maxIterations ?? 10} onChange={(e) => set('maxIterations', Number(e.target.value))} />
              </label>
            )}
            {nodeType === 'code' && (
              <label className="cfg-row">
                <span>JavaScript code</span>
                <textarea className="cfg-input cfg-area" rows={6} placeholder={"return data.map(x => x * 2);"} value={draft.code || ''} onChange={(e) => set('code', e.target.value)} />
              </label>
            )}
            {nodeType === 'webhook' && (
              <>
                <label className="cfg-row">
                  <span>URL</span>
                  <input className="cfg-input" placeholder="https://api.example.com/hook" value={draft.url || ''} onChange={(e) => set('url', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Method</span>
                  <select className="cfg-input" value={draft.method || 'POST'} onChange={(e) => set('method', e.target.value)}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (<option key={m}>{m}</option>))}
                  </select>
                </label>
              </>
            )}
            {nodeType === 'ai' && (
              <>
                <label className="cfg-row">
                  <span>Prompt</span>
                  <textarea className="cfg-input cfg-area" rows={3} placeholder="Summarize the input data" value={draft.prompt || ''} onChange={(e) => set('prompt', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Model</span>
                  <input className="cfg-input" placeholder="gpt-3.5-turbo" value={draft.model || ''} onChange={(e) => set('model', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>API Key</span>
                  <input className="cfg-input" type="password" placeholder="sk-..." value={draft.apiKey || ''} onChange={(e) => set('apiKey', e.target.value)} />
                </label>
              </>
            )}
            {nodeType === 'validator' && (
              <label className="cfg-row">
                <span>(data) =&gt; boolean</span>
                <textarea className="cfg-input cfg-area" rows={4} placeholder="(data) => data.length > 0" value={draft.expression || ''} onChange={(e) => set('expression', e.target.value)} />
              </label>
            )}
            {nodeType === 'logger' && (
              <>
                <label className="cfg-row">
                  <span>Level</span>
                  <select className="cfg-input" value={draft.level || 'info'} onChange={(e) => set('level', e.target.value)}>
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                  </select>
                </label>
                <label className="cfg-row">
                  <span>Message</span>
                  <input className="cfg-input" placeholder="Checkpoint label" value={draft.message || ''} onChange={(e) => set('message', e.target.value)} />
                </label>
              </>
            )}
            {nodeType === 'file' && (
              <>
                <label className="cfg-row">
                  <span>Operation</span>
                  <select className="cfg-input" value={draft.operation || 'write'} onChange={(e) => set('operation', e.target.value)}>
                    <option value="write">write (download)</option>
                    <option value="read">read (pass-through)</option>
                  </select>
                </label>
                <label className="cfg-row">
                  <span>Filename</span>
                  <input className="cfg-input" placeholder="output.json" value={draft.path || ''} onChange={(e) => set('path', e.target.value)} />
                </label>
              </>
            )}
            {nodeType === 'schedule' && (
              <>
                <label className="cfg-row">
                  <span>Cron</span>
                  <input className="cfg-input" placeholder="*/5 * * * *" value={draft.cron || ''} onChange={(e) => set('cron', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Interval (ms)</span>
                  <input className="cfg-input" type="number" min={0} value={draft.intervalMs ?? draft.ms ?? 0} onChange={(e) => set('intervalMs', Number(e.target.value))} />
                </label>
              </>
            )}
            {nodeType === 'graphql' && (
              <>
                <label className="cfg-row">
                  <span>Endpoint URL</span>
                  <input className="cfg-input" placeholder="https://api.example.com/graphql" value={draft.url || draft.endpoint || ''} onChange={(e) => set('url', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Query</span>
                  <textarea className="cfg-input cfg-area" rows={4} placeholder="{ __typename }" value={draft.query || draft.graphql || ''} onChange={(e) => set('query', e.target.value)} />
                </label>
              </>
            )}
            {nodeType === 'set' && (
              <>
                <label className="cfg-row">
                  <span>Fields (JSON)</span>
                  <textarea className="cfg-input cfg-area" rows={4} placeholder='{"name": "value"}' value={typeof draft.fields === 'string' ? draft.fields : draft.fields ? JSON.stringify(draft.fields, null, 2) : draft.set ? JSON.stringify(draft.set, null, 2) : ''} onChange={(e) => { try { set('fields', JSON.parse(e.target.value)); } catch { set('fields', e.target.value); } }} />
                </label>
                <label className="cfg-row">
                  <span>Keep only set</span>
                  <select className="cfg-input" value={String(draft.keepOnlySet ?? false)} onChange={(e) => set('keepOnlySet', e.target.value === 'true')}>
                    <option value="false">merge with input</option>
                    <option value="true">only set fields</option>
                  </select>
                </label>
              </>
            )}
            {nodeType === 'switch' && (
              <>
                <label className="cfg-row">
                  <span>Expression (data) =&gt; case</span>
                  <textarea className="cfg-input cfg-area" rows={3} placeholder="(data) => data.status" value={draft.expression || draft.code || ''} onChange={(e) => set('expression', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Fallback value</span>
                  <input className="cfg-input" placeholder="default" value={draft.value || ''} onChange={(e) => set('value', e.target.value)} />
                </label>
              </>
            )}
            {nodeType === 'aggregate' && (
              <>
                <label className="cfg-row">
                  <span>Operation</span>
                  <select className="cfg-input" value={draft.operation || draft.aggregate || 'count'} onChange={(e) => set('operation', e.target.value)}>
                    <option value="count">count</option>
                    <option value="sum">sum</option>
                    <option value="avg">avg</option>
                    <option value="group">groupBy</option>
                  </select>
                </label>
                <label className="cfg-row">
                  <span>Field / GroupBy</span>
                  <input className="cfg-input" placeholder="amount" value={draft.field || draft.groupBy || ''} onChange={(e) => set('field', e.target.value)} />
                </label>
              </>
            )}
            {nodeType === 'sort' && (
              <>
                <label className="cfg-row">
                  <span>Field</span>
                  <input className="cfg-input" placeholder="name or empty for natural sort" value={draft.field || draft.sortBy || ''} onChange={(e) => set('field', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Order</span>
                  <select className="cfg-input" value={draft.order || draft.direction || 'asc'} onChange={(e) => set('order', e.target.value)}>
                    <option value="asc">asc</option>
                    <option value="desc">desc</option>
                  </select>
                </label>
              </>
            )}
            {nodeType === 'limit' && (
              <>
                <label className="cfg-row">
                  <span>Max / Limit</span>
                  <input className="cfg-input" type="number" min={1} value={draft.max ?? draft.limit ?? 10} onChange={(e) => set('max', Number(e.target.value))} />
                </label>
                <label className="cfg-row">
                  <span>Offset</span>
                  <input className="cfg-input" type="number" min={0} value={draft.offset ?? 0} onChange={(e) => set('offset', Number(e.target.value))} />
                </label>
              </>
            )}
            {nodeType === 'item_lists' && (
              <>
                <label className="cfg-row">
                  <span>Operation</span>
                  <select className="cfg-input" value={draft.operation || 'union'} onChange={(e) => set('operation', e.target.value)}>
                    <option value="union">union</option>
                    <option value="intersect">intersect</option>
                    <option value="difference">difference</option>
                  </select>
                </label>
                <label className="cfg-row">
                  <span>List B (JSON array)</span>
                  <textarea className="cfg-input cfg-area" rows={3} placeholder='[1,2,3]' value={typeof draft.list === 'string' ? draft.list : draft.list ? JSON.stringify(draft.list) : ''} onChange={(e) => { try { set('list', JSON.parse(e.target.value)); } catch { set('list', e.target.value); } }} />
                </label>
              </>
            )}
            {nodeType === 'function' && (
              <>
                <label className="cfg-row">
                  <span>Function code (data, items)</span>
                  <textarea className="cfg-input cfg-area" rows={6} placeholder={"return data.map(x=>x*2);"} value={draft.code || draft.functionCode || draft.expression || ''} onChange={(e) => set('code', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Per item</span>
                  <select className="cfg-input" value={String(draft.perItem ?? false)} onChange={(e) => set('perItem', e.target.value==='true')}>
                    <option value="false">run once</option>
                    <option value="true">per item</option>
                  </select>
                </label>
              </>
            )}
            {nodeType === 'noop' && (<p className="hint" style={{ fontSize: 11 }}>No operation — passes data through. No config needed.</p>)}
            {nodeType === 'webhook_response' && (
              <>
                <label className="cfg-row">
                  <span>Status</span>
                  <input className="cfg-input" type="number" value={draft.status ?? 200} onChange={(e) => set('status', Number(e.target.value))} />
                </label>
                <label className="cfg-row">
                  <span>Body (JSON or text)</span>
                  <textarea className="cfg-input cfg-area" rows={3} placeholder='{"ok": true}' value={typeof draft.body === 'string' ? draft.body : draft.body ? JSON.stringify(draft.body) : ''} onChange={(e) => set('body', e.target.value)} />
                </label>
              </>
            )}
            {nodeType === 'html' && (
              <>
                <label className="cfg-row">
                  <span>Operation</span>
                  <select className="cfg-input" value={draft.operation || 'extract'} onChange={(e) => set('operation', e.target.value)}>
                    <option value="extract">extract</option>
                    <option value="raw">raw</option>
                  </select>
                </label>
                <label className="cfg-row">
                  <span>Selector (CSS)</span>
                  <input className="cfg-input" placeholder="div.title" value={draft.selector || draft.css || ''} onChange={(e) => set('selector', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Attribute</span>
                  <input className="cfg-input" placeholder="textContent" value={draft.attribute || 'textContent'} onChange={(e) => set('attribute', e.target.value)} />
                </label>
              </>
            )}
            {nodeType === 'date_time' && (
              <>
                <label className="cfg-row">
                  <span>Operation</span>
                  <select className="cfg-input" value={draft.operation || 'now'} onChange={(e) => set('operation', e.target.value)}>
                    <option value="now">now</option>
                    <option value="format">format</option>
                    <option value="add">add</option>
                  </select>
                </label>
                {(draft.operation === 'format' || draft.operation === 'add') && (
                  <label className="cfg-row">
                    <span>Date / Value</span>
                    <input className="cfg-input" placeholder="2024-01-01 or timestamp" value={draft.date || draft.value || ''} onChange={(e) => set('date', e.target.value)} />
                  </label>
                )}
              </>
            )}
            {['slack','discord','github','gmail','google_sheets','notion','airtable','postgres','mysql','mongodb','redis','stripe','shopify','aws_s3'].includes(nodeType) && (
              <>
                <label className="cfg-row">
                  <span>URL / Webhook</span>
                  <input className="cfg-input" placeholder="https://hooks.example.com/..." value={draft.url || draft.webhookUrl || draft.endpoint || ''} onChange={(e) => set('url', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Method</span>
                  <select className="cfg-input" value={draft.method || 'POST'} onChange={(e) => set('method', e.target.value)}>
                    {['GET','POST','PUT','PATCH','DELETE'].map(m=> <option key={m}>{m}</option>)}
                  </select>
                </label>
              </>
            )}
            {nodeType.startsWith('custom_') && (() => {
              let def: any = null;
              try {
                const raw = localStorage.getItem('agentflow_custom_nodes_v1');
                if (raw) {
                  const arr = JSON.parse(raw);
                  def = arr.find((n: any) => n.type === nodeType);
                }
              } catch {}
              if (!def) return <p className="hint" style={{fontSize:11}}>Custom node definition not found for {nodeType}.</p>;
              return (
                <>
                  <p className="hint" style={{fontSize:11, marginBottom:8}}>{def.description}</p>
                  {(def.fields || []).map((f: any) => {
                    const val = draft[f.key] ?? f.defaultValue ?? '';
                    if (f.type === 'textarea') return (
                      <label key={f.key} className="cfg-row">
                        <span>{f.label || f.key}</span>
                        <textarea className="cfg-input cfg-area" rows={3} placeholder={f.placeholder || ''} value={val} onChange={e=> set(f.key, e.target.value)} />
                      </label>
                    );
                    if (f.type === 'number') return (
                      <label key={f.key} className="cfg-row">
                        <span>{f.label || f.key}</span>
                        <input className="cfg-input" type="number" value={val} onChange={e=> set(f.key, Number(e.target.value))} />
                      </label>
                    );
                    return (
                      <label key={f.key} className="cfg-row">
                        <span>{f.label || f.key}</span>
                        <input className="cfg-input" placeholder={f.placeholder||''} value={val} onChange={e=> set(f.key, e.target.value)} />
                      </label>
                    );
                  })}
                </>
              );
            })()}
            {nodeType === 'openai' && (
              <>
                <label className="cfg-row">
                  <span>Prompt</span>
                  <textarea className="cfg-input cfg-area" rows={3} placeholder="Summarize the input" value={draft.prompt || draft.message || ''} onChange={(e)=> set('prompt', e.target.value)} />
                </label>
                <label className="cfg-row">
                  <span>Model</span>
                  <input className="cfg-input" placeholder="gpt-4o-mini" value={draft.model || ''} onChange={(e)=> set('model', e.target.value)} />
                </label>
              </>
            )}
            {nodeType === 'manual_trigger' && (<p className="hint" style={{ fontSize: 11 }}>Manual trigger — starts workflow when you click Run. Nothing to tune.</p>)}
            {nodeType === 'start' && (<p className="hint" style={{ fontSize: 11 }}>The entry module — nothing to tune.</p>)}
          </>
        )}

        {tab === 'advanced' && (
          <>
            <Toggle label="Enabled" checked={draft.enabled !== false} onChange={v => set('enabled', v)} hint="When off, this node is skipped at runtime." />
            <Toggle label="Continue on error" checked={!!draft.continueOnError} onChange={v => set('continueOnError', v)} hint="Don't fault downstream nodes if this one errors." />
            <MultiSelect
              label="Tags / Labels"
              options={['critical', 'batch', 'experimental', 'cacheable', 'retry', 'idempotent', 'webhook', 'internal']}
              value={tags}
              onChange={v => set('tags', v)}
              placeholder="add tag and press Enter"
            />
            <KeyValueTable label="Headers / Field mappings" pairs={kvPairs} onChange={setKvPairs} keyPlaceholder="X-Custom-Header" valuePlaceholder="value or {{ $json.field }}" />
            <label className="cfg-row">
              <span>Timeout (ms)</span>
              <input className="cfg-input" type="number" min={0} step={500} placeholder="30000" value={draft.timeoutMs ?? ''} onChange={e => set('timeoutMs', e.target.value === '' ? undefined : Number(e.target.value))} />
            </label>
            <label className="cfg-row">
              <span>Retry count</span>
              <input className="cfg-input" type="number" min={0} max={10} value={draft.retries ?? 0} onChange={e => set('retries', Number(e.target.value))} />
            </label>
            <CodeEditor label="Advanced JSON / Code" value={typeof draft.advancedJson === 'string' ? draft.advancedJson : draft.advancedJson ? JSON.stringify(draft.advancedJson, null, 2) : draft.codeAdvanced || ''} onChange={v => set('advancedJson', v)} placeholder={'{\n  "concurrency": 3,\n  "dedupeKey": "id"\n} // or JS: return data;'} languageHint="JSON or JS" />
            <Toggle label="Log verbosely" checked={!!draft.verbose} onChange={v => set('verbose', v)} />
            <label className="cfg-row">
              <span>Conditional run — expression</span>
              <textarea className="cfg-input cfg-area" rows={3} placeholder="(data, ctx) => data.items?.length > 0" value={draft.conditionExpr || ''} onChange={e => set('conditionExpr', e.target.value)} />
            </label>
          </>
        )}

        {tab === 'output' && (
          <>
            <div className="hint" style={{ fontSize: 11, marginBottom: 8 }}>
              Define what this node emits. Used for validation and downstream type hints.
            </div>
            <label className="cfg-row">
              <span>Output mode</span>
              <select className="cfg-input" value={draft.outputMode || 'passthrough'} onChange={e => set('outputMode', e.target.value)}>
                <option value="passthrough">passthrough — forward input</option>
                <option value="wrapped">wrapped — {"{ data, meta }"} </option>
                <option value="schema">schema — validate against below</option>
              </select>
            </label>
            <CodeEditor label="Output schema (JSON Schema)" value={typeof draft.outputSchema === 'string' ? draft.outputSchema : draft.outputSchema ? JSON.stringify(draft.outputSchema, null, 2) : ''} onChange={v => set('outputSchema', v)} placeholder={'{\n  "type": "object",\n  "properties": {\n    "id": { "type": "string" },\n    "count": { "type": "number" }\n  },\n  "required": ["id"]\n}'} languageHint="JSON Schema" />
            <label className="cfg-row">
              <span>Sample output (preview)</span>
              <textarea className="cfg-input cfg-area" rows={4} placeholder='{"id": "abc", "count": 3}' value={typeof draft.sampleOutput === 'string' ? draft.sampleOutput : draft.sampleOutput ? JSON.stringify(draft.sampleOutput, null, 2) : ''} onChange={e => set('sampleOutput', e.target.value)} />
            </label>
            <KeyValueTable label="Output field renames" pairs={Array.isArray(draft.outputMap) ? draft.outputMap.map((p: any) => ({ k: String(p.from ?? p.k ?? ''), v: String(p.to ?? p.v ?? '') })) : []} onChange={pairs => set('outputMap', pairs.map(p => ({ from: p.k, to: p.v })))} keyPlaceholder="from field" valuePlaceholder="to field" />
          </>
        )}

        <div className="cfg-actions">
          <button className="btn-run btn-small" onClick={() => onChange(node.id, draft)}>APPLY</button>
          <button className="btn-ghost btn-small btn-danger" onClick={() => onDelete(node.id)} title={`Delete ${label}`}>delete</button>
          {!expanded && (
            <button
              type="button"
              className="btn-ghost btn-small cfg-expand"
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                setExpanded(true);
                setTab('advanced');
              }}
            >
              Expand for Advanced ▸
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
