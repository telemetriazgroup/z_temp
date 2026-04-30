import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import type { User } from './types';
import { authenticate, ensureUserRegistry, getUsers } from './modules/usuario';

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  refreshUser: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('ztrack_user');
      if (!stored) return null;
      const parsed = JSON.parse(stored) as User;
      ensureUserRegistry();
      const fresh = getUsers().find((u) => u.id === parsed.id);
      return fresh ?? parsed;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    ensureUserRegistry();
  }, []);

  const login = (username: string, password: string): boolean => {
    const foundUser = authenticate(username, password);
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('ztrack_user', JSON.stringify(foundUser));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('ztrack_user');
  };

  const refreshUser = useCallback(() => {
    setUser((prev) => {
      if (prev == null) return null;
      const latest = getUsers().find((u) => u.id === prev.id);
      if (latest != null) {
        localStorage.setItem('ztrack_user', JSON.stringify(latest));
        return latest;
      }
      return prev;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, login, logout, refreshUser, isAuthenticated: !!user }}
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
