import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import { ChallengeBanner } from '../components/ChallengeBanner';
import { BoltIcon } from '../components/icons';
import './DashboardPage.css';

export function DashboardPage() {
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
          <button className="btn-run dash-header-cta" onClick={() => navigate('/auth')}>Go to the tool →</button>
        </div>
      </header>

      <ChallengeBanner variant="banner" />

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
            <button className="btn-run dash-cta-primary" onClick={() => navigate('/auth')}>
              Go to the tool →
            </button>
            <button className="btn-ghost dash-cta-skip" onClick={() => navigate('/tool')}>
              Skip for now
            </button>
          </div>
          <div className="dash-hero-hint">No account needed to try — sign in to save to database</div>
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
