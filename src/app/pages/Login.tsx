import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../AuthContext';
import { useDispositivosFleet } from '../DispositivosFleetContext';
import { fetchDashboardOverview } from '../modules/correo/correoServerApi';
import { userIsSuperAdmin } from '../modules/usuario';
import type { DispositivoUltimoEstado, User } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import zGif from '../../assets/z-transparent.webp';
import loginHero from '../../assets/login-hero.png';
import { storePreloadedOverview } from '../lib/dashboardPreload';

const STEP_MS = 1000;
const SPLASH_MIN_MS = 3000;
const DISPLAY_TZ = 'America/Lima';
const DISPLAY_GMT = 'GMT-5';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function welcomeName(user: User): string {
  const fromParts = [user.nombres, user.apellidos].filter(Boolean).join(' ').trim();
  return user.displayName?.trim() || fromParts || user.username;
}

function formatLoginClock(now: Date): { dateLine: string; timeLine: string } {
  const dateLine = now.toLocaleDateString('es-PE', {
    timeZone: DISPLAY_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeLine = now.toLocaleTimeString('es-PE', {
    timeZone: DISPLAY_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return { dateLine, timeLine };
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [splashUser, setSplashUser] = useState<User | null>(null);
  const [splashStep, setSplashStep] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const { login } = useAuth();
  const { hydrateFromDispositivos, ensureFleet } = useDispositivosFleet();
  const navigate = useNavigate();

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const clock = useMemo(() => formatLoginClock(now), [now]);

  const splashMessages = useMemo(() => {
    const name = splashUser ? welcomeName(splashUser) : username.trim() || 'usuario';
    return [
      'Cargando plataforma…',
      'Analizando dispositivos…',
      `Bienvenido ${name}`,
    ];
  }, [splashUser, username]);

  useEffect(() => {
    if (!loading || splashUser == null) return;
    setSplashStep(0);
    const t1 = window.setTimeout(() => setSplashStep(1), STEP_MS);
    const t2 = window.setTimeout(() => setSplashStep(2), STEP_MS * 2);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [loading, splashUser]);

  const preloadApis = async (user: User) => {
    try {
      const overview = await fetchDashboardOverview({
        username: user.username,
        superUser: userIsSuperAdmin(user),
      });
      storePreloadedOverview(overview, user.username);
      const fleetDevices = overview.fleet?.dispositivos;
      if (Array.isArray(fleetDevices) && fleetDevices.length > 0) {
        hydrateFromDispositivos(fleetDevices as DispositivoUltimoEstado[], {
          zonaHoraria: overview.fleet?.zona_horaria,
        });
        return;
      }
    } catch {
      // fallback
    }
    try {
      await ensureFleet({ force: true });
    } catch {
      // Inicio cargará si hace falta
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setSplashStep(0);
    try {
      const loggedIn = await login(username, password);
      if (!loggedIn) {
        setError('Usuario o contraseña incorrectos');
        setLoading(false);
        setSplashUser(null);
        return;
      }

      setSplashUser(loggedIn);
      const preloadPromise = preloadApis(loggedIn);
      await Promise.all([wait(SPLASH_MIN_MS), preloadPromise]);
      navigate('/');
    } catch {
      setError('No se pudo conectar con el servidor de usuarios');
      setLoading(false);
      setSplashUser(null);
    }
  };

  const logoSrc = `${import.meta.env.BASE_URL}logo-ztrack.png`;
  const showSplash = loading && splashUser != null;

  return (
    <div className="min-h-screen relative bg-background text-foreground">
      <div className="min-h-screen grid lg:grid-cols-2">
        {/* Escritorio: imagen a la izquierda */}
        <aside className="relative hidden lg:block min-h-screen overflow-hidden bg-slate-900">
          <img
            src={loginHero}
            alt="ZGROUP — monitoreo Thermo King"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
            <p className="text-sm uppercase tracking-[0.2em] text-white/70">ZTRACK</p>
            <p className="mt-2 text-2xl font-semibold leading-snug max-w-md">
              Plataforma de monitoreo de temperaturas
            </p>
          </div>
        </aside>

        {/* Formulario (móvil: pantalla completa; escritorio: columna derecha) */}
        <main className="flex min-h-screen flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 xl:px-20 bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-950 dark:to-slate-900">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 text-center">
              <div className="mb-5 flex justify-center">
                <img
                  src={logoSrc}
                  alt="ZTRACK"
                  className="h-14 w-auto max-w-full object-contain"
                />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Acceso a la plataforma de telemetría
              </p>
              <div className="mt-4 rounded-lg border border-border/80 bg-card/80 px-3 py-2.5 text-center">
                <p className="text-xs text-muted-foreground capitalize">{clock.dateLine}</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">
                  {clock.timeLine}{' '}
                  <span className="text-muted-foreground font-normal">· {DISPLAY_GMT}</span>
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Usuario"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
              {error && <div className="text-sm text-red-600">{error}</div>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Ingresando…' : 'Ingresar'}
              </Button>
            </form>
          </div>
        </main>
      </div>

      {loading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          role="status"
          aria-live="polite"
          aria-label={splashMessages[splashStep] ?? 'Cargando'}
        >
          <div className="absolute inset-0 bg-white/80" />
          <div className="relative z-10 flex flex-col items-center gap-5 px-6">
            <img
              src={zGif}
              alt=""
              className="h-32 w-auto max-h-40 object-contain pointer-events-none select-none bg-transparent"
            />
            <p className="text-center text-lg sm:text-xl font-semibold text-slate-700 min-h-[1.75rem]">
              {showSplash
                ? splashMessages[Math.min(splashStep, splashMessages.length - 1)]
                : 'Cargando plataforma…'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
