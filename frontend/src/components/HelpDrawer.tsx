import { CloseIcon, ExternalLinkIcon } from './icons';
import './HelpDrawer.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onReplay: () => void;
}

export function HelpDrawer({ open, onClose, onReplay }: Props) {
  if (!open) return null;

  return (
    <>
      <div className="help-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="help-drawer" role="dialog" aria-modal="true" aria-label="How to use AgentFlow">
        <div className="help-header">
          <div>
            <div className="help-kicker">Guide</div>
            <h2 className="help-title">How to use AgentFlow</h2>
          </div>
          <button className="help-close" onClick={onClose} aria-label="Close help"><CloseIcon size={14} /></button>
        </div>

        <div className="help-body">
          <section className="help-section">
            <h3>Quick start</h3>
            <ol className="help-steps">
              <li><b>Add modules</b> from the left sidebar — search or pick a type.</li>
              <li><b>Wire them</b> by dragging from a pin to another module on the canvas.</li>
              <li><b>Configure</b> by clicking a module to open its tuner.</li>
              <li><b>Run</b> from the right panel — inspect live LEDs and output.</li>
            </ol>
          </section>

          <section className="help-section">
            <h3>Workflow rules</h3>
            <ul className="help-list">
              <li>Condition wires use labels <code>true</code> / <code>false</code> to branch.</li>
              <li>Start node is the entry point — every flow begins there.</li>
              <li>An agent can build the same workflow via <code>add_node</code>, <code>connect_nodes</code>, <code>run</code> WebMCP tools.</li>
            </ul>
          </section>

          <section className="help-section">
            <h3>Shortcuts</h3>
            <div className="help-shortcuts">
              <div><code>?</code> <span>Open this guide</span></div>
              <div><code>Esc</code> <span>Close modal / drawer / popover</span></div>
              <div><code>Drag</code> <span>Move modules on canvas</span></div>
              <div><code>Click</code> <span>Select module to tune</span></div>
            </div>
          </section>

          <section className="help-section">
            <h3>Tips</h3>
            <p className="help-hint">
              Use <b>load example flow</b> in the sidebar to see a complete GitHub → transform → condition → output pipeline, then press <b>RUN</b>.
            </p>
          </section>
        </div>

        <div className="help-footer">
          <button className="help-replay" onClick={onReplay}>
            ↺ Replay Onboarding
          </button>
          <a className="help-link" href="https://agentflow-hackathon.pages.dev/" target="_blank" rel="noreferrer">
            Open live site <ExternalLinkIcon size={12} />
          </a>
        </div>
      </aside>
    </>
  );
}

export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="help-fab" onClick={onClick} aria-label="How to use" title="How to use ( ? )">
      ?
    </button>
  );
}
