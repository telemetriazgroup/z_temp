import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchUltimoEstadoDispositivos } from './api/termoking';
import type {
  DispositivoUltimoEstado,
  UltimoEstadoDispositivosResponse,
} from './types';
import { resumenFromDispositivos } from './modules/usuario/listResumen';
import { ensureAlarmCatalog, syncDeviceAlarmsFromTelemetry } from './modules/alarma';

/** Sin actividad / sin refresh: recargar flota automáticamente. */
export const FLEET_STALE_MS = 10 * 60 * 1000;

function deviceRowKey(d: DispositivoUltimoEstado): string {
  return d.codigo != null ? `${d.codigo}-${d.imei}` : d.imei;
}

function buildResponse(
  dispositivos: DispositivoUltimoEstado[],
  zonaHoraria = 'GMT-5'
): UltimoEstadoDispositivosResponse {
  return {
    data: {
      dispositivos,
      resumen: resumenFromDispositivos(dispositivos, zonaHoraria),
    },
  };
}

interface DispositivosFleetContextValue {
  data: UltimoEstadoDispositivosResponse | null;
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
  isStale: boolean;
  /** Carga si no hay datos o están force / stale. */
  ensureFleet: (opts?: { force?: boolean }) => Promise<UltimoEstadoDispositivosResponse | null>;
  refreshFleet: () => Promise<UltimoEstadoDispositivosResponse | null>;
  /** Hidrata desde overview del dashboard (evita segunda consulta). */
  hydrateFromDispositivos: (
    dispositivos: DispositivoUltimoEstado[],
    opts?: { zonaHoraria?: string; fetchedAt?: number }
  ) => void;
  upsertDispositivo: (d: DispositivoUltimoEstado) => void;
  findDispositivo: (
    imei: string,
    codigo?: string | null
  ) => DispositivoUltimoEstado | null;
}

const DispositivosFleetContext = createContext<DispositivosFleetContextValue | null>(
  null
);

