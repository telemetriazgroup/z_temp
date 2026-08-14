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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import zGif from '../../assets/z.gif';
import { storePreloadedOverview } from '../lib/dashboardPreload';

/** 3 pasos × 1 s = 3 s de splash aprovechados para precargar flota. */
const STEP_MS = 1000;
const SPLASH_MIN_MS = 3000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function welcomeName(user: User): string {
  const fromParts = [user.nombres, user.apellidos].filter(Boolean).join(' ').trim();
  return (
    user.displayName?.trim() ||
    fromParts ||
    user.username
  );
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [splashUser, setSplashUser] = useState<User | null>(null);
  const [splashStep, setSplashStep] = useState(0);
  const { login } = useAuth();
  const { hydrateFromDispositivos, ensureFleet } = useDispositivosFleet();
  const navigate = useNavigate();

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
      // fallback a telemetría directa
    }
    try {
      await ensureFleet({ force: true });
    } catch {
      // Inicio volverá a cargar si hace falta
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
      // Arranca carga de dispositivos en paralelo con los 3 s del splash
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 dark:from-slate-950 dark:to-slate-900 relative">
      <Card className="w-full max-w-md mx-4 relative z-0">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img
              src={logoSrc}
              alt="ZTRACK"
              className="h-16 w-auto max-w-full object-contain"
            />
          </div>
          <CardTitle className="text-2xl">Iniciar Sesión</CardTitle>
          <CardDescription>
            Plataforma de Monitoreo de Temperaturas
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              />
            </div>
            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          role="status"
          aria-live="polite"
          aria-label={splashMessages[splashStep] ?? 'Cargando'}
        >
          {/* Blanco semitransparente cubriendo todo el contenido */}
          <div className="absolute inset-0 bg-white/75 dark:bg-white/70" />
          <div className="relative z-10 flex flex-col items-center gap-4 px-6">
            <img
              src={zGif}
              alt=""
              className="h-28 w-auto max-h-32 object-contain pointer-events-none select-none"
            />
            <p className="text-center text-sm sm:text-base font-medium text-slate-700 min-h-[1.5rem]">
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
