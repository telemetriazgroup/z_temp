import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import type { User } from './types';
import {
  authenticate,
  ensureUserRegistry,
  getUserById,
  migrateLegacyUsersIfNeeded,
} from './modules/usuario';
import { ensureAlarmCatalog } from './modules/alarma';

const SESSION_KEY = 'ztrack_user';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<User | null>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
  authReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredSession(): User | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as User;
  } catch {
    return null;
  }
}

function persistSession(user: User | null): void {
  if (user == null) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredSession());
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await migrateLegacyUsersIfNeeded();
      await ensureUserRegistry();
      ensureAlarmCatalog();

      const stored = readStoredSession();
      if (stored?.id) {
        try {
          const fresh = await getUserById(stored.id);
          if (!cancelled && fresh != null) {
            setUser(fresh);
            persistSession(fresh);
          }
        } catch {
          // mantener sesión almacenada si el servidor no responde
        }
      }
      if (!cancelled) setAuthReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<User | null> => {
    const foundUser = await authenticate(username, password);
    if (foundUser) {
      setUser(foundUser);
      persistSession(foundUser);
      return foundUser;
    }
    return null;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    persistSession(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const stored = readStoredSession();
    if (stored?.id == null) return;
    try {
      const latest = await getUserById(stored.id);
      if (latest != null) {
        setUser(latest);
        persistSession(latest);
      }
    } catch {
      // sin cambios
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, login, logout, refreshUser, isAuthenticated: !!user, authReady }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
