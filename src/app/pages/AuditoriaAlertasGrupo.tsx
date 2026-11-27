import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';

interface FilaAlerta {
  jid: string;
  grupo: string;
  rowKey: string;
  imei: string;
  codigo: string;
  nombre: string;
  estado: string;
  titulo: string;
  horasTexto: string;
  umbral: number | null;
  enviar: boolean;
  pronto: boolean;
  motivo: string;
  criterio: string;
  ultimoDato: string | null;
}

interface Auditoria {
  filas: FilaAlerta[];
  telefonoDesarrollo: string | null;
  avisoInterno: boolean;
}

function headers(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const raw = localStorage.getItem('ztrack_user');
    if (!raw) return h;
    const user = JSON.parse(raw) as { username?: string; superUser?: boolean; category?: string };
    if (user.username?.trim()) h['X-ZTrack-User'] = user.username.trim();
    if (user.superUser === true || user.category === 'superadmin') h['X-ZTrack-Super-User'] = 'true';
  } catch {
    /* sin sesión */
  }
  return h;
}

function momento(iso: string | null): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hourCycle: 'h23',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(fecha);
}

export function AuditoriaAlertasGrupo() {
  const [data, setData] = useState<Auditoria | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState('');

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/reefer/api/correo/whatsapp/alertas-auditoria', { headers: headers() });
      const body = await res.json();
      if (!res.ok || body.ok === false) throw new Error(body.error || `Error ${res.status}`);
      setData(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la auditoría');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function enviar(fila: FilaAlerta) {
    const ok = window.confirm(`Enviar ahora la alerta de ${fila.nombre} al grupo ${fila.grupo}?`);
    if (!ok) return;
    setEnviando(fila.rowKey);
    try {
      const res = await fetch('/reefer/api/correo/whatsapp/alertas-auditoria/enviar', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ jid: fila.jid, rowKey: fila.rowKey }),
      });
      const body = await res.json();
      if (!res.ok || body.ok === false) throw new Error(body.error || `Error ${res.status}`);
      toast.success(`Alerta enviada: ${body.data?.nombre || fila.nombre}`);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se envió');
    } finally {
      setEnviando('');
    }
  }

  const filas = data?.filas || [];

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="font-semibold">Decisión de alertas del grupo</h2>
          <p className="text-sm text-muted-foreground">
            Equipos con alerta automática activa. Aquí se ve el criterio, si ya corresponde avisar y si está pronto.
            El botón envía esa alerta al grupo si el asistente se demoró o si el superadmin lo considera pertinente.
          </p>
        </div>
        <Button variant="outline" onClick={() => void cargar()}>Actualizar</Button>
      </div>
      <p className="text-sm">
        {data?.avisoInterno
          ? `El aviso interno de cobertura inestable va al ${data.telefonoDesarrollo}.`
          : 'Todavía no hay un número interno. Defínalo en Configuración para que el equipo de desarrollo reciba la cobertura inestable.'}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {cargando && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!cargando && filas.length === 0 && (
        <p className="text-sm text-muted-foreground">Ningún grupo activo tiene equipos con alerta automática.</p>
      )}
      {filas.length > 0 && (
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 pr-3">Grupo</th>
                <th className="py-2 pr-3">Equipo</th>
                <th className="py-2 pr-3">Enlace</th>
                <th className="py-2 pr-3">Análisis</th>
                <th className="py-2 pr-3">Decisión</th>
                <th className="py-2">Envío</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={`${fila.jid}:${fila.rowKey}`} className="border-b align-top">
                  <td className="py-2 pr-3">{fila.grupo}</td>
                  <td className="py-2 pr-3">
                    <div>{fila.nombre}</div>
                    <div className="font-mono text-xs text-muted-foreground">{fila.imei}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="uppercase">{fila.estado}</div>
                    <div className="text-xs text-muted-foreground">{momento(fila.ultimoDato)}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div>{fila.titulo}{fila.umbral != null ? ` · ${fila.horasTexto} / ${fila.umbral} h` : ''}</div>
                    <div className="text-xs text-muted-foreground">{fila.criterio}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className={fila.enviar ? 'text-red-600' : fila.pronto ? 'text-amber-600' : ''}>
                      {fila.enviar ? 'Lista para enviar' : fila.pronto ? 'Pronto' : 'No envía ahora'}
                    </div>
                    <div className="text-xs text-muted-foreground">{fila.motivo}</div>
                  </td>
                  <td className="py-2">
                    <Button
                      variant="outline"
                      disabled={enviando === fila.rowKey || fila.titulo === 'Sin novedad'}
                      onClick={() => void enviar(fila)}
                    >
                      Enviar alerta
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
