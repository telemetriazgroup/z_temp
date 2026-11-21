import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { Loader2, Search } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { displayNameForDevice, userIsSuperAdmin } from '../modules/usuario';
import { readDeviceLocalNames, refreshDeviceNamesFromServer } from '../lib/deviceLocalNames';
import { fetchEquiposInforme, type EquipoInforme } from '../modules/informe/informeApi';
import {
  borrarCampana,
  ajustarDiaCorrida,
  fetchCampanas,
  fetchCorrida,
  guardarCampana,
  lanzarCampana,
  type CampanaInforme,
  type CorridaCampana,
  type EquipoCampana,
} from '../modules/informe/campanasApi';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const SIN_ASIGNAR = 'SIN ASIGNAR';

function rowKeyOf(equipo: EquipoInforme): string {
  return equipo.codigo ? `${equipo.codigo}-${equipo.imei}` : equipo.imei;
}

function hoyLima(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const DIAS_SEMANA = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const vacio = {
  cliente: '',
  periodo: 'semana_anterior' as 'semana_anterior' | 'mes_anterior' | 'rango',
  programacion: 'semanal' as 'semanal' | 'manual' | 'mensual',
  desde: hoyLima(),
  hasta: hoyLima(),
  dia: '5',
  diaSemana: '1',
  hora: '8',
  minuto: '0',
  emails: '',
  emailsAdmin: 'ztrack@zgroup.com.pe',
  tolerancia: '9',
  activo: true,
};

function textoPrograma(c: CampanaInforme): string {
  const hora = `${String(c.hora).padStart(2, '0')}:${String(c.minuto).padStart(2, '0')}`;
  if (c.programacion === 'manual' || !c.activo) return 'solo manual';
  if (c.programacion === 'semanal') return `cada ${DIAS_SEMANA[c.diaSemana ?? 1]} a las ${hora}`;
  return `día ${c.dia} del mes a las ${hora}`;
}

export default function CampanasInformes() {
  const { user } = useAuth();
  const [campanas, setCampanas] = useState<CampanaInforme[]>([]);
  const [equipos, setEquipos] = useState<EquipoInforme[]>([]);
  const [nombresListos, setNombresListos] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [elegidos, setElegidos] = useState<EquipoCampana[]>([]);
  const [nombresLibres, setNombresLibres] = useState<Record<string, string>>({});
  const [form, setForm] = useState(vacio);
  const [editId, setEditId] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [corrida, setCorrida] = useState<CorridaCampana | null>(null);
  const [ajuste, setAjuste] = useState<Record<string, { horas: string; grados: string }>>({});
  const superadmin = user?.category === 'superadmin' || user?.superUser === true;

  const cargar = () => {
    void fetchCampanas()
      .then(setCampanas)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudieron cargar las campañas'));
  };

  useEffect(() => {
    cargar();
    void fetchEquiposInforme()
      .then(setEquipos)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la flota'));
    void refreshDeviceNamesFromServer()
      .catch(() => {})
      .finally(() => setNombresListos((n) => n + 1));
  }, []);

  useEffect(() => {
    if (!corrida || ['enviado', 'error'].includes(corrida.estado)) return;
    const t = window.setInterval(() => {
      void fetchCorrida(corrida.id)
        .then(setCorrida)
        .catch(() => {});
    }, 4000);
    return () => window.clearInterval(t);
  }, [corrida?.id, corrida?.estado]);

  const localNames = useMemo(() => readDeviceLocalNames(), [nombresListos, user]);

  const nombreDe = (equipo: EquipoInforme): string | null => {
    const shown = displayNameForDevice(user, equipo.imei, rowKeyOf(equipo), localNames, SIN_ASIGNAR);
    if (shown !== SIN_ASIGNAR) return shown;
    return equipo.nombre;
  };

  const coincidencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q.length < 1) return [];
    return equipos
      .filter((e) => {
        const key = `${e.codigo}|${e.imei}`;
        if (elegidos.some((x) => `${x.codigo}|${x.imei}` === key)) return false;
        const nombre = (nombreDe(e) ?? SIN_ASIGNAR).toLowerCase();
        return (
          e.imei.toLowerCase().includes(q) ||
          (e.codigo ?? '').toLowerCase().includes(q) ||
          nombre.includes(q)
        );
      })
      .slice(0, 12);
  }, [busqueda, equipos, elegidos, localNames, user]);

  if (!userIsSuperAdmin(user)) return <Navigate to="/" replace />;

  const abrirNueva = () => {
    setEditId(null);
    setForm(vacio);
    setElegidos([]);
    setNombresLibres({});
    setAbierto(true);
    setError(null);
  };

  const abrirEdicion = (c: CampanaInforme) => {
    setEditId(c.id);
    setForm({
      cliente: c.cliente,
      periodo: c.periodo === 'mes_anterior' || c.periodo === 'semana_anterior' ? c.periodo : 'rango',
      programacion: c.programacion ?? (c.activo ? 'mensual' : 'manual'),
      desde: c.desde ?? hoyLima(),
      hasta: c.hasta ?? hoyLima(),
      dia: String(c.dia),
      diaSemana: String(c.diaSemana ?? 1),
      hora: String(c.hora),
      minuto: String(c.minuto),
      emails: c.emails.join(', '),
      emailsAdmin: (c.emailsAdmin ?? []).join(', '),
      tolerancia: String(c.tolerancia),
      activo: c.activo,
    });
    setElegidos(c.equipos);
    setNombresLibres({});
    setAbierto(true);
    setError(null);
  };

  const agregar = (equipo: EquipoInforme) => {
    const ligado = nombreDe(equipo);
    setElegidos((prev) => [
      ...prev,
      { imei: equipo.imei, codigo: equipo.codigo ?? '', nombre: ligado ?? '' },
    ]);
    setBusqueda('');
  };

  const guardar = async () => {
    setBusy(true);
    setError(null);
    try {
      const equiposPayload = elegidos.map((e) => ({
        ...e,
        nombre: e.nombre || nombresLibres[`${e.codigo}|${e.imei}`] || '',
      }));
      const saved = await guardarCampana(
        {
          cliente: form.cliente,
          periodo: form.periodo,
          programacion: form.programacion,
          desde: form.desde,
          hasta: form.hasta,
          dia: Number(form.dia),
          diaSemana: Number(form.diaSemana),
          hora: Number(form.hora),
          minuto: Number(form.minuto),
          emails: form.emails.split(/[,;\s]+/).filter(Boolean),
          emailsAdmin: form.emailsAdmin.split(/[,;\s]+/).filter(Boolean),
          tolerancia: Number(form.tolerancia),
          activo: form.programacion !== 'manual',
          equipos: equiposPayload,
        },
        editId ?? undefined
      );
      setAbierto(false);
      setCampanas((prev) => {
        const rest = prev.filter((c) => c.id !== saved.id);
        return [...rest, saved];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const generarAhora = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      setCorrida(await lanzarCampana(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo lanzar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Campañas de informes</h1>
          <p className="text-sm text-muted-foreground">
            Varios equipos de un cliente. Se puede generar cada semana, el día y la hora elegidos, o
            solo cuando se procesa a mano. Al comercial se avisa que el informe está listo. A los
            administradores se les avisa de los días retenidos y de los periodos sin información.
          </p>
        </div>
        <Button onClick={abrirNueva}>Nueva campaña</Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-3">
        {campanas.length === 0 && (
          <p className="text-sm text-muted-foreground">Todavía no hay campañas.</p>
        )}
        {campanas.map((c) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{c.cliente}</CardTitle>
              <CardDescription>
                {c.equipos.length} equipo(s) · {textoPrograma(c)} ·{' '}
                {c.periodo === 'semana_anterior'
                  ? 'semana anterior'
                  : c.periodo === 'mes_anterior'
                    ? 'mes anterior'
                    : `${c.desde} a ${c.hasta}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" disabled={busy} onClick={() => void generarAhora(c.id)}>
                Generar ahora
              </Button>
              <Button variant="outline" onClick={() => abrirEdicion(c)}>
                Editar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (!window.confirm(`¿Borrar la campaña ${c.cliente}?`)) return;
                  void borrarCampana(c.id).then(cargar).catch((e) => setError(e.message));
                }}
              >
                Borrar
              </Button>
              {c.ultimaCorrida?.clienteCarpetaUrl && (
                <a
                  className="text-sm underline"
                  href={c.ultimaCorrida.clienteCarpetaUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Última carpeta
                </a>
              )}
              {c.ultimaCorrida && (
                <Button
                  variant="outline"
                  onClick={() => {
                    void fetchCorrida(c.ultimaCorrida!.id)
                      .then(setCorrida)
                      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo abrir la corrida'));
                  }}
                >
                  Ver corrida
                </Button>
              )}
              {c.ultimaCorrida && (
                <span className="text-xs text-muted-foreground">{c.ultimaCorrida.estado}</span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {corrida && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Corrida {corrida.desde} a {corrida.hasta}
            </CardTitle>
            <CardDescription>
              {corrida.estado} · {corrida.avance.subido} subidos · {corrida.avance.sinDatos ?? 0} sin
              datos · {corrida.avance.error} con error · {corrida.avance.pendiente} pendientes
              {corrida.mailError ? ` · correo: ${corrida.mailError}` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {corrida.clienteCarpetaUrl && (
              <a className="underline" href={corrida.clienteCarpetaUrl} target="_blank" rel="noreferrer">
                Carpeta del cliente
              </a>
            )}
            {corrida.resumenUrl && (
              <a className="block underline" href={corrida.resumenUrl} target="_blank" rel="noreferrer">
                Resumen de horas
              </a>
            )}
            <ul className="max-h-64 space-y-1 overflow-auto">
              {corrida.tareas.map((t) => (
                <li key={`${t.imei}-${t.desde}`}>
                  <span className="font-medium">{t.nombre}</span>{' '}
                  <span className="text-muted-foreground">
                    {t.ruta} · {t.desde} a {t.hasta} · {t.estado === 'sin_datos' ? 'sin datos' : t.estado}
                    {t.horasFuera != null
                      ? ` · ${t.horasFuera.toFixed(1)} h fuera sin defrost · ${Number(t.horasFueraTotal ?? 0).toFixed(1)} h fuera en total`
                      : ''}
                    {t.error ? ` · ${t.error}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {superadmin && (
              <div className="space-y-3 border-t pt-3">
                <p className="font-medium">Días retenidos (más de 5 h fuera de rango, sin defrost)</p>
                <p className="text-muted-foreground">
                  No se publican al cliente. En Drive el día queda en blanco, pendiente de procesar.
                  Desde aquí se puede reducir ese tiempo o bajar la temperatura del día y volver a generar.
                </p>
                {corrida.urgenteError && <p className="text-destructive">Aviso ZTRACK: {corrida.urgenteError}</p>}
                {corrida.tareas.flatMap((t) =>
                  (t.dias ?? [])
                    .filter((d) => d.pendiente)
                    .map((d) => {
                      const key = `${t.imei}|${t.desde}|${d.dia}`;
                      const val = ajuste[key] ?? { horas: '5', grados: '1' };
                      return (
                        <div key={key} className="space-y-2 rounded-md border p-3">
                          <p>
                            <span className="font-medium">{t.nombre}</span> · {d.dia} ·{' '}
                            {Number(d.horas_fuera_rango ?? 0).toFixed(1)} h fuera sin defrost ·{' '}
                            {Number(d.horas_defrost ?? 0).toFixed(1)} h defrost ·{' '}
                            {Number(d.horas_fuera_total ?? 0).toFixed(1)} h fuera en total
                          </p>
                          <div className="flex flex-wrap items-end gap-2">
                            <div>
                              <Label>Horas fuera de rango</Label>
                              <Input
                                type="number"
                                min={0.1}
                                max={5}
                                step={0.1}
                                value={val.horas}
                                onChange={(e) =>
                                  setAjuste((prev) => ({ ...prev, [key]: { ...val, horas: e.target.value } }))
                                }
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy || ['pendiente', 'generando', 'enviando'].includes(corrida.estado)}
                              onClick={() => {
                                setBusy(true);
                                void ajustarDiaCorrida(corrida.id, {
                                  imei: t.imei,
                                  codigo: t.codigo,
                                  desde: t.desde,
                                  dia: d.dia,
                                  modo: 'horas',
                                  valor: Number(val.horas),
                                })
                                  .then(setCorrida)
                                  .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo ajustar'))
                                  .finally(() => setBusy(false));
                              }}
                            >
                              Reducir horas
                            </Button>
                            <div>
                              <Label>Bajar temperatura (°C)</Label>
                              <Input
                                type="number"
                                min={0.1}
                                step={0.1}
                                value={val.grados}
                                onChange={(e) =>
                                  setAjuste((prev) => ({ ...prev, [key]: { ...val, grados: e.target.value } }))
                                }
                              />
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy || ['pendiente', 'generando', 'enviando'].includes(corrida.estado)}
                              onClick={() => {
                                setBusy(true);
                                void ajustarDiaCorrida(corrida.id, {
                                  imei: t.imei,
                                  codigo: t.codigo,
                                  desde: t.desde,
                                  dia: d.dia,
                                  modo: 'temperatura',
                                  valor: Number(val.grados),
                                })
                                  .then(setCorrida)
                                  .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo ajustar'))
                                  .finally(() => setBusy(false));
                              }}
                            >
                              Bajar temperatura
                            </Button>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {abierto && (
        <Card>
          <CardHeader>
            <CardTitle>{editId ? 'Editar campaña' : 'Nueva campaña'}</CardTitle>
            <CardDescription>
              La carpeta general de Drive es la de Correo → Drive. Aquí solo va el cliente y los
              equipos.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Cliente</Label>
              <Input
                value={form.cliente}
                onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                placeholder="DONOFRIO"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Equipos</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, IMEI o código"
                  className="pl-9"
                />
              </div>
              {coincidencias.length > 0 && (
                <ul className="rounded-md border">
                  {coincidencias.map((e) => (
                    <li key={`${e.codigo}-${e.imei}`}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => agregar(e)}
                      >
                        {nombreDe(e) ?? SIN_ASIGNAR} · {e.codigo} · {e.imei}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="space-y-2">
                {elegidos.map((e) => {
                  const key = `${e.codigo}|${e.imei}`;
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-2 text-sm">
                      <span>
                        {e.nombre || SIN_ASIGNAR} · {e.codigo} · {e.imei}
                      </span>
                      {!e.nombre && (
                        <Input
                          className="max-w-xs"
                          placeholder="Nombre del informe"
                          value={nombresLibres[key] ?? ''}
                          onChange={(ev) =>
                            setNombresLibres((prev) => ({ ...prev, [key]: ev.target.value }))
                          }
                        />
                      )}
                      <button
                        type="button"
                        className="text-xs underline text-muted-foreground"
                        onClick={() => setElegidos((prev) => prev.filter((x) => `${x.codigo}|${x.imei}` !== key))}
                      >
                        Quitar
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="space-y-2">
              <Label>Programación</Label>
              <select
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={form.programacion}
                onChange={(e) =>
                  setForm({
                    ...form,
                    programacion: e.target.value as 'semanal' | 'manual' | 'mensual',
                  })
                }
              >
                <option value="semanal">Automática, cada semana</option>
                <option value="manual">Solo procesamiento manual</option>
                {form.programacion === 'mensual' && (
                  <option value="mensual">Automática, un día del mes</option>
                )}
              </select>
            </div>
            {form.programacion === 'semanal' && (
              <div className="space-y-2">
                <Label>Día de la semana</Label>
                <select
                  className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  value={form.diaSemana}
                  onChange={(e) => setForm({ ...form, diaSemana: e.target.value })}
                >
                  {DIAS_SEMANA.slice(1).map((nombre, i) => (
                    <option key={nombre} value={String(i + 1)}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {form.programacion === 'mensual' && (
              <div className="space-y-2">
                <Label>Día del mes</Label>
                <Input value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })} />
              </div>
            )}
            {form.programacion !== 'manual' && (
              <>
                <div className="space-y-2">
                  <Label>Hora (Lima)</Label>
                  <Input value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Minuto</Label>
                  <Input
                    value={form.minuto}
                    onChange={(e) => setForm({ ...form, minuto: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label>Periodo al procesar manualmente</Label>
              <select
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={form.periodo}
                onChange={(e) =>
                  setForm({
                    ...form,
                    periodo: e.target.value as 'semana_anterior' | 'mes_anterior' | 'rango',
                  })
                }
              >
                <option value="semana_anterior">Semana anterior, lunes a domingo</option>
                <option value="mes_anterior">Mes anterior completo</option>
                <option value="rango">Rango de fechas</option>
              </select>
              {form.programacion === 'semanal' && (
                <p className="text-xs text-muted-foreground">
                  La generación automática usa la semana de lunes a domingo que acaba de cerrar.
                  Generar ahora usa el periodo de arriba.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Tolerancia ± °C</Label>
              <Input
                value={form.tolerancia}
                onChange={(e) => setForm({ ...form, tolerancia: e.target.value })}
              />
            </div>
            {form.periodo === 'rango' && (
              <>
                <div className="space-y-2">
                  <Label>Desde</Label>
                  <Input
                    type="date"
                    value={form.desde}
                    onChange={(e) => setForm({ ...form, desde: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hasta</Label>
                  <Input
                    type="date"
                    value={form.hasta}
                    onChange={(e) => setForm({ ...form, hasta: e.target.value })}
                  />
                </div>
              </>
            )}
            <div className="space-y-2 sm:col-span-2">
              <Label>Correo al comercial y a los involucrados</Label>
              <Input
                value={form.emails}
                onChange={(e) => setForm({ ...form, emails: e.target.value })}
                placeholder="comercial@empresa.com, contacto@empresa.com"
              />
              <p className="text-xs text-muted-foreground">
                Reciben el aviso de que el informe ya se generó, con el enlace de Drive.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Correo a los administradores</Label>
              <Input
                value={form.emailsAdmin}
                onChange={(e) => setForm({ ...form, emailsAdmin: e.target.value })}
                placeholder="ztrack@zgroup.com.pe"
              />
              <p className="text-xs text-muted-foreground">
                Reciben los días retenidos por fuera de rango y los periodos sin información. Si se
                deja vacío, el aviso va a ztrack@zgroup.com.pe.
              </p>
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button disabled={busy} onClick={() => void guardar()}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Guardar
              </Button>
              <Button variant="outline" onClick={() => setAbierto(false)}>
                Cerrar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
