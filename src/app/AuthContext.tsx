import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { SessionUser } from './types';
import {
  authenticate,
  ensureUserRegistry,
  getUserById,
  toSessionUser,
} from './modules/usuario';

type AuthContextValue = {
  user: SessionUser | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  reloadUser: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);

  const login = useCallback((username: string, password: string) => {
    ensureUserRegistry();
    const full = authenticate(username, password);
    if (full == null) return false;
    setUser(toSessionUser(full));
    return true;
  }, []);

  const logout = useCallback(() => setUser(null), []);

  const reloadUser = useCallback(() => {
    setUser((prev) => {
      if (prev == null) return null;
      const fresh = getUserById(prev.id);
      return fresh ? toSessionUser(fresh) : null;
    });
  }, []);

  const value = useMemo(
    () => ({ user, login, logout, reloadUser }),
    [user, login, logout, reloadUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx == null) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