export function DispositivosFleetProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<UltimoEstadoDispositivosResponse | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const inFlight = useRef<Promise<UltimoEstadoDispositivosResponse | null> | null>(
    null
  );
  const fetchedAtRef = useRef<number | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  fetchedAtRef.current = fetchedAt;

  const isStale =
    fetchedAt == null || nowTick - fetchedAt >= FLEET_STALE_MS;

  const applyResponse = useCallback((response: UltimoEstadoDispositivosResponse) => {
    ensureAlarmCatalog();
    syncDeviceAlarmsFromTelemetry(response.data.dispositivos);
    setData(response);
    const ts = Date.now();
    setFetchedAt(ts);
    fetchedAtRef.current = ts;
    setError(null);
    return response;
  }, []);

  const hydrateFromDispositivos = useCallback(
    (
      dispositivos: DispositivoUltimoEstado[],
      opts?: { zonaHoraria?: string; fetchedAt?: number }
    ) => {
      if (!Array.isArray(dispositivos)) return;
      const zona =
        opts?.zonaHoraria ??
        dataRef.current?.data?.resumen?.zona_horaria ??
        'GMT-5';
      applyResponse(buildResponse(dispositivos, zona));
      if (opts?.fetchedAt != null) {
        setFetchedAt(opts.fetchedAt);
        fetchedAtRef.current = opts.fetchedAt;
      }
    },
    [applyResponse]
  );

  const refreshFleet = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    setLoading(true);
    setError(null);
    const p = (async () => {
      try {
        const response = await fetchUltimoEstadoDispositivos();
        return applyResponse(response);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al cargar flota';
        setError(msg);
        return dataRef.current;
      } finally {
        setLoading(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = p;
    return p;
  }, [applyResponse]);

  const ensureFleet = useCallback(
    async (opts?: { force?: boolean }) => {
      const force = opts?.force === true;
      const at = fetchedAtRef.current;
      const fresh = at != null && Date.now() - at < FLEET_STALE_MS;
      if (!force && dataRef.current != null && fresh) {
        return dataRef.current;
      }
      if (!force && inFlight.current) return inFlight.current;
      return refreshFleet();
    },
    [refreshFleet]
  );

  const upsertDispositivo = useCallback((d: DispositivoUltimoEstado) => {
    setData((prev) => {
      const list = prev?.data?.dispositivos ?? [];
      const key = deviceRowKey(d);
      const idx = list.findIndex((x) => deviceRowKey(x) === key);
      const next =
        idx >= 0
          ? list.map((x, i) => (i === idx ? d : x))
          : [...list, d];
      const zona = prev?.data?.resumen?.zona_horaria ?? 'GMT-5';
      ensureAlarmCatalog();
      syncDeviceAlarmsFromTelemetry([d]);
      return buildResponse(next, zona);
    });
    const ts = Date.now();
    setFetchedAt(ts);
    fetchedAtRef.current = ts;
  }, []);

  const findDispositivo = useCallback(
    (imei: string, codigo?: string | null) => {
      const list = data?.data?.dispositivos ?? [];
      if (codigo) {
        const hit = list.find(
          (d) => d.imei === imei && (d.codigo ?? '') === codigo
        );
        if (hit) return hit;
      }
      return list.find((d) => d.imei === imei) ?? null;
    },
    [data]
  );

  // Tick para isStale + auto-refresh a los 10 min
  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick(Date.now());
      const at = fetchedAtRef.current;
      if (at == null) return;
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - at < FLEET_STALE_MS) return;
      void refreshFleet();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [refreshFleet]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const at = fetchedAtRef.current;
      if (at == null || Date.now() - at >= FLEET_STALE_MS) {
        void refreshFleet();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refreshFleet]);

  const value = useMemo(
    () => ({
      data,
      fetchedAt,
      loading,
      error,
      isStale,
      ensureFleet,
      refreshFleet,
      hydrateFromDispositivos,
      upsertDispositivo,
      findDispositivo,
    }),
    [
      data,
      fetchedAt,
      loading,
      error,
      isStale,
      ensureFleet,
      refreshFleet,
      hydrateFromDispositivos,
      upsertDispositivo,
      findDispositivo,
    ]
  );

  return (
    <DispositivosFleetContext.Provider value={value}>
      {children}
    </DispositivosFleetContext.Provider>
  );
}

export function useDispositivosFleet(): DispositivosFleetContextValue {
  const ctx = useContext(DispositivosFleetContext);
  if (ctx == null) {
    throw new Error('useDispositivosFleet debe usarse dentro de DispositivosFleetProvider');
  }
  return ctx;
}

export type FleetStatusFilter = 'ALL' | 'ONLINE' | 'WAIT' | 'OFFLINE';
export type FleetRangoFilter = 'ALL' | 'en' | 'fuera' | 'apagado';

export function parseFleetStatusParam(
  value: string | null
): FleetStatusFilter {
  const v = (value ?? '').toUpperCase();
  if (v === 'ONLINE' || v === 'WAIT' || v === 'OFFLINE') return v;
  return 'ALL';
}

export function parseFleetRangoParam(value: string | null): FleetRangoFilter {
  const v = (value ?? '').toLowerCase();
  if (v === 'en' || v === 'fuera' || v === 'apagado') return v;
  return 'ALL';
}

export function listadoFilterPath(opts: {
  status?: FleetStatusFilter;
  rango?: FleetRangoFilter;
}): string {
  const q = new URLSearchParams();
  if (opts.status && opts.status !== 'ALL') q.set('status', opts.status);
  if (opts.rango && opts.rango !== 'ALL') q.set('rango', opts.rango);
  const s = q.toString();
  return s ? `/listado?${s}` : '/listado';
}

/** Type helper for overview fleet payload. */
export type FleetOverviewPayload = {
  dispositivos: DispositivoUltimoEstado[];
  zona_horaria?: string;
  captured_at?: string;
};
