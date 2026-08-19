import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, CurrentUser, getToken, setToken } from './api';

interface AuthValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api.get<CurrentUser>('/users/me');
      // The panel is admin-only. The role check also happens server-side
      // (every /api/admin request passes through requireAdmin); this one only
      // exists to show the user a meaningful message.
      if (me.role !== 'admin') {
        setToken(null);
        setUser(null);
      } else {
        setUser(me);
      }
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: CurrentUser }>('/auth/login', {
      email,
      password,
    });
    if (res.user.role !== 'admin') {
      throw new ApiError(403, 'Bu hesabın yönetici yetkisi yok.');
    }
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
