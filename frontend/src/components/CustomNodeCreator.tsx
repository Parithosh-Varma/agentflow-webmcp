import { useState, useEffect } from 'react';
import { saveCustomNode, listCustomNodes, deleteCustomNode, type CustomNodeDef, type CustomField } from '../customNodes';
import { CloseIcon } from './icons';

const PRESET_COLORS = ['#a8d8a8','#8f9fdd','#e0b45c','#d98aa6','#6cc7ba','#ab97d4','#e8a33d','#56cdbd','#7ec8e3','#c9a0dc','#f0a07a','#ff6b9d','#7dd3fc','#93c5fd','#f59e0b','#34d399','#f43f5e','#8b5cf6','#06b6d4','#f97316'];

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}

export function CustomNodeCreator({ open, onClose, onChanged }: Props) {
  const [mode, setMode] = useState<'list'|'create'|'edit'>('list');
  const [customNodes, setCustomNodes] = useState<CustomNodeDef[]>([]);
  const [editing, setEditing] = useState<CustomNodeDef | null>(null);

  // form state
  const [type, setType] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState<string>('CodeIcon');
  const [code, setCode] = useState(`// data: input from previous node
// config: your node's config (fields below)
// return anything — it becomes output for next node
return {
  hello: "world",
  input: data,
  config
};`);
  const [fields, setFields] = useState<CustomField[]>([
    { key: 'greeting', label: 'Greeting', type: 'text', placeholder: 'Hello', defaultValue: 'Hello' },
  ]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => setCustomNodes(listCustomNodes());

  useEffect(() => {
    if (open) {
      refresh();
      const h = () => refresh();
      window.addEventListener('custom-nodes-updated', h as any);
      return () => window.removeEventListener('custom-nodes-updated', h as any);
    }
  }, [open]);

  useEffect(() => {
    if (mode === 'create') {
      setType('');
      setDisplayName('');
      setDescription('');
      setColor(PRESET_COLORS[0]);
      setIcon('CodeIcon');
      setCode(`// data: input from previous node
// config: your node's config
return { hello: "world", input: data, config };`);
      setFields([{ key: 'greeting', label: 'Greeting', type: 'text', placeholder: 'Hello', defaultValue: 'Hello' }]);
      setEditing(null);
      setError(null);
    }
    if (mode === 'edit' && editing) {
      setType(editing.type);
      setDisplayName(editing.displayName);
      setDescription(editing.description);
      setColor(editing.color);
      setIcon(editing.icon);
      setCode(editing.code);
      setFields(editing.fields || []);
      setError(null);
    }
  }, [mode, editing]);

  if (!open) return null;

  const handleSave = () => {
    setError(null);
    const res = createCustomNode({
      type: type || displayName,
      displayName,
      description,
      color,
      icon,
      fields,
      code,
      ...(editing ? { createdAt: editing.createdAt } : {}),
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    refresh();
    onChanged?.();
    setMode('list');
  };

  const handleDelete = (t: string) => {
    if (!confirm(`Delete custom node "${t}"? This cannot be undone.`)) return;
    deleteCustomNode(t);
    refresh();
    onChanged?.();
  };

  return (
    <div className="custom-modal-overlay" onClick={onClose}>
      <div className="custom-modal" onClick={e => e.stopPropagation()}>
        <div className="custom-modal-header">
          <h3 style={{margin:0,fontSize:13,letterSpacing:'0.04em'}}>CUSTOM NODES</h3>
          <button className="popover-close" onClick={onClose}><CloseIcon size={14} /></button>
        </div>

        <div className="custom-modal-tabs">
          <button className={`sb-pill ${mode==='list'?'active':''}`} onClick={()=>setMode('list')}>My Nodes ({customNodes.length})</button>
          <button className={`sb-pill ${mode==='create'?'active':''}`} onClick={()=>setMode('create')}>+ Create New</button>
        </div>

        {mode==='list' && (
          <div className="custom-list">
            {customNodes.length===0 ? (
              <div className="sb-empty" style={{padding:'20px 0'}}>
                <div className="sb-empty-icon">◎</div>
                <p>No custom nodes yet</p>
                <p className="hint" style={{fontSize:11}}>Create one to turn any JS (fetch, transform, API) into a reusable module.</p>
                <button className="btn-run btn-small" onClick={()=>setMode('create')}>Create your first node</button>
              </div>
            ) : customNodes.map(n=>(
              <div key={n.type} className="custom-card">
                <div className="custom-card-head">
                  <span className="node-dot" style={{background:n.color}} />
                  <b>{n.displayName}</b>
                  <code style={{fontSize:10, opacity:0.6}}>{n.type}</code>
                </div>
                <p className="hint" style={{fontSize:11, margin:'4px 0'}}>{n.description}</p>
                <div style={{display:'flex',gap:6,marginTop:8}}>
                  <button className="btn-ghost btn-small" onClick={()=>{setEditing(n); setMode('edit');}}>Edit</button>
                  <button className="btn-ghost btn-small" onClick={()=>handleDelete(n.type)} style={{color:'#e74c3c'}}>Delete</button>
                </div>
                <details style={{marginTop:8}}>
                  <summary style={{fontSize:11,cursor:'pointer'}}>code preview</summary>
                  <pre style={{fontSize:10, background:'var(--panel)', padding:8, borderRadius:6, overflow:'auto', maxHeight:120}}>{n.code.slice(0,400)}</pre>
                </details>
              </div>
            ))}
          </div>
        )}

        {(mode==='create' || mode==='edit') && (
          <div className="custom-form">
            {error && <div style={{background:'#fee',color:'#900',padding:'8px 10px',borderRadius:8,fontSize:11,marginBottom:10}}>{error}</div>}

            <label className="cfg-row">
              <span>Display Name *</span>
              <input className="cfg-input" placeholder="My API" value={displayName} onChange={e=>setDisplayName(e.target.value)} />
            </label>
            <label className="cfg-row">
              <span>Type key (auto)</span>
              <input className="cfg-input" placeholder="custom_my_api" value={type} onChange={e=>setType(e.target.value)} />
              <span className="hint" style={{fontSize:10}}>lowercase, _ only, auto-prefixed with custom_</span>
            </label>
            <label className="cfg-row">
              <span>Description</span>
              <input className="cfg-input" placeholder="What does it do?" value={description} onChange={e=>setDescription(e.target.value)} />
            </label>

            <div style={{display:'flex',gap:12}}>
              <label className="cfg-row" style={{flex:1}}>
                <span>Color</span>
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:6}}>
                  {PRESET_COLORS.map(c=>(
                    <button key={c} onClick={()=>setColor(c)} style={{width:22,height:22,borderRadius:6,background:c, border: c===color?'2px solid #111':'1px solid #ddd', cursor:'pointer'}} title={c} />
                  ))}
                </div>
                <input className="cfg-input" style={{marginTop:8}} value={color} onChange={e=>setColor(e.target.value)} placeholder="#a8d8a8" />
              </label>
              <label className="cfg-row" style={{flex:1}}>
                <span>Icon</span>
                <select className="cfg-input" value={icon} onChange={e=>setIcon(e.target.value)}>
                  {["CodeIcon","BoltIcon","StarIcon","SparkIcon","APIIcon","CodeIcon","EmailIcon","FileIcon","ScheduleIcon","GitHubIcon","SlackIcon","SheetsIcon","NotionIcon","DiscordIcon","AIIcon","FilterIcon","LoopIcon","MergeIcon","SplitIcon","AggregateIcon","SortIcon","LimitIcon","SetIcon","TransformIcon","ConditionIcon","ValidatorIcon","LoggerIcon","HTMLIcon","DateTimeIcon","ItemListsIcon","FunctionIcon","NoopIcon","WebhookResponseIcon","WebhookIcon","ResponseIcon","OutputIcon","StartIcon","TriggerIcon","InputIcon","FlowIcon","CustomNodeIcon"].map(ic=> <option key={ic} value={ic}>{ic}</option>)}
                </select>
              </label>
            </div>

            <div className="cfg-row" style={{flexDirection:'column', alignItems:'stretch'}}>
              <span>Config fields (shown in node tuner)</span>
              <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:6}}>
                {fields.map((f, i)=>(
                  <div key={i} style={{display:'flex',gap:6,alignItems:'center', background:'var(--panel)', padding:6, borderRadius:8}}>
                    <input className="cfg-input" style={{flex:1}} placeholder="key" value={f.key} onChange={e=>{ const v=[...fields]; v[i]={...v[i], key:e.target.value}; setFields(v); }} />
                    <input className="cfg-input" style={{flex:1}} placeholder="Label" value={f.label} onChange={e=>{ const v=[...fields]; v[i]={...v[i], label:e.target.value}; setFields(v); }} />
                    <select className="cfg-input" style={{width:110}} value={f.type} onChange={e=>{ const v=[...fields]; v[i]={...v[i], type:e.target.value as any}; setFields(v); }}>
                      <option value="text">text</option>
                      <option value="textarea">textarea</option>
                      <option value="number">number</option>
                      <option value="select">select</option>
                      <option value="boolean">boolean</option>
                    </select>
                    <button className="btn-ghost btn-small" onClick={()=> setFields(fields.filter((_,idx)=>idx!==i))}>×</button>
                  </div>
                ))}
                <button className="btn-ghost btn-small" onClick={()=> setFields([...fields, {key:`field${fields.length+1}`, label:`Field ${fields.length+1}`, type:'text', defaultValue:''}])}>+ Add field</button>
                <span className="hint" style={{fontSize:10}}>Keys become `config.yourKey` in code.</span>
              </div>
            </div>

            <label className="cfg-row" style={{flexDirection:'column', alignItems:'stretch'}}>
              <span>Code * <span className="hint" style={{fontWeight:400}}>(async (data, config) ⇒ your code, must return)</span></span>
              <textarea className="cfg-input cfg-area" rows={10} placeholder={`return { result: data.value * 2 };\n// or fetch:\n// const res = await fetch(config.url);\n// return await res.json();`} value={code} onChange={e=>setCode(e.target.value)} style={{fontFamily:'ui-monospace, monospace', fontSize:11}} />
              <span className="hint" style={{fontSize:10}}>Available globals: `data` (previous node output), `config` (your fields), `fetch`, `console`. Use `return` to output. Top-level `await` allowed.</span>
            </label>

            <div className="cfg-actions">
              <button className="btn-run btn-small" onClick={handleSave}>{mode==='edit'?'SAVE':'CREATE NODE'}</button>
              <button className="btn-ghost btn-small" onClick={()=> setMode('list')}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
