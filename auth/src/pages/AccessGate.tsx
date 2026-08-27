import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAccess } from '../context/AccessContext';
import { getAccessToken } from '../api';
import { TOOL_URL, buildToolCallbackUrl } from '../config';
import logo from '../assets/logo.png';
import './AccessGate.css';
import './AuthPage.css';

export function AccessGate() {
  const { verify, hasAccess } = useAccess();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || `${TOOL_URL}/tool`;
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const bridgeToTool = () => {
    const token = localStorage.getItem('agentflow_token');
    const accessToken = getAccessToken();
    window.location.href = buildToolCallbackUrl({ token, accessToken, redirect });
  };

  if (hasAccess) {
    setTimeout(bridgeToTool, 0);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the access code');
      return;
    }
    setLoading(true);
    try {
      await verify(trimmed);
      setTimeout(bridgeToTool, 250);
    } catch (err: any) {
      setError(err?.message || 'Invalid access code');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <header className="auth-page-header">
        <a href={TOOL_URL} className="auth-page-brand">
          <img src={logo} alt="AgentFlow" className="auth-page-logo" />
          <span>AGENTFLOW</span>
        </a>
        <span className="auth-page-tag">HUMAN × AGENT CANVAS · ACCESS GATE</span>
      </header>

      <div className="auth-page-container">
        <div className="auth-page-left">
          <div className="auth-page-kicker">Restricted access · auth Pages</div>
          <h1 className="auth-page-title">Enter access code<br />to open the tool</h1>
          <p className="auth-page-subtitle">
            This workspace is gated. Verification runs here on <code>agentflow-auth.pages.dev</code> via <code>POST /api/auth/verify-access</code> (Cloudflare Worker). On success we bridge you to the tool at <code>{new URL(TOOL_URL).host}</code> via <code>/auth/callback?accessToken=…</code>.
          </p>
          <ul className="auth-page-features">
            <li><span className="feat-dot" /> Code verified by Cloudflare Worker (HMAC-signed token)</li>
            <li><span className="feat-dot" /> Token stored as <code>agentflow_access_token</code> · 7-day expiry · bridged cross-origin</li>
            <li><span className="feat-dot" /> Invalid codes return <code>401 Invalid access code</code></li>
          </ul>
          <div className="auth-page-quote">
            <p>Hint: the code is a 64-char hex string (SHA-256). Paste it exactly — whitespace is trimmed.</p>
            <span>— Access gate · separate Cloudflare Pages deploy</span>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-card-top">
            <div className="auth-card-tabs" role="tablist">
              <span className="auth-tab active" aria-selected>Tool Access</span>
            </div>
            <a href={TOOL_URL} className="auth-card-close" aria-label="Back to tool">×</a>
          </div>

          <div className="auth-card-intro">
            <h2>Access required</h2>
            <p>Enter the 64-character access code to continue to <code>{new URL(TOOL_URL).host}/tool</code>.</p>
          </div>

          <div className="auth-feature-callout">
            <span className="auth-feature-icon">⬢</span>
            <div>
              <b>Cloudflare-routed verification</b>
              <span>
                Your code is sent to <code>POST /api/auth/verify-access</code> on the Worker. On success you receive a signed access token, then we bridge you to the tool.
              </span>
            </div>
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="cfg-row auth-row">
              <span>Access code</span>
              <input
                className="cfg-input auth-input"
                type="password"
                placeholder="•••• •••• •••• •••• •••• •••• •••• ••••"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoComplete="off"
                autoFocus
                spellCheck={false}
              />
              <span className="auth-pass-hint">64 hex chars · trimmed · bridged via /auth/callback</span>
            </label>

            <button className="btn-run auth-submit" type="submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Unlock tool → bridge to tool'}
            </button>
            <a href={TOOL_URL} className="btn-ghost auth-skip" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
              Back to tool origin
            </a>
          </form>

          <div className="auth-foot">
            <span className="auth-foot-note">Verified via Worker · <code>/api/auth/verify-access</code> + <code>/api/auth/check-access</code> · separate Pages: <code>agentflow-auth</code></span>
          </div>
        </div>
      </div>
    </div>
  );
}
