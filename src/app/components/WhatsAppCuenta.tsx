import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../AuthContext';
import { userMayAccessDispositivo } from '../modules/usuario';
import { imeisDuplicados } from '../modules/administracion/asignacionEquipo';
import { fetchUltimoEstadoDispositivos } from '../api/termoking';
import { deviceRowKey } from '../modules/correo/alertEngine';
import type { DispositivoUltimoEstado } from '../types';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const BASE = import.meta.env.VITE_CORREO_API_BASE ?? '/reefer/api/correo';

type Contacto = {
  telefono: string;
  alertasHabilitadas: boolean;
  alertasPausadas: boolean;
  pruebaRespuestas: number;
  pruebaRequeridas: number;
};

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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/whatsapp${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || body.ok === false) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

function nacionalDe(numero: string) {
  const digits = numero.replace(/\D/g, '');
  return digits.startsWith('51') ? digits.slice(2) : digits;
}

export function WhatsAppCuenta() {
  const { user, applyUser } = useAuth();
  const [nacional, setNacional] = useState(nacionalDe(user?.whatsappNumero ?? ''));
  const [contacto, setContacto] = useState<Contacto | null>(null);
  const [silencios, setSilencios] = useState<string[]>([]);
  const [equipos, setEquipos] = useState<DispositivoUltimoEstado[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api<{ data: { numero: string; contacto: Contacto | null; silencios: string[] } }>('/mio')
      .then((body) => {
        setNacional(nacionalDe(body.data.numero || ''));
        setContacto(body.data.contacto);
        setSilencios(body.data.silencios ?? []);
      })
      .catch(() => {});
    fetchUltimoEstadoDispositivos()
      .then((r) => setEquipos((r.data.dispositivos ?? []).filter((d) => d.estado_conexion !== 'historial')))
      .catch(() => {});
  }, []);

  const mios = useMemo(() => {
    const repetidos = imeisDuplicados(equipos);
    return equipos.filter((d) => userMayAccessDispositivo(user, d, repetidos)).slice(0, 80);
  }, [equipos, user]);

  async function guardar() {
    setGuardando(true);
    try {
      const numero = nacional.replace(/\D/g, '');
      const body = await api<{ data: { numero: string; contacto: Contacto | null } }>('/mio', {
        method: 'POST',
        body: JSON.stringify({ numero: numero ? `51${numero}` : '' }),
      });
      setContacto(body.data.contacto);
      if (user) applyUser({ ...user, whatsappNumero: body.data.numero, password: '' });
      toast.success(numero ? 'Número de WhatsApp guardado' : 'Número de WhatsApp quitado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  }

  async function probar() {
    try {
      await api('/mio/prueba', { method: 'POST' });
      toast.success('Prueba enviada. Responda OK, ESTADO y AYUDA en WhatsApp.');
      const body = await api<{ data: { contacto: Contacto | null } }>('/mio');
      setContacto(body.data.contacto);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar la prueba');
    }
  }

  async function pausar(pausadas: boolean) {
    try {
      const body = await api<{ data: Contacto }>('/mio/pausa', {
        method: 'POST',
        body: JSON.stringify({ pausadas }),
      });
      setContacto(body.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar');
    }
  }

  async function silenciar(rowKey: string, silenciado: boolean) {
    try {
      const body = await api<{ data: string[] }>('/mio/silencio', {
        method: 'PUT',
        body: JSON.stringify({ rowKey, silenciado }),
      });
      setSilencios(body.data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cambiar el equipo');
    }
  }

  const estado = !contacto
    ? 'Sin número'
    : contacto.alertasHabilitadas
      ? contacto.alertasPausadas
        ? 'Aprobado, alertas pausadas'
        : 'Aprobado para alertas'
      : `Prueba pendiente ${contacto.pruebaRespuestas}/${contacto.pruebaRequeridas}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">WhatsApp de alertas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          El prefijo 51 queda fijo. Guarde su número y haga la prueba de vinculación. Después llegan
          alertas de todos los equipos de su cuenta, salvo los que desactive.
        </p>
        <div className="flex max-w-sm">
          <span className="inline-flex items-center rounded-l-md border border-r-0 px-3 text-sm">+51</span>
          <input
            className="h-9 flex-1 rounded-r-md border bg-background px-3 text-sm"
            inputMode="numeric"
            placeholder="987654321"
            value={nacional}
            onChange={(e) => setNacional(e.target.value.replace(/\D/g, '').slice(0, 9))}
          />
        </div>
        <p className="text-sm">{estado}</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={guardando} onClick={guardar}>
            Guardar número
          </Button>
          <Button variant="outline" disabled={!contacto} onClick={probar}>
            Prueba de vinculación
          </Button>
          {contacto?.alertasHabilitadas && (
            <Button variant="outline" onClick={() => pausar(!contacto.alertasPausadas)}>
              {contacto.alertasPausadas ? 'Reanudar todos' : 'Pausar todos los equipos'}
            </Button>
          )}
        </div>
        {contacto?.alertasHabilitadas && mios.length > 0 && (
          <div className="max-h-52 overflow-auto rounded border">
            {mios.map((d) => {
              const key = deviceRowKey(d);
              const off = silencios.includes(key);
              return (
                <label key={key} className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-sm last:border-0">
                  <span>
                    {d.codigo} · {d.imei}
                  </span>
                  <input type="checkbox" checked={!off} onChange={() => silenciar(key, !off)} />
                </label>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
