import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import type { User } from './types';
import {
  authenticate,
  ensureUserRegistry,
  getUserById,
  migrateLegacyUsersIfNeeded,
  postAuditEvent,
  userIsSuperAdmin,
} from './modules/usuario';
import { AUDIT_ACTIONS } from './modules/usuario/auditActions';
import { ensureAlarmCatalog } from './modules/alarma';
import {
  fetchGruposEquiposPublic,
  setGruposEquiposCache,
} from './modules/administracion';

const SESSION_KEY = 'ztrack_user';
const ACTOR_KEY = 'ztrack_actor';

function sinClave(user: User): User {
  return { ...user, password: '' };
}

async function hydrateGruposCache(username: string | undefined | null) {
  if (!username?.trim()) {
    setGruposEquiposCache([]);
    return;
  }
  try {
    const grupos = await fetchGruposEquiposPublic(username);
    setGruposEquiposCache(grupos);
  } catch {
    // sin grupos en cache: acceso solo por deviceAccess directo
  }
}

interface AuthContextType {
  user: User | null;
  /** Superusuario real mientras se ve otra cuenta. */
  impersonator: User | null;
  login: (username: string, password: string) => Promise<User | null>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  applyUser: (user: User) => void;
  enterAs: (target: User) => Promise<void>;
  exitImpersonation: () => Promise<void>;
  isAuthenticated: boolean;
  authReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredSession(): User | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as User;
    if (parsed != null && !Array.isArray(parsed.deviceAccess)) {
      parsed.deviceAccess =
        parsed.superUser === true || parsed.category === 'superadmin'
          ? ['all']
          : [];
    }
    if (parsed?.superUser === true && !parsed.category) {
      parsed.category = 'superadmin';
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistSession(user: User | null): void {
  if (user == null) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(sinClave(user)));
}

function readActor(): User | null {
  try {
    const stored = localStorage.getItem(ACTOR_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as User;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function persistActor(user: User | null): void {
  if (user == null) {
    localStorage.removeItem(ACTOR_KEY);
    return;
  }
  localStorage.setItem(ACTOR_KEY, JSON.stringify(sinClave(user)));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredSession());
  const [impersonator, setImpersonator] = useState<User | null>(() => readActor());
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await migrateLegacyUsersIfNeeded();
      await ensureUserRegistry();
      ensureAlarmCatalog();

      const actor = readActor();
      if (actor && !userIsSuperAdmin(actor)) {
        persistActor(null);
        if (!cancelled) setImpersonator(null);
      } else if (!cancelled) {
        setImpersonator(actor);
      }
      const stored = readStoredSession();
      if (!stored && actor && userIsSuperAdmin(actor)) {
        persistActor(null);
        if (!cancelled) {
          setImpersonator(null);
          setUser(actor);
          persistSession(actor);
        }
      }
      if (stored?.id) {
        try {
          const fresh = await getUserById(stored.id);
          if (!cancelled && fresh != null) {
            setUser(fresh);
            persistSession(fresh);
            await hydrateGruposCache(fresh.username);
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
      persistActor(null);
      setImpersonator(null);
      setUser(foundUser);
      persistSession(foundUser);
      await hydrateGruposCache(foundUser.username);
      return foundUser;
    }
    return null;
  }, []);

  const logout = useCallback(() => {
    const current = readStoredSession();
    const username = current?.username;
    // Limpiar sesión primero para que ProtectedRoute redirija de inmediato
    setUser(null);
    setImpersonator(null);
    persistSession(null);
    persistActor(null);
    setGruposEquiposCache([]);
    if (username) {
      void postAuditEvent(username, {
        action: AUDIT_ACTIONS.LOGOUT,
        module: 'auth',
        summary: `Cerró sesión (${username})`,
      });
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const stored = readStoredSession();
    if (stored?.id == null) return;
    try {
      const latest = await getUserById(stored.id);
      if (latest != null) {
        setUser(latest);
        persistSession(latest);
        await hydrateGruposCache(latest.username);
      }
    } catch {
      // sin cambios
    }
  }, []);

  const applyUser = useCallback((next: User) => {
    setUser(next);
    persistSession(next);
  }, []);

  const enterAs = useCallback(async (target: User) => {
    const actor = readActor() ?? readStoredSession();
    if (!actor || !userIsSuperAdmin(actor)) {
      throw new Error('Solo el superusuario puede entrar como otra cuenta');
    }
    if (!target?.id) throw new Error('Esa cuenta no existe');
    if (target.id === actor.id) {
      persistActor(null);
      setImpersonator(null);
      const propio = (await getUserById(actor.id)) ?? actor;
      setUser(propio);
      persistSession(propio);
      await hydrateGruposCache(propio.username);
      return;
    }
    const fresco = (await getUserById(target.id)) ?? target;
    if (!readActor()) persistActor(actor);
    setImpersonator(sinClave(actor));
    setUser(sinClave(fresco));
    persistSession(fresco);
    await hydrateGruposCache(fresco.username);
    void postAuditEvent(actor.username, {
      action: AUDIT_ACTIONS.IMPERSONATE,
      module: 'auth',
      summary: `${actor.username} entró como ${fresco.username} para soporte`,
      targetUsername: fresco.username,
      targetId: fresco.id,
    });
  }, []);

  const exitImpersonation = useCallback(async () => {
    const actor = readActor();
    if (!actor) return;
    const visto = readStoredSession();
    persistActor(null);
    setImpersonator(null);
    setUser(actor);
    persistSession(actor);
    await hydrateGruposCache(actor.username);
    void getUserById(actor.id).then((propio) => {
      if (propio == null || readActor()) return;
      setUser(propio);
      persistSession(propio);
    });
    void postAuditEvent(actor.username, {
      action: AUDIT_ACTIONS.IMPERSONATE_END,
      module: 'auth',
      summary: `${actor.username} salió de la cuenta ${visto?.username ?? ''}`.trim(),
      targetUsername: visto?.username,
      targetId: visto?.id,
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        impersonator,
        login,
        logout,
        refreshUser,
        applyUser,
        enterAs,
        exitImpersonation,
        isAuthenticated: !!user,
        authReady,
      }}
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
