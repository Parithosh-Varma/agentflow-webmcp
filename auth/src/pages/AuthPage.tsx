import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAccessToken } from '../api';
import { TOOL_URL, buildToolCallbackUrl } from '../config';
import logo from '../assets/logo.png';
import './AuthPage.css';

// Auth is a SEPARATE Cloudflare Pages (agentflow-auth.pages.dev).
// On success we bridge tokens cross-origin via TOOL_URL/auth/callback?token=&accessToken=
export function AuthPage() {
  const { user, login, register, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || `${TOOL_URL}/tool`;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const bridgeToTool = () => {
    const token = localStorage.getItem('agentflow_token');
    const accessToken = getAccessToken();
    // If we have tokens, go via callback so tool can store them cross-origin
    if (token || accessToken) {
      window.location.href = buildToolCallbackUrl({ token, accessToken, redirect });
    } else {
      window.location.href = redirect;
    }
  };

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
      // Give AuthContext a tick to persist token, then bridge
      setTimeout(bridgeToTool, 200);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  const handleSkip = () => {
    // Skip = go to tool anonymously (no token). Still via tool URL.
    window.location.href = redirect.includes('/tool') ? redirect : `${TOOL_URL}/tool`;
  };

  // Authenticated view — account management with bridge to tool
  if (user) {
    return (
      <div className="auth-page">
        <header className="auth-page-header">
          <a href={TOOL_URL} className="auth-page-brand">
            <img src={logo} alt="AgentFlow" className="auth-page-logo" />
            <span>AGENTFLOW</span>
          </a>
          <a href={`${TOOL_URL}/tool`} className="auth-page-back">← Back to tool</a>
        </header>

        <div className="auth-page-container">
          <div className="auth-page-left">
            <div className="auth-page-kicker">Account · agentflow-auth.pages.dev</div>
            <h1 className="auth-page-title">You’re signed in</h1>
            <p className="auth-page-subtitle">Auth runs on a <b>separate Cloudflare Pages</b> (<code>agentflow-auth</code>) from the tool (<code>agentflow-hackathon</code>). Your token is bridged to the tool via <code>/auth/callback</code>.</p>
            <ul className="auth-page-features">
              <li><span className="feat-dot" /> Saved workflows persist across devices</li>
              <li><span className="feat-dot" /> Separate origin · isolated deploy · shared Worker API</li>
              <li><span className="feat-dot" /> Token bridged cross-origin via URL → tool stores in its own localStorage</li>
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
              <p className="auth-card-hint">Signed in as <b>{user.username}</b>. Continue to the tool — your session will be handed off.</p>
            </div>

            <div className="auth-card-actions">
              <button className="btn-run auth-card-primary" onClick={bridgeToTool}>Go to Tool → bridge session</button>
              <button className="btn-ghost auth-card-secondary" onClick={handleLogout}>Sign out</button>
            </div>
            <div style={{ padding: '0 22px 18px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', textAlign: 'center' }}>
              Auth: <code>{window.location.host}</code> → Tool: <code>{new URL(TOOL_URL).host}</code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <header className="auth-page-header">
        <a href={TOOL_URL} className="auth-page-brand">
          <img src={logo} alt="AgentFlow" className="auth-page-logo" />
          <span>AGENTFLOW</span>
        </a>
        <span className="auth-page-tag">HUMAN × AGENT CANVAS · AUTH PAGES</span>
      </header>

      <div className="auth-page-container">
        <div className="auth-page-left">
          <div className="auth-page-kicker">Welcome back · separate Cloudflare Pages</div>
          <h1 className="auth-page-title">
            {mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace'}
          </h1>
          <p className="auth-page-subtitle">
            Auth lives on <code>agentflow-auth.pages.dev</code> — a <b>separate Cloudflare Pages</b> from the tool. Sign in here; we’ll bridge your session to <code>agentflow-hackathon.pages.dev</code> via <code>/auth/callback</code>.
          </p>

          <ul className="auth-page-features">
            <li><span className="feat-dot" /> Drag, connect, and run — no code to start</li>
            <li><span className="feat-dot" /> Agent builds via <code>add_node</code> <code>connect_nodes</code> <code>run</code></li>
            <li><span className="feat-dot" /> <b>Sign in to save your workflow in the database</b> — persists across devices</li>
          </ul>

          <div className="auth-page-quote">
            <p>After success you’ll be redirected to the tool: <code>{TOOL_URL}/auth/callback?token=…</code> — tool stores the token in its own localStorage (cross-origin bridge).</p>
            <span>— Separate deploys · shared Worker API</span>
          </div>
        </div>

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
            <a href={`${TOOL_URL}/tool`} className="auth-card-close" aria-label="Back to tool">×</a>
          </div>

          <div className="auth-card-intro">
            <h2>{mode === 'login' ? 'Welcome back' : 'Join AgentFlow'}</h2>
            <p>{mode === 'login' ? 'Use your email and password to continue.' : 'Create an account to save workflows and templates.'}</p>
          </div>

          <div className="auth-feature-callout">
            <span className="auth-feature-icon">◎</span>
            <div>
              <b>Save your workflow in the database</b>
              <span>Sign in here on the auth Pages. We’ll hand you off to the tool with a signed session — separate deploys, shared API.</span>
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
              <span className="auth-pass-hint">At least 6 characters — stored via Worker D1 · HS256 JWT</span>
            </label>

            <button className="btn-run auth-submit" type="submit" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In → bridge to tool' : 'Create Account → bridge to tool'}
            </button>
            <button type="button" className="btn-ghost auth-skip" onClick={handleSkip}>
              Skip for now → go to tool anonymously
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
            <a href={`${TOOL_URL}/tool`} className="auth-foot-link">Skip → Go to tool without signing in</a>
            <span className="auth-foot-sep">·</span>
            <span className="auth-foot-note">Auth: {new URL(TOOL_URL).host} tool separate from auth host</span>
          </div>
          <div style={{ textAlign: 'center', padding: '0 22px 14px', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--faint)' }}>
            Deploy: <code>npx wrangler pages deploy dist --project-name=agentflow-auth</code>
          </div>
        </div>
      </div>
    </div>
  );
}
