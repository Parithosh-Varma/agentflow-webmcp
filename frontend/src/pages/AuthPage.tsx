import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';
import './AuthPage.css';

export function AuthPage() {
  const { user, login, register, logout } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(username, email, password);
      }
      navigate('/tool');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    logout();
  };

  // Authenticated view — account management with same spacious layout
  if (user) {
    return (
      <div className="auth-page">
        <header className="auth-page-header">
          <Link to="/" className="auth-page-brand">
            <img src={logo} alt="AgentFlow" className="auth-page-logo" />
            <span>AGENTFLOW</span>
          </Link>
          <Link to="/tool" className="auth-page-back">← Back to tool</Link>
        </header>

        <div className="auth-page-container">
          <div className="auth-page-left">
            <div className="auth-page-kicker">Account</div>
            <h1 className="auth-page-title">You’re signed in</h1>
            <p className="auth-page-subtitle">Manage your workspace and saved workflows. Your flows are synced to your account.</p>
            <ul className="auth-page-features">
              <li><span className="feat-dot" /> Saved workflows persist across devices</li>
              <li><span className="feat-dot" /> Templates shared with your team</li>
              <li><span className="feat-dot" /> Run history tied to your identity</li>
            </ul>
          </div>

          <div className="auth-card">
            <div className="auth-card-header">
              <div className="auth-card-avatar">{user.username[0].toUpperCase()}</div>
              <div>
                <div className="auth-card-name">{user.username}</div>
                <div className="auth-card-email">{user.email}</div>
              </div>
              <span className="auth-card-badge">Active</span>
            </div>

            <div className="auth-card-body">
              <p className="auth-card-hint">Signed in as <b>{user.username}</b>. All workflows you save will be linked to this account.</p>
            </div>

            <div className="auth-card-actions">
              <Link to="/tool" className="btn-run auth-card-primary">Go to Tool</Link>
              <button className="btn-ghost auth-card-secondary" onClick={handleLogout}>Sign out</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <header className="auth-page-header">
        <Link to="/" className="auth-page-brand">
          <img src={logo} alt="AgentFlow" className="auth-page-logo" />
          <span>AGENTFLOW</span>
        </Link>
        <span className="auth-page-tag">HUMAN × AGENT CANVAS</span>
      </header>

      <div className="auth-page-container">
        {/* Left — branding / benefits */}
        <div className="auth-page-left">
          <div className="auth-page-kicker">Welcome back</div>
          <h1 className="auth-page-title">
            {mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace'}
          </h1>
          <p className="auth-page-subtitle">
            Visual workflow builder where humans and AI agents co-create automation pipelines via WebMCP. Sign in to save, share, and run flows.
          </p>

          <ul className="auth-page-features">
            <li><span className="feat-dot" /> Drag, connect, and run — no code to start</li>
            <li><span className="feat-dot" /> Agent builds via <code>add_node</code> <code>connect_nodes</code> <code>run</code></li>
            <li><span className="feat-dot" /> <b>Sign in to save your workflow in the database</b> — persists across devices</li>
          </ul>

          <div className="auth-page-quote">
            <p>“Load example flow and press RUN — see a live GitHub → transform → condition pipeline in seconds.”</p>
            <span>— Quick start tip</span>
          </div>
        </div>

        {/* Right — form card */}
        <div className="auth-card">
          <div className="auth-card-top">
            <div className="auth-card-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={mode === 'login'}
                className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => { setMode('login'); setError(''); }}
              >
                Sign In
              </button>
              <button
                role="tab"
                aria-selected={mode === 'register'}
                className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => { setMode('register'); setError(''); }}
              >
                Create Account
              </button>
            </div>
            <Link to="/tool" className="auth-card-close" aria-label="Back to canvas">×</Link>
          </div>

          <div className="auth-card-intro">
            <h2>{mode === 'login' ? 'Welcome back' : 'Join AgentFlow'}</h2>
            <p>{mode === 'login' ? 'Use your email and password to continue.' : 'Create an account to save workflows and templates.'}</p>
          </div>

          <div className="auth-feature-callout">
            <span className="auth-feature-icon">◎</span>
            <div>
              <b>Save your workflow in the database</b>
              <span>Sign in to persist workflows & templates — access from any device. Skip to try without saving.</span>
            </div>
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <label className="cfg-row auth-row">
                <span>Username</span>
                <input
                  className="cfg-input auth-input"
                  type="text"
                  placeholder="your name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  autoFocus
                />
              </label>
            )}

            <label className="cfg-row auth-row">
              <span>Email</span>
              <input
                className="cfg-input auth-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus={mode === 'login'}
              />
            </label>

            <label className="cfg-row auth-row">
              <span>Password</span>
              <div className="auth-pass-wrap">
                <input
                  className="cfg-input auth-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button type="button" className="auth-pass-toggle" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Hide password' : 'Show password'}>
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="auth-pass-hint">At least 6 characters</span>
            </label>

            <button className="btn-run auth-submit" type="submit" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
            <button type="button" className="btn-ghost auth-skip" onClick={() => navigate('/tool')}>
              Skip for now
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' ? (
              <span>Need an account? <button className="auth-link" onClick={() => { setMode('register'); setError(''); }}>Create one</button></span>
            ) : (
              <span>Already have an account? <button className="auth-link" onClick={() => { setMode('login'); setError(''); }}>Sign in</button></span>
            )}
          </div>

          <div className="auth-foot">
            <Link to="/tool" className="auth-foot-link">Skip → Go to tool without signing in</Link>
            <span className="auth-foot-sep">·</span>
            <span className="auth-foot-note">Free • No credit card • Save requires sign in</span>
          </div>
        </div>
      </div>
    </div>
  );
}
