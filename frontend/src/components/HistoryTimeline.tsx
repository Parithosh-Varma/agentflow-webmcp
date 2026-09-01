import { useEffect, useState, useCallback } from "react";
import type { Node, Edge } from "@xyflow/react";
import { UndoIcon, RedoIcon, RefreshIcon } from "./icons";

type Entry = { label: string; at: string; nodes: Node[]; edges: Edge[] };
type Props = { nodes: Node[]; edges: Edge[]; onRestore: (nodes: Node[], edges: Edge[]) => void };

function fmt(at: string) {
  try { return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); } catch { return at; }
}

async function fetchHistory(): Promise<Entry[]> {
  // 1. window.__agentflowHistory direct
  try {
    const w = window as unknown as { __agentflowHistory?: Entry[] };
    if (Array.isArray(w.__agentflowHistory) && w.__agentflowHistory.length) return w.__agentflowHistory;
  } catch { /* ignore */ }
  // 2. via WebMCP tool
  try {
    const w = window as unknown as { __agentflow?: { callTool: (n: string, a: unknown) => Promise<string> } };
    if (w.__agentflow?.callTool) {
      const raw = await w.__agentflow.callTool("get_undo_history", {});
      const j = JSON.parse(raw);
      const h: Entry[] = j.history ?? j.entries ?? [];
      if (Array.isArray(h) && h.length) return h.map((x: Entry & { at: string }) => ({ label: x.label, at: x.at, nodes: (x as unknown as { nodes: Node[] }).nodes ?? [], edges: (x as unknown as { edges: Edge[] }).edges ?? [] }));
    }
  } catch { /* ignore */ }
  // 3. fallback localStorage
  try {
    const keys = ["agentflow_workflow_cache_v1", "agentflow_workflow_cache_v2"];
    for (const k of keys) {
      const r = localStorage.getItem(k);
      if (!r) continue;
      const j = JSON.parse(r);
      if (Array.isArray(j.history)) return j.history;
      if (Array.isArray(j.mutationHistory)) return j.mutationHistory;
    }
    // scan for session caches
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("agentflow_workflow_cache")) continue;
      try { const j2 = JSON.parse(localStorage.getItem(key) ?? ""); if (Array.isArray(j2.history)) return j2.history; } catch {}
    }
  } catch { /* ignore */ }
  return [];
}

export function HistoryTimeline({ nodes: _nodes, edges: _edges, onRestore }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [idx, setIdx] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);

  const reload = useCallback(async () => {
    const h = await fetchHistory();
    setEntries(h);
    setIdx(h.length ? h.length - 1 : 0);
  }, []);

  useEffect(() => { reload(); const t = setInterval(reload, 2500); return () => clearInterval(t); }, [reload]);

  async function undo() {
    try { const w = window as unknown as { __agentflow?: { callTool: (n:string,a:unknown)=>Promise<string> } }; await w.__agentflow?.callTool("undo_last_action", {}); } catch {}
    setTimeout(reload, 200);
  }
  async function redo() {
    try { const w = window as unknown as { __agentflow?: { callTool: (n:string,a:unknown)=>Promise<string> } }; await w.__agentflow?.callTool("redo_last_action", {}); } catch {}
    setTimeout(reload, 200);
  }

  const sel = preview !== null ? entries[preview] : entries[idx];
  const has = entries.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--faint)" }}>History · {entries.length}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={undo} title="Undo" style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-raised)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><UndoIcon size={11} /> Undo</button>
          <button onClick={redo} title="Redo" style={{ padding: "5px 9px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-raised)", color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}><RedoIcon size={11} /> Redo</button>
          <button onClick={reload} title="Refresh" style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--faint)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><RefreshIcon size={11} /></button>
        </div>
      </div>

      {has && (
        <input type="range" min={0} max={entries.length - 1} value={idx} onChange={e => { setIdx(Number(e.target.value)); setPreview(null); }} style={{ width: "100%", accentColor: "var(--amber)" }} aria-label="History slider" />
      )}

      <div style={{ display: "flex", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)" }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel ? `${sel.label} · ${fmt(sel.at)} · ${sel.nodes?.length ?? 0} nodes` : "No history"}</span>
        {sel && <button onClick={() => onRestore(sel.nodes, sel.edges)} style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--amber)", color: "#1a1408", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Restore</button>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 260, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)" }}>
        {!has && <div style={{ padding: "18px 12px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--faint)" }}>No mutations yet — add nodes to see timeline</div>}
        {entries.map((e, i) => (
          <button key={i} onClick={() => setPreview(i)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderBottom: i === entries.length - 1 ? "none" : "1px solid var(--border)", background: (preview ?? idx) === i ? "var(--amber-soft)" : "transparent", cursor: "pointer" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: (preview ?? idx) === i ? "var(--amber)" : "var(--border)", flexShrink: 0, boxShadow: (preview ?? idx) === i ? "0 0 6px var(--amber)" : "none" }} />
            <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--faint)", flexShrink: 0 }}>{fmt(e.at)}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--dim)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 99, padding: "1px 6px", flexShrink: 0 }}>{e.nodes?.length ?? 0}·{e.edges?.length ?? 0}</span>
          </button>
        ))}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--faint)", letterSpacing: "0.04em" }}>Click entry to preview · slider scrubs history</div>
    </div>
  );
}
