import { useEffect, useState } from "react";
import { CloseIcon, CheckIcon } from "./icons";

type Vault = {
  email: { to: string; apiKey?: string };
  slack: { webhookUrl: string };
  database: { url: string };
  cache: { key: string };
};

const KEY = "agentflow_vault_v1";
const empty: Vault = { email: { to: "" }, slack: { webhookUrl: "" }, database: { url: "" }, cache: { key: "" } };

function load(): Vault {
  try {
    const r = localStorage.getItem(KEY);
    if (r) return { ...empty, ...JSON.parse(r), email: { ...empty.email, ...JSON.parse(r).email }, slack: { ...empty.slack, ...JSON.parse(r).slack }, database: { ...empty.database, ...JSON.parse(r).database }, cache: { ...empty.cache, ...JSON.parse(r).cache } };
  } catch { /* ignore */ }
  return { ...empty, email: { ...empty.email }, slack: { ...empty.slack }, database: { ...empty.database }, cache: { ...empty.cache } };
}
function mask(v: string) { if (!v) return "—"; if (v.length <= 8) return "•".repeat(v.length); return v.slice(0, 3) + "•".repeat(Math.min(10, v.length - 6)) + v.slice(-3); }

export function VaultDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [vault, setVault] = useState<Vault>(() => load());
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setVault(load()); }, [open]);

  function persist(next: Vault) {
    localStorage.setItem(KEY, JSON.stringify(next));
    setVault(next);
    try { fetch("/api/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {}); } catch { /* fire-and-forget */ }
  }
  function save() { setSaving(true); persist(vault); setTimeout(() => setSaving(false), 600); }
  function clearAll() {
    const n = { ...empty, email: { ...empty.email }, slack: { ...empty.slack }, database: { ...empty.database }, cache: { ...empty.cache } };
    localStorage.removeItem(KEY);
    setVault(n);
    try { fetch("/api/vault", { method: "DELETE" }).catch(() => {}); } catch {}
  }

  if (!open) return null;
  const stored = load();
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", backdropFilter: "blur(1px)", zIndex: 380 }} />
      <aside role="dialog" aria-modal="true" aria-label="Secrets vault" style={{ position: "fixed", top: 0, right: 0, width: 380, maxWidth: "92vw", height: "100%", background: "var(--panel)", borderLeft: "1px solid var(--border)", boxShadow: "-16px 0 48px rgba(0,0,0,0.45)", zIndex: 381, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-raised)" }}>
          <div><div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--amber)" }}>Vault</div><div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Secrets</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--faint)" }}>Stored: <code style={{ color: "var(--dim)" }}>{KEY}</code></div></div>
          <button onClick={onClose} aria-label="Close" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--dim)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><CloseIcon size={12} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* email */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "var(--bg-raised)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Email</div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)" }}>To</label>
            <input value={vault.email.to} onChange={e => setVault({ ...vault, email: { ...vault.email, to: e.target.value } })} placeholder="ops@example.com" style={{ width: "100%", marginTop: 4, padding: "7px 9px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 11, outline: "none" }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--faint)", marginTop: 4 }}>stored: {mask(stored.email.to)}</div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)", marginTop: 8, display: "block" }}>API key (optional)</label>
            <input value={vault.email.apiKey ?? ""} onChange={e => setVault({ ...vault, email: { ...vault.email, apiKey: e.target.value } })} placeholder="sk_..." type="password" style={{ width: "100%", marginTop: 4, padding: "7px 9px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 11, outline: "none" }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--faint)", marginTop: 4 }}>stored: {mask(stored.email.apiKey ?? "")}</div>
          </section>
          {/* slack */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "var(--bg-raised)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Slack</div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)" }}>Webhook URL</label>
            <input value={vault.slack.webhookUrl} onChange={e => setVault({ ...vault, slack: { webhookUrl: e.target.value } })} placeholder="https://hooks.slack.com/..." style={{ width: "100%", marginTop: 4, padding: "7px 9px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 11, outline: "none" }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--faint)", marginTop: 4 }}>stored: {mask(stored.slack.webhookUrl)}</div>
          </section>
          {/* database */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "var(--bg-raised)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Database</div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)" }}>URL</label>
            <input value={vault.database.url} onChange={e => setVault({ ...vault, database: { url: e.target.value } })} placeholder="postgres://..." style={{ width: "100%", marginTop: 4, padding: "7px 9px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 11, outline: "none" }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--faint)", marginTop: 4 }}>stored: {mask(stored.database.url)}</div>
          </section>
          {/* cache */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: "var(--bg-raised)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Cache</div>
            <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)" }}>Key</label>
            <input value={vault.cache.key} onChange={e => setVault({ ...vault, cache: { key: e.target.value } })} placeholder="cache-key-..." style={{ width: "100%", marginTop: 4, padding: "7px 9px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--ink)", fontFamily: "var(--font-mono)", fontSize: 11, outline: "none" }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--faint)", marginTop: 4 }}>stored: {mask(stored.cache.key)}</div>
          </section>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--border)", background: "var(--bg-raised)" }}>
          <button onClick={save} style={{ flex: 1, padding: "9px 14px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#1a1408", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>{saving ? <><CheckIcon size={10} /> Saved</> : "Save vault"}</button>
          <button onClick={clearAll} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--faint)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: "pointer" }}>Clear</button>
        </div>
      </aside>
    </>
  );
}
