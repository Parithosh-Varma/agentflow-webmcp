import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID } from '../config';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (opts: any) => void;
          renderButton: (el: HTMLElement, opts: any) => void;
          prompt: () => void;
          disableAutoSelect?: () => void;
        };
      };
    };
  }
}

interface Props {
  onSuccess: (idToken: string) => void;
  onError?: (msg: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  label?: string;
  disabled?: boolean;
}

function loadGsiScript(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (document.querySelector('script[data-gsi]')) return Promise.resolve();
  // already loaded?
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.dataset.gsi = 'true';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google GSI'));
    document.head.appendChild(s);
  });
}

export function GoogleAuthButton({ onSuccess, onError, text = 'continue_with', label = 'Continue with Google', disabled }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryN, setRetryN] = useState(0);
  // Callbacks via ref: parent inline closures change every render, and
  // listing them in effect deps re-initializes GSI in a loop.
  const cbRef = useRef({ onSuccess, onError });
  cbRef.current = { onSuccess, onError };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadGsiScript()
      .then(() => {
        if (cancelled) return;
        if (!window.google?.accounts?.id) throw new Error('Google GSI not available');
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp: any) => {
            const cred = resp?.credential;
            if (cred) cbRef.current.onSuccess(cred);
            else cbRef.current.onError?.('No credential from Google');
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        setReady(true);
      })
      .catch((e: any) => { if (!cancelled) setLoadError(e?.message || String(e)); });

    return () => { cancelled = true; };
  }, [retryN]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !ready || !divRef.current || !window.google?.accounts?.id) return;
    divRef.current.innerHTML = '';
    try {
      window.google.accounts.id.renderButton(divRef.current, {
        theme: 'outline',
        size: 'large',
        text,
        shape: 'rectangular',
        width: Math.min(360, divRef.current.clientWidth || 320),
        logo_alignment: 'left',
      });
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to render Google button');
    }
  }, [ready, text]);

  // Hooks stay above all returns (GOOGLE_CLIENT_ID is a build-time constant
  // so the branch never flips, but conditional hooks break lint/future edits).
  // No client id → disabled fallback with setup guidance (not a dead button).
  if (!GOOGLE_CLIENT_ID) {
    return (
      <button
        type="button"
        disabled
        title="Set VITE_GOOGLE_CLIENT_ID (or GOOGLE_CLIENT_ID) in .env / Cloudflare Pages env to enable Google Sign-In"
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px dashed var(--border)',
          background: 'var(--bg-raised)',
          color: 'var(--faint)',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          cursor: 'not-allowed',
          opacity: 0.85,
        }}
      >
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', color: '#4285F4', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, border: '1px solid #dadce0' }}>G</span>
        {label} — configure VITE_GOOGLE_CLIENT_ID (or GOOGLE_CLIENT_ID)
      </button>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--red-soft)', border: '1px solid var(--fault)', color: 'var(--fault)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
        <span>Google Sign-In error: {loadError}</span>{' '}
        <button type="button" onClick={() => { setLoadError(null); setReady(false); setRetryN((n) => n + 1); }} style={{ marginLeft: 8, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  // Wrap rendered button with disabled overlay if needed
  return (
    <div style={{ position: 'relative', width: '100%', opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <div ref={divRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }} />
      {!ready && (
        <div style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-raised)', color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontSize: 10, textAlign: 'center' }}>
          Loading Google Sign-In…
        </div>
      )}
    </div>
  );
}
