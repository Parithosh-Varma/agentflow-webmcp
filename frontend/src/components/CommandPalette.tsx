import { useEffect, useMemo, useRef, useState } from "react";
import { NODE_CATALOG } from "./Sidebar";

interface Props {
  onSelect: (type: string, nodeType: string) => void;
}

export default function CommandPalette({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q
      ? NODE_CATALOG
      : NODE_CATALOG.filter(
          (n: any) =>
            n.label.toLowerCase().includes(q) ||
            n.type.toLowerCase().includes(q) ||
            n.desc.toLowerCase().includes(q) ||
            n.category.toLowerCase().includes(q)
        );
    return list.slice(0, 10);
  }, [query]);

  // reset active when filter or open changes
  useEffect(() => {
    setActive(0);
  }, [query, open]);

  // global shortcut: Cmd+K / Ctrl+K to open, Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      const mod = e.metaKey || e.ctrlKey;
      if (isK && mod) {
        e.preventDefault();
        setOpen((v) => !v);
        // if closing via toggle, don't refocus
        if (!open) setQuery("");
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // auto-focus input when opened, body scroll lock
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        cancelAnimationFrame(id);
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // keep active item in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const handleSelect = (type: string, nodeType: string) => {
    onSelect(type, nodeType);
    setOpen(false);
    setQuery("");
    setActive(0);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % Math.max(filtered.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + filtered.length) % Math.max(filtered.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = filtered[active];
      if (hit) handleSelect(hit.type, hit.nodeType);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        background: "rgba(0,0,0,0.48)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "22vh",
      }}
      aria-hidden={false}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette — add modules"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, calc(100vw - 32px))",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.03) inset",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            background: "var(--panel)",
          }}
        >
          <span aria-hidden style={{ color: "var(--faint)", display: "flex", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
            </svg>
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search modules — try 'api', 'condition', 'logic'..."
            aria-label="Search modules"
            aria-autocomplete="list"
            aria-controls="cmdk-listbox"
            aria-activedescendant={filtered[active] ? `cmdk-opt-${filtered[active].type}` : undefined}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--ink)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
            }}
          />
          <kbd
            aria-hidden
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--faint)",
              background: "var(--bg)",
              border: "1px solid var(--border-soft)",
              borderRadius: 4,
              padding: "2px 6px",
              lineHeight: 1,
            }}
          >
            ESC
          </kbd>
        </div>

        {/* list */}
        <div
          id="cmdk-listbox"
          role="listbox"
          aria-label="Modules"
          ref={listRef}
          style={{
            maxHeight: 380,
            overflowY: "auto",
            padding: 6,
            background: "var(--bg)",
          }}
        >
          {filtered.length === 0 ? (
            <div
              role="status"
              style={{
                padding: "20px 14px",
                textAlign: "center",
                color: "var(--faint)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}
            >
              No modules match &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((nt: any, idx: number) => {
              const isActive = idx === active;
              return (
                <button
                  key={nt.type}
                  id={`cmdk-opt-${nt.type}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => handleSelect(nt.type, nt.nodeType)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 10px",
                    borderRadius: 8,
                    border: isActive ? "1px solid var(--border-soft)" : "1px solid transparent",
                    background: isActive ? "var(--bg-raised)" : "transparent",
                    color: isActive ? "var(--ink)" : "var(--ink-2)",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      color: nt.color,
                      background: `color-mix(in srgb, ${nt.color} 12%, var(--bg))`,
                      border: `1px solid color-mix(in srgb, ${nt.color} 18%, transparent)`,
                    }}
                  >
                    {nt.icon}
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <b style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{nt.label}</b>
                      <i
                        style={{
                          fontStyle: "normal",
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--faint)",
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {nt.category}
                      </i>
                    </span>
                    <span style={{ display: "block", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {nt.desc}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--faint)",
                      opacity: isActive ? 1 : 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    ↵
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 10px",
            borderTop: "1px solid var(--border)",
            background: "var(--panel-2)",
            color: "var(--faint)",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.04em",
          }}
          aria-hidden
        >
          <span>
            <b style={{ color: "var(--ink-2)" }}>↑↓</b> navigate
          </span>
          <span>
            <b style={{ color: "var(--ink-2)" }}>↵</b> add
          </span>
          <span>
            <b style={{ color: "var(--ink-2)" }}>ESC</b> close
          </span>
          <span style={{ marginLeft: "auto", opacity: 0.85 }}>{filtered.length} / {NODE_CATALOG.length}</span>
        </div>
      </div>
    </div>
  );
}

// Named export for convenience
export { CommandPalette as NamedCommandPalette };
