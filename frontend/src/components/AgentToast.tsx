import { useEffect, useState } from 'react';
import './AgentToast.css';

const TOAST_KEY = 'agentflow_agent_toast_dismissed_v1';
const TOAST_DONT_SHOW_KEY = 'agentflow_agent_toast_dont_show_v1';

interface Props {
  // Allow parent to force hide (e.g., when modals open)
  suppress?: boolean;
  // Delay before first show in ms
  delayMs?: number;
  // Auto-hide after ms (0 = stay until dismissed)
  autoHideMs?: number;
}

export function AgentToast({ suppress = false, delayMs = 2200, autoHideMs = 0 }: Props) {
  const [open, setOpen] = useState(false);
  const [hasWebMCP, setHasWebMCP] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Check for dont-show flag
    if (localStorage.getItem(TOAST_DONT_SHOW_KEY) === 'true') return;
    if (suppress) return;

    // Detect WebMCP support
    const check = () => {
      // @ts-ignore
      const mc = (document as any).modelContext;
      setHasWebMCP(!!mc && typeof mc.registerTool === 'function');
    };
    check();
    // Re-check after a tick — extensions inject late
    const t1 = setTimeout(check, 800);
    const t2 = setTimeout(check, 1800);

    const timer = setTimeout(() => {
      if (localStorage.getItem(TOAST_DONT_SHOW_KEY) === 'true') return;
      setOpen(true);
    }, delayMs);

    return () => {
      clearTimeout(timer);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [suppress, delayMs]);

  // Auto-hide
  useEffect(() => {
    if (!open || !autoHideMs) return;
    const t = setTimeout(() => setOpen(false), autoHideMs);
    return () => clearTimeout(t);
  }, [open, autoHideMs]);

  if (!open) return null;

  const handleDismiss = () => {
    setOpen(false);
  };

  const handleDontShow = () => {
    localStorage.setItem(TOAST_DONT_SHOW_KEY, 'true');
    setOpen(false);
  };

  const handleCopy = async () => {
    const text = 'chrome://flags/#enable-webmcp-testing';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // fallback: select via prompt
      window.prompt('Copy this flag:', text);
    }
  };

  return (
    <div className="agent-toast" role="dialog" aria-modal="true" aria-label="Browser agent tip">
      <div className="agent-toast-inner">
      <div className="agent-toast-icon" aria-hidden><img src="/logo.png" alt="" style={{width:'22px',height:'22px',objectFit:'contain'}}/></div>

      <div className="agent-toast-body">
        <div className="agent-toast-kicker">
          <span className="agent-toast-badge">Agent-ready</span>
          <span className="agent-toast-status" data-ready={hasWebMCP ? 'yes' : 'no'}>
            <span className="agent-toast-dot" />
            {hasWebMCP ? 'WebMCP detected' : 'Requires one setting'}
          </span>
        </div>

        <h3 className="agent-toast-title">Try operating this site with your browser agent</h3>
        <p className="agent-toast-desc">
          AgentFlow exposes <code>add_node</code> <code>connect_nodes</code> <code>run</code> via WebMCP — ask your <b>browser agent in Chrome</b> (or ChatGPT in-app browser) to build the flow hands-free.
        </p>

        <div className="agent-toast-setting">
          <div className="agent-toast-setting-head">Enable one setting in Chrome (main demo):</div>
          <div className="agent-toast-code">
            <code>chrome://flags/#enable-webmcp-testing → Enabled</code>
            <button className="agent-toast-copy" onClick={handleCopy} title="Copy flag URL">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="agent-toast-steps">
            Open <b>chrome://flags/#enable-webmcp-testing</b> → <b>Enabled</b> → <b>Relaunch</b>
          </div>
          <div className="agent-toast-legacy">
            Also works in ChatGPT in-app browser: enable <code>WebMCP / Agent Mode</code> in its settings.
          </div>
        </div>

        <div className="agent-toast-example">
          <span className="agent-toast-example-label">Try asking Chrome agent:</span>
          <span className="agent-toast-example-text">“Add an API Call to GitHub, connect it to Start, and run the workflow”</span>
        </div>
      </div>

      <button className="agent-toast-close" onClick={handleDismiss} aria-label="Dismiss">×</button>

      <div className="agent-toast-actions">
        <button className="agent-toast-primary" onClick={handleDismiss}>
          Got it
        </button>
        <button className="agent-toast-ghost" onClick={handleDontShow}>
          Don’t show again
        </button>
        <a
          className="agent-toast-link"
          href="https://developer.chrome.com/docs/ai/webmcp"
          target="_blank"
          rel="noreferrer"
        >
          Learn more ↗
        </a>
      </div>
      </div>
    </div>
  );
}

export function resetAgentToast() {
  localStorage.removeItem(TOAST_KEY);
  localStorage.removeItem(TOAST_DONT_SHOW_KEY);
}
