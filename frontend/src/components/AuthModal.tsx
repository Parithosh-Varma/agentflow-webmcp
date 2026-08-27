import { useState } from 'react';
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

  if (!open) return null;

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
      setEmail('');
      setUsername('');
      setPassword('');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    logout();
    onClose();
  };

  if (user) {
    return (
      <div className="auth-modal">
        <div className="auth-content">
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
      <div className="auth-content">
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
              minLength={6}
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
          >
            {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
