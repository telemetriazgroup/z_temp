import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { userHasFullDeviceAccess, userIsSuperAdmin } from '../modules/usuario';
import {
  deleteReporteProgramado,
  enviarReporteProgramado,
  fetchReportesProgramados,
  saveReporteProgramado,
  type ReporteProgramado,
} from '../modules/correo/correoServerApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const PERIODOS = [6, 8, 12, 24] as const;

function fmt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const empty = {
  nombre: '',
  cliente: '',
  emails: '',
  periodoHoras: '24' as string,
  horaEnvio: '8',
  minutoEnvio: '0',
  alcance: 'completa' as 'completa' | 'asignada',
};

export function ReportesProgramadosPanel() {
  const { user } = useAuth();
  const full = userIsSuperAdmin(user) || userHasFullDeviceAccess(user);
  const [rows, setRows] = useState<ReporteProgramado[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const opts = { username: user?.username, superUser: userIsSuperAdmin(user) };

  const load = useCallback(async () => {
    if (!user?.username) return;
    const data = await fetchReportesProgramados(opts);
    setRows(data);
  }, [user?.username, user?.superUser]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar'));
  }, [load]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      await saveReporteProgramado(
        {
          id: editing ?? undefined,
          nombre: form.nombre,
          cliente: form.cliente,
          emails: form.emails.split(/[,;\s]+/).filter(Boolean),
          periodoHoras: Number(form.periodoHoras) as ReporteProgramado['periodoHoras'],
          horaEnvio: Number(form.horaEnvio),
          minutoEnvio: Number(form.minutoEnvio),
          alcance: full ? form.alcance : 'asignada',
          enabled: true,
        },
        opts
      );
      setForm(empty);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async (id: string) => {
    setError(null);
    setInfo(null);
    try {
      const r = await enviarReporteProgramado(id, opts);
      setInfo(`Enviado: ${r.subject}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Reporte de comportamiento</CardTitle>
          <CardDescription>
            Aparte de las alertas por fuera de rango, fuera de línea o apagado. Se arma
            con las muestras que el sistema guarda cada 5 minutos. La hora de envío
            (GMT-5) abre la ventana de las últimas 6, 8, 12 o 24 horas y el correo sale
            a los destinatarios del cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label>Nombre</Label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Cierre diario IFF"
            />
          </div>
          <div className="grid gap-1">
            <Label>Cliente</Label>
            <Input
              value={form.cliente}
              onChange={(e) => setForm((f) => ({ ...f, cliente: e.target.value }))}
            />
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <Label>Correos</Label>
            <Input
              value={form.emails}
              onChange={(e) => setForm((f) => ({ ...f, emails: e.target.value }))}
              placeholder="cliente@empresa.com, otro@empresa.com"
            />
          </div>
          <div className="grid gap-1">
            <Label>Cada</Label>
            <Select
              value={form.periodoHoras}
              onValueChange={(v) => setForm((f) => ({ ...f, periodoHoras: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODOS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {h} horas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label>Hora de envío</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={form.horaEnvio}
                onChange={(e) => setForm((f) => ({ ...f, horaEnvio: e.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <Label>Minuto</Label>
              <Input
                type="number"
                min={0}
                max={59}
                value={form.minutoEnvio}
                onChange={(e) => setForm((f) => ({ ...f, minutoEnvio: e.target.value }))}
              />
            </div>
          </div>
          {full && (
            <div className="grid gap-1">
              <Label>Alcance</Label>
              <Select
                value={form.alcance}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, alcance: v as 'completa' | 'asignada' }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completa">Flota completa</SelectItem>
                  <SelectItem value="asignada">Solo la flota de esta cuenta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-end gap-2">
            <Button onClick={() => void submit()} disabled={saving}>
              {editing ? 'Actualizar reporte' : 'Programar'}
            </Button>
            {editing && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setForm(empty);
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
          {info && <p className="text-sm text-emerald-700 sm:col-span-2">{info}</p>}
        </CardContent>
      </Card>

      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex flex-wrap items-center gap-2">
              {row.nombre}
              <Badge variant="secondary">cada {row.periodoHoras} h</Badge>
              <Badge variant="outline">
                {String(row.horaEnvio).padStart(2, '0')}:{String(row.minutoEnvio).padStart(2, '0')} GMT-5
              </Badge>
              {row.alcance === 'completa' && <Badge>Flota completa</Badge>}
            </CardTitle>
            <CardDescription>
              {row.cliente ? `${row.cliente} · ` : ''}
              {row.emails.join(', ')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              Próximo: {fmt(row.proximosEnvios?.[0])}
              {row.lastSentAt ? ` · último envío ${fmt(row.lastSentAt)}` : ''}
            </span>
            {row.lastError && <span className="text-destructive">{row.lastError}</span>}
            <Button size="sm" variant="outline" onClick={() => void sendNow(row.id)}>
              Enviar ahora
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(row.id);
                setForm({
                  nombre: row.nombre,
                  cliente: row.cliente,
                  emails: row.emails.join(', '),
                  periodoHoras: String(row.periodoHoras),
                  horaEnvio: String(row.horaEnvio),
                  minutoEnvio: String(row.minutoEnvio),
                  alcance: row.alcance,
                });
              }}
            >
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void deleteReporteProgramado(row.id, opts).then(load).catch((e) =>
                  setError(e instanceof Error ? e.message : 'No se pudo eliminar')
                )
              }
            >
              Eliminar
            </Button>
          </CardContent>
        </Card>
      ))}
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay reportes programados.</p>
      )}
    </div>
  );
}
