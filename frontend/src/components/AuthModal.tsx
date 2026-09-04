import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AuthModal({ open, onClose }: Props) {
  const { user, login, register, logout } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Esc closes (previously there was no dismiss path except a successful
  // submit — no × button, no Esc — trapping the user in the modal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    // Normalize like AuthPage: trim, require fields, min-6 only on register
    // (backend login accepts min 1), generic login error to avoid enumeration.
    const cleanEmail = email.trim();
    const cleanUsername = username.trim();
    if (!cleanEmail || !password) {
      setError('Email and password are required.');
      return;
    }
    if (mode === 'register' && !cleanUsername) {
      setError('Username is required.');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(cleanEmail, password);
      } else {
        await register(cleanUsername, cleanEmail, password);
      }
      setEmail('');
      setUsername('');
      setPassword('');
      onClose();
    } catch (err: any) {
      if (mode === 'login') {
        setError('Invalid email or password.');
      } else {
        setError(err?.message || 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    onClose();
  };

  if (user) {
    return (
      <div className="auth-modal">
        <div className="auth-content" style={{ position: 'relative' }}>
          <button type="button" onClick={onClose} aria-label="Close account dialog" style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-soft)', background: 'var(--bg)', color: 'var(--dim)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>×</button>
          <div className="auth-title">Account</div>
          <div className="auth-user">
            <span className="auth-user-name">{user.username}</span>
            <span className="auth-user-email">{user.email}</span>
          </div>
          <button className="btn-ghost btn-small btn-danger" onClick={handleLogout} style={{ width: '100%' }}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-modal">
      <div className="auth-content" style={{ position: 'relative' }}>
        <button type="button" onClick={onClose} aria-label="Close sign in dialog" style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border-soft)', background: 'var(--bg)', color: 'var(--dim)', fontSize: 16, lineHeight: 1, cursor: 'pointer' }}>×</button>
        <div className="auth-title">{mode === 'login' ? 'Sign In' : 'Create Account'}</div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="cfg-row">
              <span>Username</span>
              <input
                className="cfg-input"
                type="text"
                placeholder="your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
                autoComplete="username"
              />
            </label>
          )}
          <label className="cfg-row">
            <span>Email</span>
            <input
              className="cfg-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              autoComplete="email"
            />
          </label>
          <label className="cfg-row">
            <span>Password</span>
            <input
              className="cfg-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={mode === 'register' ? 6 : undefined}
            />
          </label>

          <button
            className="btn-run"
            type="submit"
            disabled={loading}
            style={{ width: '100%', marginTop: 8 }}
          >
            {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-toggle">
          <button
            className="btn-ghost btn-small"
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            disabled={loading}
          >
            {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
