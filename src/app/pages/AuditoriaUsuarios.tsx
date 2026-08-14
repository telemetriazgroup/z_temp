import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../AuthContext';
import { fetchAuditLog, userCanAccessAudit } from '../modules/usuario';
import type { AuditLogEntry } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { History, RefreshCw } from 'lucide-react';

export default function AuditoriaUsuarios() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState('');

  const load = useCallback(async () => {
    if (!user || !userCanAccessAudit(user)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAuditLog(user.username, {
        limit: 200,
        actorUsername: actorFilter.trim() || undefined,
      });
      setRows(result.data);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar auditoría');
    } finally {
      setLoading(false);
    }
  }, [user, actorFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!userCanAccessAudit(user)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <History className="h-8 w-8" />
            Auditoría de usuarios
          </h1>
          <p className="text-muted-foreground mt-1">
            Cambios de cuentas, perfiles, telemetría vista y acciones del módulo. Solo
            superadmin.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
          <CardDescription>
            {total} eventos · mostrando {rows.length}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Usuario actor</label>
            <Input
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="ej. jefedesarrollo"
              className="w-56"
            />
          </div>
          <Button type="button" onClick={() => void load()}>
            Buscar
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Resumen</TableHead>
                <TableHead>Objetivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(r.at).toLocaleString('es-PE')}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{r.actorUsername}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.module}</TableCell>
                  <TableCell className="text-sm max-w-[320px]">{r.summary}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.targetUsername ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    Sin eventos registrados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
