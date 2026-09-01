import { useState, useRef, useEffect } from 'react';
import { CloseIcon } from './icons';

type ChatEntry = { role: 'human' | 'agent'; text: string; detail?: string };

interface Props {
  open: boolean;
  onClose: () => void;
  addToolLog?: (tool: string, input: any, result: any, actor?: 'agent' | 'you') => void;
  nodesRef?: { current: any[] };
}

declare global {
  interface Window {
    __agentflow?: { callTool: (name: string, args?: any) => Promise<any>; listTools?: () => string[] };
    __webmcpReady?: boolean;
  }
}

const NODE_KEYWORDS: Array<{ kw: string; type: string }> = [
  { kw: 'hackernews', type: 'api_call' },
  { kw: 'api', type: 'api_call' },
  { kw: 'fetch', type: 'api_call' },
  { kw: 'webhook', type: 'webhook' },
  { kw: 'condition', type: 'condition' },
  { kw: 'if', type: 'condition' },
  { kw: 'transform', type: 'transform' },
  { kw: 'output', type: 'output' },
  { kw: 'ai', type: 'ai' },
  { kw: 'logger', type: 'logger' },
  { kw: 'log', type: 'logger' },
  { kw: 'split', type: 'split' },
  { kw: 'merge', type: 'merge' },
  { kw: 'delay', type: 'delay' },
  { kw: 'filter', type: 'filter' },
  { kw: 'code', type: 'code' },
  { kw: 'schedule', type: 'schedule' },
];

function inferNodeType(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { kw, type } of NODE_KEYWORDS) if (lower.includes(kw)) return type;
  return null;
}

function parseLabel(text: string, type: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('hackernews')) return 'HackerNews API';
  // take words after "add" as hint
  const m = text.match(/add\s+(?:an?\s+)?(.+?)(?:\s+and|\s+then|,|$)/i);
  if (m) return m[1].trim().slice(0, 40);
  return type;
}

