import { useEffect, useState } from 'react';
import type { Node } from '@xyflow/react';

interface Props {
  node: Node | null;
  onChange: (nodeId: string, config: any) => void;
  onDelete: (nodeId: string) => void;
}

export function ConfigPanel({ node, onChange, onDelete }: Props) {
  const [draft, setDraft] = useState<any>({});

  useEffect(() => {
    setDraft({ ...(node?.data?.config || {}) });
  }, [node?.id]);

  if (!node) {
    return (
      <div className="config-panel config-empty">
        <div className="panel-section">
          <h3>Tuning</h3>
        </div>
        <p className="hint">Click a module on the canvas to tune it. Or let the agent call <code>update_node_config</code>.</p>
      </div>
    );
  }

  const nodeType = (node.data?.nodeType as string) || 'start';
  const label = String(node.data?.label || node.id);
  const set = (k: string, v: any) => setDraft((d: any) => ({ ...d, [k]: v }));

  return (
    <div className="config-panel">
      <div className="panel-section">
        <h3>Tuning · {label}</h3>
      </div>

      {nodeType === 'api_call' && (
        <>
          <label className="cfg-row">
            <span>URL</span>
            <input
              className="cfg-input"
              placeholder="https://api.github.com/repos/..."
              value={draft.url || ''}
              onChange={(e) => set('url', e.target.value)}
            />
          </label>
          <label className="cfg-row">
            <span>Method</span>
            <select
              className="cfg-input"
              value={draft.method || 'GET'}
              onChange={(e) => set('method', e.target.value)}
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          {(draft.method || 'GET') !== 'GET' && (
            <label className="cfg-row">
              <span>Body (JSON)</span>
              <textarea
                className="cfg-input cfg-area"
                rows={3}
                placeholder='{"name": "world"}'
                value={typeof draft.body === 'string' ? draft.body : draft.body ? JSON.stringify(draft.body) : ''}
                onChange={(e) => set('body', e.target.value)}
              />
            </label>
          )}
        </>
      )}

      {nodeType === 'transform' && (
        <>
          <label className="cfg-row">
            <span>Operation</span>
            <select
              className="cfg-input"
              value={draft.op || 'passthrough'}
              onChange={(e) => set('op', e.target.value)}
            >
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
              <input
                className="cfg-input"
                placeholder="full_name, stargazers_count"
                value={draft.keys || ''}
                onChange={(e) => set('keys', e.target.value)}
              />
            </label>
          )}
          {draft.op === 'expression' && (
            <label className="cfg-row">
              <span>(data) =&gt; …</span>
              <textarea
                className="cfg-input cfg-area"
                rows={4}
                placeholder="(data) => ({ stars: data.stargazers_count })"
                value={draft.expression || ''}
                onChange={(e) => set('expression', e.target.value)}
              />
            </label>
          )}
        </>
      )}

      {nodeType === 'condition' && (
        <>
          <label className="cfg-row">
            <span>(data) =&gt; boolean</span>
            <textarea
              className="cfg-input cfg-area"
              rows={4}
              placeholder="(data) => data.passed === true"
              value={draft.expression || ''}
              onChange={(e) => set('expression', e.target.value)}
            />
          </label>
          <p className="hint" style={{ fontSize: 11 }}>
            Label wires from this module <code>true</code> / <code>false</code> to route branches.
          </p>
        </>
      )}

      {nodeType === 'delay' && (
        <label className="cfg-row">
          <span>Wait (ms)</span>
          <input
            className="cfg-input"
            type="number"
            min={0}
            step={100}
            value={draft.ms ?? 1000}
            onChange={(e) => set('ms', Number(e.target.value))}
          />
        </label>
      )}

      {nodeType === 'output' && (
        <>
          <label className="cfg-row">
            <span>Deliver via</span>
            <select
              className="cfg-input"
              value={draft.kind || 'console'}
              onChange={(e) => set('kind', e.target.value)}
            >
              <option value="console">browser console</option>
              <option value="download">download .json</option>
              <option value="webhook">webhook POST</option>
            </select>
          </label>
          {draft.kind === 'webhook' && (
            <label className="cfg-row">
              <span>Webhook URL</span>
              <input
                className="cfg-input"
                placeholder="https://webhook.site/your-id"
                value={draft.url || ''}
                onChange={(e) => set('url', e.target.value)}
              />
            </label>
          )}
          {draft.kind === 'download' && (
            <label className="cfg-row">
              <span>Filename</span>
              <input
                className="cfg-input"
                placeholder="flow-output"
                value={draft.filename || ''}
                onChange={(e) => set('filename', e.target.value)}
              />
            </label>
          )}
        </>
      )}

      {(nodeType === 'start') && (
        <p className="hint" style={{ fontSize: 11 }}>
          The entry module — nothing to tune. Input JSON from the Run Console flows from here.
        </p>
      )}

      <div className="cfg-actions">
        <button className="btn-run btn-small" onClick={() => onChange(node.id, draft)}>
          APPLY
        </button>
        <button
          className="btn-ghost btn-danger"
          onClick={() => onDelete(node.id)}
          title={`Delete ${label}`}
        >
          delete module
        </button>
      </div>
    </div>
  );
}
