import { isDbConfigured, ensureDashboardSchema } from '../db.js';
import { recordLinkProbes } from './linkHealth.js';
import { upsertKnownDevices } from './deviceRegistry.js';

/**
 * Tras consultar APIs de último estado: guarda sondas de links (3 h)
 * y registra equipos nuevos para revisión.
 */
export async function observeTelemetryFetch(links, dispositivos) {
  if (!isDbConfigured()) return;
  try {
    await ensureDashboardSchema();
    await recordLinkProbes(links);
    if (Array.isArray(dispositivos) && dispositivos.length > 0) {
      await upsertKnownDevices(dispositivos);
    }
  } catch (e) {
    console.warn('[dashboard] observación telemetría:', e.message);
  }
}