export function AgentChatDrawer({ open, onClose, addToolLog, nodesRef }: Props) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<ChatEntry[]>([
    { role: 'agent', text: 'Hi — try "Add an API Call to HackerNews and run it" or "connect nodes" / "run workflow".' },
  ]);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) setTimeout(() => taRef.current?.focus(), 120); }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [history, busy]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  async function callTool(name: string, args: any): Promise<{ ok: boolean; raw: string; parsed: any }> {
    const af = window.__agentflow;
    if (af?.callTool) {
      const raw = await af.callTool(name, args);
      let parsed: any;
      try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { parsed = raw; }
      addToolLog?.(name, args, parsed, 'you');
      return { ok: true, raw: typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2), parsed };
    }
    // simulated fallback
    const sim = { success: true, simulated: true, tool: name, args, hint: 'WebMCP not ready — simulated response. Enable chrome://flags/#enable-webmcp-testing' };
    addToolLog?.(name, args, sim, 'you');
    return { ok: false, raw: JSON.stringify(sim, null, 2), parsed: sim };
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setHistory((h) => [...h, { role: 'human', text }]);
    setBusy(true);
    const lower = text.toLowerCase();
    try {
      let result: { ok: boolean; raw: string; parsed: any };
      let hint = '';

      if (lower.includes('add') && inferNodeType(text)) {
        const type = inferNodeType(text)!;
        const label = parseLabel(text, type);
        // HackerNews preset
        const config = type === 'api_call' && lower.includes('hackernews')
          ? { url: 'https://hn.algolia.com/api/v1/search?tags=front_page', method: 'GET' }
          : undefined;
        const args: any = { type, label };
        if (config) args.config = config;
        result = await callTool('add_node', args);
        // auto-connect + run if requested in same utterance
        if (lower.includes('run') || lower.includes('execute')) {
          const runRes = await callTool('execute_workflow', { input: {} });
          hint = ` — also executed workflow`;
          setHistory((h) => [...h, { role: 'agent', text: `✓ add_node(${type})` + hint, detail: result.raw }, { role: 'agent', text: `▶ execute_workflow`, detail: runRes.raw }]);
        } else {
          setHistory((h) => [...h, { role: 'agent', text: `✓ add_node(${type}) → ${label}`, detail: result.raw }]);
        }
      } else if (lower.includes('connect')) {
        // try to connect last two nodes if we have refs, else ask for discovery
        const nodes = nodesRef?.current ?? [];
        if (nodes.length >= 2) {
          const a = nodes[nodes.length - 2].id, b = nodes[nodes.length - 1].id;
          result = await callTool('connect_nodes', { sourceNodeId: a, targetNodeId: b });
          setHistory((h) => [...h, { role: 'agent', text: `→ connect_nodes ${a} → ${b}`, detail: result.raw }]);
        } else {
          // discover via get_workflow_status then connect
          const status = await callTool('get_workflow_status', {});
          const ids: string[] = status.parsed?.nodes?.map((n: any) => n.id) ?? [];
          if (ids.length >= 2) {
            result = await callTool('connect_nodes', { sourceNodeId: ids[ids.length - 2], targetNodeId: ids[ids.length - 1] });
            setHistory((h) => [...h, { role: 'agent', text: `→ connect_nodes ${ids[ids.length - 2]} → ${ids[ids.length - 1]}`, detail: result.raw }]);
          } else {
            setHistory((h) => [...h, { role: 'agent', text: `Need 2+ nodes to connect. Add nodes first.`, detail: status.raw }]);
          }
        }
      } else if (lower.includes('run') || lower.includes('execute')) {
        result = await callTool('execute_workflow', { input: {} });
        setHistory((h) => [...h, { role: 'agent', text: `▶ execute_workflow`, detail: result.raw }]);
      } else {
        result = await callTool('get_available_tools', {});
        hint = '\nTry: "Add an API Call to HackerNews", "Add a condition", "connect nodes", "run workflow".';
        setHistory((h) => [...h, { role: 'agent', text: `Available tools — what would you like to do?${hint}`, detail: result.raw }]);
      }
    } catch (e: any) {
      setHistory((h) => [...h, { role: 'agent', text: `Error: ${e?.message ?? String(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.32)', backdropFilter: 'blur(1px)', zIndex: 380 }} />
      <aside role="dialog" aria-modal="true" aria-label="Agent chat" style={{ position: 'fixed', top: 0, right: 0, width: 380, maxWidth: '92vw', height: '100%', background: 'linear-gradient(180deg,var(--panel) 0%,var(--bg-raised) 100%)', borderLeft: '1px solid var(--border)', boxShadow: '-16px 0 48px rgba(0,0,0,0.45)', zIndex: 381, display: 'flex', flexDirection: 'column', animation: 'agentchat-slide 0.26s cubic-bezier(0.22,1,0.36,1)' }}>
        <style>{`@keyframes agentchat-slide{from{transform:translateX(100%);opacity:.6}to{transform:translateX(0);opacity:1}}`}</style>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 12px', borderBottom: '1px solid var(--border-faint)', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--cyan)', marginBottom: 3 }}>Human × Agent</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Agent Chat</div>
          </div>
          <button onClick={onClose} aria-label="Close chat" style={{ width: 28, height: 28, border: '1px solid var(--border-soft)', borderRadius: 8, background: 'var(--bg)', color: 'var(--dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CloseIcon size={12} /></button>
        </div>

        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-faint)', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)', lineHeight: 1.5 }}>
            Natural language → <code style={{ color: 'var(--cyan)', background: 'var(--bg)', border: '1px solid var(--border-faint)', padding: '1px 4px', borderRadius: 4, fontSize: 9 }}>window.__agentflow.callTool</code>
            {window.__agentflow ? <span style={{ color: 'var(--cyan)', marginLeft: 6 }}>● live</span> : <span style={{ color: 'var(--amber)', marginLeft: 6 }}>○ simulated</span>}
          </div>
        </div>

        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {history.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'human' ? 'flex-end' : 'flex-start', gap: 6 }}>
              <div style={{ maxWidth: '88%', padding: '8px 11px', borderRadius: 10, fontSize: 12, lineHeight: 1.5, border: '1px solid var(--border-soft)', background: m.role === 'human' ? 'var(--amber-soft)' : 'var(--bg-high)', color: m.role === 'human' ? 'var(--ink)' : 'var(--ink-2)', borderColor: m.role === 'human' ? 'color-mix(in srgb,var(--amber) 30%,var(--border-soft))' : 'var(--border-soft)', fontFamily: 'var(--font-body)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: '0.14em', textTransform: 'uppercase', color: m.role === 'human' ? 'var(--amber)' : 'var(--cyan)', display: 'block', marginBottom: 4 }}>{m.role === 'human' ? 'YOU' : 'AGENT'}</span>
                {m.text}
              </div>
              {m.detail && <pre style={{ maxWidth: '88%', width: '88%', margin: 0, padding: '7px 8px', background: 'var(--bg)', border: '1px solid var(--border-faint)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 9, lineHeight: 1.6, color: 'var(--ink-muted)', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', maxHeight: 160, overflow: 'auto' }}>{m.detail.slice(0, 3000)}</pre>}
            </div>
          ))}
          {busy && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)' }}>calling tool…</div>}
        </div>

        <div style={{ padding: 12, borderTop: '1px solid var(--border-faint)', background: 'var(--panel)', display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder='Add an API Call to HackerNews and run it'
            rows={2}
            style={{ flex: 1, padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border-soft)', borderRadius: 8, color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.5, resize: 'none', outline: 'none' }}
          />
          <button onClick={handleSend} disabled={busy || !input.trim()} style={{ padding: '9px 14px', border: 'none', borderRadius: 8, background: busy || !input.trim() ? 'var(--border)' : 'linear-gradient(180deg,var(--amber) 0%,var(--amber-dim) 100%)', color: busy || !input.trim() ? 'var(--faint)' : '#1a1408', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: busy || !input.trim() ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: busy || !input.trim() ? 0.6 : 1 }}>Send</button>
        </div>
      </aside>
    </>
  );
}
