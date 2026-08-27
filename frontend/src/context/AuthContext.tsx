import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as api from '../api';

interface AuthContextType {
  user: api.User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('agentflow_token');
    if (!token) { setUser(null); setLoading(false); return; }
    setLoading(true);
    try {
      const { user } = await api.getMe();
      setUser(user);
    } catch {
      localStorage.removeItem('agentflow_token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    const onCallback = () => refreshUser();
    window.addEventListener('auth-callback', onCallback);
    window.addEventListener('storage', onCallback);
    return () => {
      window.removeEventListener('auth-callback', onCallback);
      window.removeEventListener('storage', onCallback);
    };
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await api.login(email, password);
    setUser(user);
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const { user } = await api.register(username, email, password);
    setUser(user);
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
