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
            <p className="hint" style={{fontSize:11}}>Waits interval then emits schedule tick.</p>
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
            <label className="cfg-row">
              <span>Variables (JSON)</span>
              <textarea className="cfg-input cfg-area" rows={3} placeholder='{"id": 1}' value={typeof draft.variables === 'string' ? draft.variables : draft.variables ? JSON.stringify(draft.variables) : ''} onChange={(e) => set('variables', e.target.value)} />
            </label>
          </>
        )}

        {nodeType === 'set' && (
          <>
            <label className="cfg-row">
              <span>Fields (JSON)</span>
              <textarea className="cfg-input cfg-area" rows={4} placeholder='{"name": "value", "count": "{{ $json.total }}"}' value={typeof draft.fields === 'string' ? draft.fields : draft.fields ? JSON.stringify(draft.fields, null, 2) : draft.set ? JSON.stringify(draft.set, null, 2) : ''} onChange={(e) => { try { set('fields', JSON.parse(e.target.value)); } catch { set('fields', e.target.value); } }} />
            </label>
            <label className="cfg-row">
              <span>Keep only set</span>
              <select className="cfg-input" value={String(draft.keepOnlySet ?? false)} onChange={(e) => set('keepOnlySet', e.target.value === 'true')}>
                <option value="false">merge with input</option>
                <option value="true">only set fields</option>
              </select>
            </label>
            <p className="hint" style={{fontSize:11}}>Use {"{{ $json.field }}"} to template from input.</p>
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
            <p className="hint" style={{fontSize:11}}>Label outgoing wires with case strings to route.</p>
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
              <textarea className="cfg-input cfg-area" rows={6} placeholder={"return data.map(x=>x*2);\n// or per-item: set perItem true"} value={draft.code || draft.functionCode || draft.expression || ''} onChange={(e) => set('code', e.target.value)} />
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

        {nodeType === 'noop' && (
          <p className="hint" style={{ fontSize: 11 }}>No operation — passes data through. No config needed.</p>
        )}

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
              <span>HTML (or leave empty to use input)</span>
              <textarea className="cfg-input cfg-area" rows={3} placeholder="<div>hello</div>" value={draft.html || ''} onChange={(e) => set('html', e.target.value)} />
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
            {draft.operation === 'format' && (
              <label className="cfg-row">
                <span>Format</span>
                <select className="cfg-input" value={draft.format || 'iso'} onChange={(e) => set('format', e.target.value)}>
                  <option value="iso">iso</option>
                  <option value="locale">locale</option>
                </select>
              </label>
            )}
            {draft.operation === 'add' && (
              <>
                <label className="cfg-row">
                  <span>Amount</span>
                  <input className="cfg-input" type="number" value={draft.amount ?? 1} onChange={(e) => set('amount', Number(e.target.value))} />
                </label>
                <label className="cfg-row">
                  <span>Unit</span>
                  <select className="cfg-input" value={draft.unit || 'days'} onChange={(e) => set('unit', e.target.value)}>
                    <option value="ms">ms</option>
                    <option value="seconds">seconds</option>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </select>
                </label>
              </>
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
            {(nodeType==='postgres' || nodeType==='mysql') && (
              <label className="cfg-row">
                <span>Query / SQL</span>
                <textarea className="cfg-input cfg-area" rows={2} placeholder="SELECT * FROM users" value={draft.query || draft.sql || ''} onChange={(e)=> set('query', e.target.value)} />
              </label>
            )}
            {nodeType==='mongodb' && (
              <label className="cfg-row">
                <span>Operation</span>
                <select className="cfg-input" value={draft.operation || 'find'} onChange={(e)=> set('operation', e.target.value)}>
                  <option value="find">find</option>
                  <option value="insert">insert</option>
                  <option value="update">update</option>
                  <option value="delete">delete</option>
                </select>
              </label>
            )}
            {nodeType==='redis' && (
              <>
                <label className="cfg-row">
                  <span>Operation</span>
                  <select className="cfg-input" value={draft.operation || 'get'} onChange={(e)=> set('operation', e.target.value)}>
                    <option value="get">get</option>
                    <option value="set">set</option>
                    <option value="del">del</option>
                  </select>
                </label>
                <label className="cfg-row">
                  <span>Key</span>
                  <input className="cfg-input" placeholder="mykey" value={draft.key || ''} onChange={(e)=> set('key', e.target.value)} />
                </label>
              </>
            )}
            <p className="hint" style={{fontSize:11}}>Without URL, node runs in simulated mode (logs only).</p>
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
          if (!def) return <p className="hint" style={{fontSize:11}}>Custom node definition not found for {nodeType}. Try recreating it.</p>;
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
                if (f.type === 'boolean') return (
                  <label key={f.key} className="cfg-row">
                    <span>{f.label || f.key}</span>
                    <select className="cfg-input" value={String(val)} onChange={e=> set(f.key, e.target.value==='true')}>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </label>
                );
                if (f.type === 'select') return (
                  <label key={f.key} className="cfg-row">
                    <span>{f.label || f.key}</span>
                    <select className="cfg-input" value={val} onChange={e=> set(f.key, e.target.value)}>
                      {(f.options||[]).map((o:string)=><option key={o} value={o}>{o}</option>)}
                    </select>
                  </label>
                );
                return (
                  <label key={f.key} className="cfg-row">
                    <span>{f.label || f.key}</span>
                    <input className="cfg-input" placeholder={f.placeholder||''} value={val} onChange={e=> set(f.key, e.target.value)} />
                  </label>
                );
              })}
              <label className="cfg-row" style={{flexDirection:'column', alignItems:'stretch'}}>
                <span>Code override (optional)</span>
                <textarea className="cfg-input cfg-area" rows={6} placeholder={def.code.slice(0,120)} value={draft.code || ''} onChange={e=> set('code', e.target.value)} style={{fontFamily:'ui-monospace, monospace', fontSize:11}} />
                <span className="hint" style={{fontSize:10}}>Leave empty to use default code. Default: {def.code.slice(0,80)}...</span>
              </label>
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
            <label className="cfg-row">
              <span>API Key</span>
              <input className="cfg-input" type="password" placeholder="sk-..." value={draft.apiKey || ''} onChange={(e)=> set('apiKey', e.target.value)} />
            </label>
          </>
        )}

        {nodeType === 'manual_trigger' && (
          <p className="hint" style={{ fontSize: 11 }}>Manual trigger — starts workflow when you click Run. Nothing to tune.</p>
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
