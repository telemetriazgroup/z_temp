import type { DispositivoOrigenCodigo, DispositivoUltimoEstado } from '../../types';
import type { DeviceAlarmEvent } from './types';
import { ensureAlarmCatalog, getAlarmCatalogByCode } from './alarmCatalogRepository';
import { extractActiveAlarmCodes } from './alarmSlots';
import {
  activeAlarmKey,
  generateDeviceAlarmId,
  getDeviceAlarmEvents,
  replaceDeviceAlarmEvents,
} from './deviceAlarmRepository';

function instante(valor: string | null | undefined): number {
  const ms = new Date(valor ?? '').getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function masTemprano(a: string, b: string): string {
  return instante(a) <= instante(b) ? a : b;
}

function masTarde(a: string | null | undefined, b: string | null | undefined): string | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return instante(a) >= instante(b) ? a : b;
}

/** Si la misma alarma reaparece antes de este lapso, sigue el mismo episodio. */
const CONTINUIDAD_MS = 30 * 60 * 1000;

function claveEquipo(codigo: DispositivoOrigenCodigo | null | undefined, imei: string): string {
  return `${codigo ?? 'UNK'}::${imei}`;
}

/**
 * La misma alarma que llega en cada trama es un solo episodio.
 * El inicio es la primera trama y, si sigue activa, no se cierra.
 */
export function fusionarAlarmasRepetidas(events: DeviceAlarmEvent[]): DeviceAlarmEvent[] {
  const grupos = new Map<string, DeviceAlarmEvent[]>();
  for (const evento of events) {
    const clave = activeAlarmKey(evento.imei, evento.codigo, evento.alarmCode);
    const lista = grupos.get(clave) ?? [];
    lista.push(evento);
    grupos.set(clave, lista);
  }

  const episodios: DeviceAlarmEvent[] = [];
  for (const lista of grupos.values()) {
    lista.sort((a, b) => instante(a.detectedAt) - instante(b.detectedAt));
    let actual: DeviceAlarmEvent = {
      ...lista[0],
      lastSeenAt: lista[0].lastSeenAt ?? lista[0].detectedAt,
    };
    for (const siguiente of lista.slice(1)) {
      const sigueAbierta = actual.clearedAt == null;
      const sigueEnLaMismaRacha =
        instante(siguiente.detectedAt) <= instante(actual.clearedAt) + CONTINUIDAD_MS;
      if (sigueAbierta || sigueEnLaMismaRacha) {
        actual = {
          ...actual,
          detectedAt: masTemprano(actual.detectedAt, siguiente.detectedAt),
          lastSeenAt: masTarde(
            masTarde(actual.lastSeenAt, actual.detectedAt),
            masTarde(siguiente.lastSeenAt, siguiente.detectedAt)
          ),
          clearedAt: actual.clearedAt == null || siguiente.clearedAt == null
            ? null
            : masTarde(actual.clearedAt, siguiente.clearedAt) ?? null,
          atendida: actual.atendida || siguiente.atendida,
          reportadaEmail: actual.reportadaEmail || siguiente.reportadaEmail,
          catalogId: actual.catalogId ?? siguiente.catalogId,
        };
        continue;
      }
      episodios.push(actual);
      actual = { ...siguiente, lastSeenAt: siguiente.lastSeenAt ?? siguiente.detectedAt };
    }
    episodios.push(actual);
  }
  return episodios;
}

/**
 * Sincroniza episodios con el último estado.
 * Una trama nueva de la misma alarma alarga el rango; no abre otra fila.
 * Solo cierra alarmas de los equipos que vinieron en esta lectura.
 */
export function syncDeviceAlarmsFromTelemetry(
  dispositivos: DispositivoUltimoEstado[],
  model = 'MP4000'
): DeviceAlarmEvent[] {
  ensureAlarmCatalog();
  const events = fusionarAlarmasRepetidas(getDeviceAlarmEvents());
  const revisados = new Set(dispositivos.map((d) => claveEquipo(d.codigo, d.imei)));
  const activas = new Set<string>();
  const now = new Date().toISOString();

  for (const d of dispositivos) {
    const trama = d.ultimo_dato?.created_at ?? d.ultima_actualizacion ?? now;
    const codigos = [...new Set(extractActiveAlarmCodes(d.ultimo_dato).map((c) => c.code))];
    for (const code of codigos) {
      const clave = activeAlarmKey(d.imei, d.codigo, code);
      activas.add(clave);
      const abierta = events.find(
        (e) => e.clearedAt == null && activeAlarmKey(e.imei, e.codigo, e.alarmCode) === clave
      );
      if (abierta) {
        if (instante(trama) < instante(abierta.detectedAt)) abierta.detectedAt = trama;
        const vista = abierta.lastSeenAt ?? abierta.detectedAt;
        if (instante(trama) >= instante(vista)) abierta.lastSeenAt = trama;
        continue;
      }
      const catalog = getAlarmCatalogByCode(code, model);
      events.push({
        id: generateDeviceAlarmId(),
        imei: d.imei,
        codigo: d.codigo ?? null,
        alarmCode: code,
        catalogId: catalog?.id ?? null,
        detectedAt: trama,
        lastSeenAt: trama,
        clearedAt: null,
        atendida: false,
        reportadaEmail: false,
      });
    }
  }

  for (const evento of events) {
    if (evento.clearedAt != null) continue;
    if (!revisados.has(claveEquipo(evento.codigo, evento.imei))) continue;
    const clave = activeAlarmKey(evento.imei, evento.codigo, evento.alarmCode);
    if (!activas.has(clave)) evento.clearedAt = evento.lastSeenAt ?? now;
  }

  replaceDeviceAlarmEvents(events);
  return getDeviceAlarmEvents();
}
