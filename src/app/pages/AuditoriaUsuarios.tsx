import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../AuthContext';
import { fetchAuditLog, userCanAccessAudit } from '../modules/usuario';
import { AUDIT_ACTIONS, AUDIT_MODULES } from '../modules/usuario/auditActions';
import type { AuditLogEntry } from '../types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { History, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

const ACTION_OPTIONS = [
  { value: 'all', label: 'Todas las acciones' },
  ...Object.values(AUDIT_ACTIONS).map((a) => ({ value: a, label: a })),
];

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AuditoriaUsuarios() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState('');
  const [qFilter, setQFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [fromFilter, setFromFilter] = useState(() => daysAgoYmd(7));
  const [toFilter, setToFilter] = useState(() => todayYmd());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !userCanAccessAudit(user)) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAuditLog(user.username, {
        limit: 300,
        actorUsername: actorFilter.trim() || undefined,
        action: actionFilter !== 'all' ? actionFilter : undefined,
        module: moduleFilter !== 'all' ? moduleFilter : undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
        q: qFilter.trim() || undefined,
      });
      setRows(result.data);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar auditoría');
    } finally {
      setLoading(false);
    }
  }, [user, actorFilter, actionFilter, moduleFilter, fromFilter, toFilter, qFilter]);

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
            Trazabilidad de login, equipos vistos, descargas, altas de usuarios y
            cambios en la plataforma. Solo superadmin.
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
            <Label className="text-xs text-muted-foreground">Desde</Label>
            <Input
              type="date"
              value={fromFilter}
              onChange={(e) => setFromFilter(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Hasta</Label>
            <Input
              type="date"
              value={toFilter}
              onChange={(e) => setToFilter(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Usuario actor</Label>
            <Input
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              placeholder="ej. jefedesarrollo"
              className="w-44"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Acción</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Acción" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Módulo</Label>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {AUDIT_MODULES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Texto libre</Label>
            <Input
              value={qFilter}
              onChange={(e) => setQFilter(e.target.value)}
              placeholder="IMEI, resumen…"
              className="w-48"
            />
          </div>
          <Button type="button" onClick={() => void load()}>
            Buscar
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setActorFilter('');
              setQFilter('');
              setActionFilter('all');
              setModuleFilter('all');
              setFromFilter(daysAgoYmd(7));
              setToFilter(todayYmd());
            }}
          >
            Limpiar
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Fecha</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Resumen</TableHead>
                <TableHead>Objetivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const open = expandedId === r.id;
                return (
                  <React.Fragment key={r.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => setExpandedId(open ? null : r.id)}
                    >
                      <TableCell className="pr-0">
                        {open ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
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
                      <TableCell className="text-sm max-w-[360px]">{r.summary}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.targetUsername ?? r.targetId ?? '—'}
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/40">
                          <pre className="text-xs whitespace-pre-wrap break-all p-2 max-h-48 overflow-auto">
                            {JSON.stringify(
                              {
                                id: r.id,
                                at: r.at,
                                actorId: r.actorId,
                                targetUsername: r.targetUsername,
                                targetId: r.targetId,
                                detail: r.detail ?? null,
                              },
                              null,
                              2
                            )}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    Sin eventos en el rango seleccionado
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
