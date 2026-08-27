import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

// Bridges cross-origin token from auth Pages (agentflow-auth.pages.dev) to tool Pages (agentflow-hackathon.pages.dev)
// Auth redirects here: /auth/callback?token=...&accessToken=...&redirect=...
// We store in this origin's localStorage then redirect to /tool (or provided redirect path without origin)
export function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const accessToken = searchParams.get('accessToken');
    const redirect = searchParams.get('redirect');

    if (token) {
      localStorage.setItem('agentflow_token', token);
    }
    if (accessToken) {
      localStorage.setItem('agentflow_access_token', accessToken);
    }

    // Resolve redirect — if it contains origin, strip to pathname+search
    let target = '/tool';
    if (redirect) {
      try {
        const url = new URL(redirect, window.location.origin);
        // Only allow same tool origin or path-only redirects
        target = url.pathname + url.search + url.hash;
        if (!target.startsWith('/')) target = '/tool';
      } catch {
        target = redirect.startsWith('/') ? redirect : '/tool';
      }
    } else if (token || accessToken) {
      target = '/tool';
    }

    // Small delay so storage settles before navigation triggers AccessContext refresh
    const t = setTimeout(() => {
      navigate(target, { replace: true });
      // Force reload for AccessProvider to re-check? Instead we can reload page to ensure fresh.
      // But navigate should trigger re-render; also fire custom event for AccessContext
      window.dispatchEvent(new Event('auth-callback'));
    }, 180);

    return () => clearTimeout(t);
  }, [searchParams, navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12, flexDirection: 'column', gap: 12 }}>
      <div>Bridging session from auth…</div>
      <div style={{ color: 'var(--dim)', fontSize: 11 }}>Storing token for {window.location.host}</div>
    </div>
  );
}
