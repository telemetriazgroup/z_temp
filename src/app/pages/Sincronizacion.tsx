import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { userIsSuperAdmin } from '../modules/usuario';
import {
  fetchDashboardSync,
  runDashboardSync,
  type DashboardSyncStatus,
} from '../modules/correo/correoServerApi';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { cn } from '../components/ui/utils';

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function Sincronizacion() {
  const { user } = useAuth();
  const isSuper = userIsSuperAdmin(user);
  const [status, setStatus] = useState<DashboardSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.username || !isSuper) return;
    setError(null);
    try {
      const data = await fetchDashboardSync({
        username: user.username,
        superUser: true,
      });
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la sincronización');
    } finally {
      setLoading(false);
    }
  }, [user?.username, isSuper]);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = async () => {
    if (!user?.username) return;
    setRunning(true);
    setError(null);
    try {
      await runDashboardSync({ username: user.username, superUser: true });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La sincronización no terminó');
    } finally {
      setRunning(false);
    }
  };

  if (!isSuper) return <Navigate to="/" replace />;

  const minutes = Math.round((status?.intervalMs ?? 300000) / 60000);
  const links = status?.state?.detail?.links?.length
    ? status.state.detail.links
    : status?.links ?? [];
  const inProgress = status?.state?.ok == null && status?.state?.startedAt != null && status?.state?.finishedAt == null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Sincronización</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            El servidor consulta Túnel, StarCool y TermoKing cada {minutes} minutos y
            guarda cada muestra. El dashboard y el listado arman la vista con esa copia,
            sin esperar al enlace. El análisis de señal recorre esas muestras acumuladas.
            Si un equipo deja de venir en la API, se conserva con su último dato.
          </p>
        </div>
        <Button onClick={() => void runNow()} disabled={running || loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', running && 'animate-spin')} />
          {running ? 'Sincronizando…' : 'Sincronizar ahora'}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Equipos guardados</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {status?.counts.total ?? '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">En la última API</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums text-emerald-700">
            {status?.counts.presentes ?? '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ya no vienen en la API</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {status?.counts.ausentes ?? '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Última recolección</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">{formatWhen(status?.state?.finishedAt)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {inProgress ? 'En curso' : status?.state?.trigger ?? '—'}
              {status?.state?.ok === false ? ' · con error' : ''}
            </div>
          </CardContent>
        </Card>
      </div>

      {status?.state?.error && (
        <p className="text-sm text-amber-800">{status.state.error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Orígenes</CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {links.length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay una recolección.</p>
          )}
          {links.map((link) => {
            const latency = link.latencyMs ?? link.latency_ms;
            const count = link.deviceCount ?? link.device_count;
            const message = link.error ?? link.error_message;
            return (
              <div key={link.codigo} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{link.codigo}</span>
                  <Badge variant={link.ok ? 'secondary' : 'destructive'}>
                    {link.ok ? 'OK' : 'Sin respuesta'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {count != null ? `${count} equipos` : '—'}
                  {latency != null ? ` · ${latency} ms` : ''}
                </p>
                {link.checked_at && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatWhen(link.checked_at)}
                  </p>
                )}
                {!link.ok && message && (
                  <p className="text-xs text-red-700 mt-1 break-words">{message}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
