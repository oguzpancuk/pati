import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchMe, getToken, login as apiLogin, Me, register as apiRegister, setToken } from './api';

interface AuthValue {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Avatar değişimi gibi Me döndüren çağrıların sonucunu yerinde uygular. */
  applyMe: (me: Me) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await fetchMe());
    } catch {
      setToken(null);
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token } = await apiLogin(email, password);
      setToken(token);
      await refresh();
    },
    [refresh]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const { token } = await apiRegister(name, email, password);
      setToken(token);
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, login, register, logout, refresh, applyMe: setMe }}>
      {children}
    </AuthContext.Provider>
  );
}
