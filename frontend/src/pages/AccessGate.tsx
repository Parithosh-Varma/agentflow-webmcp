import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccess } from '../context/AccessContext';
import logo from '../assets/logo.png';
import './AccessGate.css';

export function AccessGate() {
  const { verify, hasAccess } = useAccess();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as any)?.from?.pathname || '/tool';

  if (hasAccess) {
    // already verified — redirect to tool
    // use effect-like immediate navigate
    setTimeout(() => navigate(from, { replace: true }), 0);
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
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Invalid access code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <header className="auth-page-header">
        <div className="auth-page-brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="AgentFlow" className="auth-page-logo" />
          <span>AGENTFLOW</span>
        </div>
        <span className="auth-page-tag">HUMAN × AGENT CANVAS — TOOL ONLY</span>
      </header>

      <div className="auth-page-container">
        <div className="auth-page-left">
          <div className="auth-page-kicker">Restricted access</div>
          <h1 className="auth-page-title">Enter access code<br />to open the tool</h1>
          <p className="auth-page-subtitle">
            This workspace is gated. Only clients who present the valid access code can open the canvas
            and call WebMCP tools. Verification is routed via <code>Cloudflare</code> auth
            <code>POST /api/auth/verify-access</code> — the code is never checked client-side alone.
          </p>
          <ul className="auth-page-features">
            <li><span className="feat-dot" /> Code verified by Cloudflare Worker (HMAC-signed token)</li>
            <li><span className="feat-dot" /> Token stored as <code>agentflow_access_token</code> · 7-day expiry</li>
            <li><span className="feat-dot" /> Invalid codes return <code>401 Invalid access code</code></li>
          </ul>
          <div className="auth-page-quote">
            <p>Hint: the code is a 64-char hex string (SHA-256). Paste it exactly — whitespace is trimmed.</p>
            <span>— Access gate · Cloudflare auth</span>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-card-top">
            <div className="auth-card-tabs" role="tablist">
              <span className="auth-tab active" aria-selected>Tool Access</span>
            </div>
            <span className="auth-card-close" aria-hidden style={{ opacity: 0.6, cursor: 'default' }}>●</span>
          </div>

          <div className="auth-card-intro">
            <h2>Access required</h2>
            <p>Enter the 64-character access code to continue to <code>/tool</code>.</p>
          </div>

          <div className="auth-feature-callout">
            <span className="auth-feature-icon">⬢</span>
            <div>
              <b>Cloudflare-routed verification</b>
              <span>
                Your code is sent to <code>POST /api/auth/verify-access</code> and validated against the
                gated hash on the Worker. On success you receive a signed access token.
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
              <span className="auth-pass-hint">64 hex chars · trimmed · case-sensitive</span>
            </label>

            <button className="btn-run auth-submit" type="submit" disabled={loading}>
              {loading ? 'Verifying…' : 'Unlock tool →'}
            </button>
            <div className="auth-foot-note" style={{ textAlign: 'center', marginTop: 8 }}>
              Frontend hosts only the tool — no landing page. Access via Cloudflare <code>/api/auth/verify-access</code>
            </div>
          </form>

          <div className="auth-foot">
            <span className="auth-foot-note">Verified via Cloudflare Worker · <code>/api/auth/verify-access</code> + <code>/api/auth/check-access</code></span>
          </div>
        </div>
      </div>
    </div>
  );
}
