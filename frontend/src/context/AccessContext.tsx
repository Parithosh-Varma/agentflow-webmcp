import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import * as api from '../api';

interface AccessContextType {
  hasAccess: boolean | null; // null = loading
  loading: boolean;
  verify: (code: string) => Promise<void>;
  revoke: () => void;
  refresh: () => Promise<void>;
}

const AccessContext = createContext<AccessContextType | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = api.getAccessToken();
    if (!token) {
      setHasAccess(false);
      setLoading(false);
      return;
    }
    try {
      const ok = await api.checkAccess();
      setHasAccess(ok);
      if (!ok) api.clearAccessToken();
    } catch {
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onCallback = () => refresh();
    window.addEventListener('auth-callback', onCallback);
    window.addEventListener('storage', onCallback);
    return () => {
      window.removeEventListener('auth-callback', onCallback);
      window.removeEventListener('storage', onCallback);
    };
  }, [refresh]);

  const verify = useCallback(async (code: string) => {
    await api.verifyAccessCode(code);
    setHasAccess(true);
  }, []);

  const revoke = useCallback(() => {
    api.clearAccessToken();
    setHasAccess(false);
  }, []);

  return (
    <AccessContext.Provider value={{ hasAccess, loading, verify, revoke, refresh }}>
      {children}
    </AccessContext.Provider>
  );
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error('useAccess must be used within AccessProvider');
  return ctx;
}
