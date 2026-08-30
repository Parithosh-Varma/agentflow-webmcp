import { useEffect, useState } from 'react';
import type { Node } from '@xyflow/react';
import { CloseIcon } from './icons';

interface Props {
  node: Node | null;
  onChange: (nodeId: string, config: any) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function NodePopover({ node, onChange, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<any>({});

  useEffect(() => {
    setDraft({ ...(node?.data?.config || {}) });
  }, [node?.id]);

  if (!node) return null;

  const nodeType = (node.data?.nodeType as string) || 'start';
  const label = String(node.data?.label || node.id);
  const set = (k: string, v: any) => setDraft((d: any) => ({ ...d, [k]: v }));

  return (
    <div className="node-popover" onClick={(e) => e.stopPropagation()}>
      <div className="popover-header">
        <span className="popover-title">{label}</span>
        <button className="popover-close" onClick={onClose}><CloseIcon size={14} /></button>
      </div>

      <div className="popover-body">
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

        {nodeType === 'filter' && (
          <label className="cfg-row">
            <span>(data) =&gt; boolean</span>
            <textarea
              className="cfg-input cfg-area"
              rows={4}
              placeholder="(data) => data.status === 'active'"
              value={draft.expression || ''}
              onChange={(e) => set('expression', e.target.value)}
            />
          </label>
        )}

        {nodeType === 'split' && (
          <label className="cfg-row">
            <span>Batch size</span>
            <input
              className="cfg-input"
              type="number"
              min={1}
              value={draft.batchSize ?? 10}
              onChange={(e) => set('batchSize', Number(e.target.value))}
            />
          </label>
        )}

        {nodeType === 'merge' && (
          <p className="hint" style={{ fontSize: 11 }}>
            Combines all inputs into one object. No config needed.
          </p>
        )}

        {nodeType === 'loop' && (
          <label className="cfg-row">
            <span>Max iterations</span>
            <input
              className="cfg-input"
              type="number"
              min={1}
              value={draft.maxIterations ?? 10}
              onChange={(e) => set('maxIterations', Number(e.target.value))}
            />
          </label>
        )}

        {nodeType === 'code' && (
          <label className="cfg-row">
            <span>JavaScript code</span>
            <textarea
              className="cfg-input cfg-area"
              rows={6}
              placeholder={"return data.map(x => x * 2);"}
              value={draft.code || ''}
              onChange={(e) => set('code', e.target.value)}
            />
          </label>
        )}

        {nodeType === 'webhook' && (
          <>
            <label className="cfg-row">
              <span>URL</span>
              <input
                className="cfg-input"
                placeholder="https://api.example.com/hook"
                value={draft.url || ''}
                onChange={(e) => set('url', e.target.value)}
              />
            </label>
            <label className="cfg-row">
              <span>Method</span>
              <select
                className="cfg-input"
                value={draft.method || 'POST'}
                onChange={(e) => set('method', e.target.value)}
              >
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {nodeType === 'ai' && (
          <>
            <label className="cfg-row">
              <span>Prompt</span>
              <textarea
                className="cfg-input cfg-area"
                rows={3}
                placeholder="Summarize the input data"
                value={draft.prompt || ''}
                onChange={(e) => set('prompt', e.target.value)}
              />
            </label>
            <label className="cfg-row">
              <span>Model</span>
              <input
                className="cfg-input"
                placeholder="gpt-3.5-turbo"
                value={draft.model || ''}
                onChange={(e) => set('model', e.target.value)}
              />
            </label>
            <label className="cfg-row">
              <span>API Key</span>
              <input
                className="cfg-input"
                type="password"
                placeholder="sk-..."
                value={draft.apiKey || ''}
                onChange={(e) => set('apiKey', e.target.value)}
              />
            </label>
          </>
        )}

        {nodeType === 'validator' && (
          <label className="cfg-row">
            <span>(data) =&gt; boolean</span>
            <textarea
              className="cfg-input cfg-area"
              rows={4}
              placeholder="(data) => data.length > 0"
              value={draft.expression || ''}
              onChange={(e) => set('expression', e.target.value)}
            />
          </label>
        )}

        {nodeType === 'logger' && (
          <>
            <label className="cfg-row">
              <span>Level</span>
              <select
                className="cfg-input"
                value={draft.level || 'info'}
                onChange={(e) => set('level', e.target.value)}
              >
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
            </label>
            <label className="cfg-row">
              <span>Message</span>
              <input
                className="cfg-input"
                placeholder="Checkpoint label"
                value={draft.message || ''}
                onChange={(e) => set('message', e.target.value)}
              />
            </label>
          </>
        )}

        {nodeType === 'file' && (
          <>
            <label className="cfg-row">
              <span>Operation</span>
              <select
                className="cfg-input"
                value={draft.operation || 'write'}
                onChange={(e) => set('operation', e.target.value)}
              >
                <option value="write">write (download)</option>
                <option value="read">read (pass-through)</option>
              </select>
            </label>
            <label className="cfg-row">
              <span>Filename</span>
              <input
                className="cfg-input"
                placeholder="output.json"
                value={draft.path || ''}
                onChange={(e) => set('path', e.target.value)}
              />
            </label>
          </>
        )}

        {nodeType === 'start' && (
          <p className="hint" style={{ fontSize: 11 }}>
            The entry module — nothing to tune.
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
            delete
          </button>
        </div>
      </div>
    </div>
  );
}
