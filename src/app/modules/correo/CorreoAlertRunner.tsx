import { useCallback, useEffect, useRef } from 'react';
import { fetchUltimoEstadoDispositivos } from '../../api/termoking';
import { useAuth } from '../../AuthContext';
import { userMayAccessDispositivo, displayNameForDevice } from '../usuario';
import { readDeviceLocalNames } from '../../lib/deviceLocalNames';
import {
  ALERT_POLL_INTERVAL_MS,
  runAlertEngine,
  deviceRowKey,
} from './alertEngine';
import { readSmtpConfig } from './smtpConfigRepository';
import { getGruposCorreo } from './grupoCorreoRepository';

const SIN_ASIGNAR = 'SIN ASIGNAR';

/**
 * Motor en segundo plano: cada 2 minutos valida equipos en grupos activos.
 * EN RANGO → no hace nada. FUERA DE RANGO → evalúa umbrales y envía correo.
 */
export function CorreoAlertRunner() {
  const { user } = useAuth();
  const runningRef = useRef(false);

  const tick = useCallback(async () => {
    if (user == null || runningRef.current) return;
    if (readSmtpConfig() == null) return;
    if (getGruposCorreo().every((g) => !g.enabled || g.emails.length === 0)) return;

    runningRef.current = true;
    try {
      const res = await fetchUltimoEstadoDispositivos();
      const dispositivos = res.data.dispositivos.filter((d) =>
        userMayAccessDispositivo(user, d)
      );
      const localNames = readDeviceLocalNames();

      await runAlertEngine(dispositivos, (d, rowKey) =>
        displayNameForDevice(user, d.imei, rowKey, localNames, SIN_ASIGNAR)
      );
    } catch {
      /* silencioso en background */
    } finally {
      runningRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (user == null) return;
    void tick();
    const id = window.setInterval(() => void tick(), ALERT_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [user, tick]);

  return null;
}
