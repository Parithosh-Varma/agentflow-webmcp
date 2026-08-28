import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import { ChallengeBanner } from '../components/ChallengeBanner';
import { BoltIcon } from '../components/icons';
import './LandingPage.css';

export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="dash-page">
      <header className="dash-header">
        <Link to="/" className="dash-brand">
          <img src={logo} alt="AgentFlow" className="dash-logo" />
          <span>AGENTFLOW</span>
        </Link>
        <span className="dash-tag">HUMAN × AGENT CANVAS</span>
        <div className="dash-header-actions">
          <Link to="/auth" className="dash-header-link">Sign in</Link>
          <button className="btn-run dash-header-cta" onClick={() => navigate('/tool')}>Open tool →</button>
        </div>
      </header>

      {/* WebMCP in 10s — Problem → Solution → Human × Agent */}
      <section className="dash-webmcp-hero" aria-label="WebMCP in 10 seconds">
        <div className="dash-webmcp-inner">
          <div className="dash-webmcp-kicker"><span>◎</span> WebMCP in 10 seconds — the new browser API</div>
          <div className="dash-webmcp-grid">
            <div className="dash-webmcp-card problem">
              <div className="dash-webmcp-card-head"><span className="dash-webmcp-icon dim">✕</span> BEFORE</div>
              <h3>Agents scrape DOM</h3>
              <p>Fragile selectors, hallucinations, breaks on every redesign.</p>
              <code className="dash-webmcp-code-faint">querySelector → click → hope</code>
            </div>
            <div className="dash-webmcp-arrow" aria-hidden>→</div>
            <div className="dash-webmcp-card solution highlight">
              <div className="dash-webmcp-card-head"><span className="dash-webmcp-icon amber">⬢</span> SOLUTION</div>
              <h3>WebMCP: registerTool()</h3>
              <p><code>document.modelContext.registerTool()</code> — 19 typed tools. No scraping.</p>
              <code className="dash-webmcp-code">add_node · connect_nodes · execute_workflow</code>
              <span className="dash-webmcp-badge">19 tools ready</span>
            </div>
            <div className="dash-webmcp-arrow" aria-hidden>→</div>
            <div className="dash-webmcp-card result">
              <div className="dash-webmcp-card-head"><span className="dash-webmcp-icon cyan">◎</span> RESULT</div>
              <h3>Human × Agent — same canvas</h3>
              <p>You drag. Agent calls <code>add_node</code>. Both see LEDs <span className="led-demo running" /> → <span className="led-demo done" /> + ToolLog live.</p>
              <code className="dash-webmcp-code">YOU vs AGENT — real collaboration</code>
            </div>
          </div>
          <div className="dash-webmcp-gif-row">
            <div className="dash-webmcp-gif">
              <div className="dash-webmcp-gif-header">
                <span className="gif-dot" /> <span className="gif-dot" /> <span className="gif-dot" />
                <span className="gif-title">Chrome agent — live</span>
                <span className="gif-live">● LIVE</span>
              </div>
              <div className="dash-webmcp-gif-body">
                <div className="gif-line"><span className="gif-actor">agent</span> <code>add_node({"{"} type: "api_call", label: "HackerNews" {"}"})</code></div>
                <div className="gif-line"><span className="gif-actor you">you</span> drag <b>AI</b> → canvas</div>
                <div className="gif-line"><span className="gif-actor">agent</span> <code>connect_nodes(...)</code> <span className="gif-ok">✓ wired</span></div>
                <div className="gif-line"><span className="gif-actor">agent</span> <code>execute_workflow()</code> <span className="gif-running">● running</span> → <span className="gif-done">✓ done</span></div>
                <div className="gif-canvas-mock">
                  <span className="mock-node start">Start</span><span className="mock-edge">→</span>
                  <span className="mock-node api">HN API</span><span className="mock-edge">→</span>
                  <span className="mock-node ai">AI</span><span className="mock-edge">→</span>
                  <span className="mock-node cond">◆</span><span className="mock-edge">→</span>
                  <span className="mock-node split">⫼</span><span className="mock-edge">→</span>
                  <span className="mock-node out">⬇ save</span>
                </div>
              </div>
              <div className="dash-webmcp-gif-caption">Watch the canvas while the agent works — LEDs run → done, ToolLog streams live. No refresh.</div>
            </div>
            <div className="dash-webmcp-side">
              <div className="dash-webmcp-side-title">Try the 30s wow</div>
              <ol className="dash-webmcp-side-steps">
                <li><b>1.</b> Open <b>/tool</b> → click <b>★ Judge Demo</b></li>
                <li><b>2.</b> Press <b>RUN</b> — real HN API → AI → branch → download + log</li>
                <li><b>3.</b> Ask Chrome agent: “clone the AI node and rerun”</li>
              </ol>
              <button className="btn-run" style={{ width: '100%', marginTop: 8, justifyContent: 'center', display: 'flex' }} onClick={() => navigate('/tool?workflow=judge-demo')}>
                ★ Open Judge Demo directly →
              </button>
              <div className="dash-webmcp-side-note" style={{ marginTop: 8 }}>Chrome: <code>chrome://flags/#enable-webmcp-testing → Enabled</code> · also ChatGPT in-app browser · <Link to="/tool?workflow=judge-demo" style={{ color: 'var(--amber)' }}>/tool?workflow=judge-demo</Link></div>
            </div>
          </div>
        </div>
      </section>

      <ChallengeBanner variant="banner" />
      <div className="dash-challenge-caption">
        <span>Featured hackathon challenge — AgentFlow × WebMCP. Image above links to full challenge.</span>
        <a href="https://d112y698adiu2z.cloudfront.net/photos/production/challenge_photos/005/137/486/datas/full_width.png" target="_blank" rel="noreferrer">View challenge ↗</a>
      </div>

      <main className="dash-main">
        <section className="dash-hero">
          <div className="dash-hero-kicker">Visual Workflow Builder × WebMCP</div>
          <h1 className="dash-hero-title">
            Where humans and browser agents<br />co-create workflows
          </h1>
          <p className="dash-hero-sub">
            Drag, connect, and run workflows on a shared canvas — or let your browser agent in <b>Chrome</b> or <b>ChatGPT in-app browser</b> do it via WebMCP tools.
          </p>

          <div className="dash-hero-actions">
            <button className="btn-run dash-cta-primary" onClick={() => navigate('/tool')}>
              Open tool → Try Judge Demo ★
            </button>
            <button className="btn-ghost dash-cta-skip" onClick={() => navigate('/auth')}>
              Sign in to save
            </button>
          </div>
          <div className="dash-hero-hint">No account needed — try anonymously, or sign in to save to database · also: <Link to="/tool" style={{color:'var(--cyan)'}}>/tool</Link> works directly</div>
        </section>

        <section className="dash-features">
          <div className="dash-feature-card highlight">
            <div className="dash-feature-icon">◎</div>
            <h3>Save to database — sign in required</h3>
            <p>If you <b>sign in</b>, your workflows are saved in the database and persist across devices. <b>Skip</b> to try anonymously — you can always sign in later from the tool.</p>
            <span className="dash-feature-badge">Database • Sync</span>
          </div>

          <div className="dash-feature-card">
            <div className="dash-feature-icon">⬢</div>
            <h3>Visual canvas</h3>
            <p>15 modules — API Call, Condition, Transform, AI, and more. Drag or click to add, wire with pins, validate and run.</p>
          </div>

          <div className="dash-feature-card">
            <div className="dash-feature-icon">⬡</div>
            <h3>Human × Agent</h3>
            <p>Same canvas for you and your agent. Agent uses <code>add_node</code> <code>connect_nodes</code> <code>run</code> — you see LEDs and logs live.</p>
          </div>

          <div className="dash-feature-card">
            <div className="dash-feature-icon"><BoltIcon size={20} /></div>
            <h3>Chrome + ChatGPT</h3>
            <p>Enable one setting: <code>chrome://flags/#enable-webmcp-testing → Enabled</code>. Then ask your browser agent to build flows hands-free.</p>
          </div>
        </section>

        <section className="dash-how">
          <h2>How it works</h2>
          <div className="dash-steps">
            <div className="dash-step"><b>01</b><span>Add modules</span><i>from left sidebar or via agent</i></div>
            <div className="dash-step"><b>02</b><span>Wire & configure</span><i>pins + condition true/false</i></div>
            <div className="dash-step"><b>03</b><span>Run & inspect</span><i>live status + outputs</i></div>
            <div className="dash-step"><b>04</b><span>Save (optional)</span><i>sign in → database</i></div>
          </div>
        </section>
      </main>

      <footer className="dash-footer">
        <span>© 2026 AgentFlow — Visual Workflow Builder × WebMCP</span>
        <div className="dash-footer-links">
          <Link to="/auth">Sign in</Link>
          <Link to="/tool">Open tool</Link>
          <a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noreferrer">WebMCP ↗</a>
        </div>
      </footer>
    </div>
  );
}
