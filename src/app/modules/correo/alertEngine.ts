import type { DispositivoUltimoEstado } from '../../types';
import { readSmtpConfig } from './smtpConfigRepository';
import {
  getGruposCorreo,
  normalizeUmbrales,
} from './grupoCorreoRepository';
import {
  recordRangePoll,
  consecutiveHoursOutOfRange,
} from './rangeHistoryRepository';
import {
  getEpisode,
  startEpisode,
  clearEpisode,
  markUmbralSent,
  episodeHoursElapsed,
} from './episodeRepository';
import { addCorreoEnvioLog } from './envioLogRepository';
import { buildFueraDeRangoEmail } from './buildAlertEmail';
import { sendEmailViaApi } from './emailApi';
import type { AlertEngineResult } from './types';

export const ALERT_POLL_INTERVAL_MS = 2 * 60 * 1000;

export function deviceRowKey(d: DispositivoUltimoEstado): string {
  return d.codigo != null ? `${d.codigo}-${d.imei}` : d.imei;
}

export interface ResolveDeviceLabelsInput {
  descripcionEquipo?: string;
  nombrePlataforma: string;
}

export function resolveDeviceLabels(input: ResolveDeviceLabelsInput): {
  dispositivoReeferId: string;
  nombrePlataforma: string;
} {
  const desc = input.descripcionEquipo?.trim();
  const platform = input.nombrePlataforma.trim() || 'SIN ASIGNAR';
  return {
    dispositivoReeferId: desc || platform,
    nombrePlataforma: platform,
  };
}

/**
 * Evalúa dispositivos monitorizados y envía correos por umbral (2h, 3h …).
 * - EN RANGO → limpia episodio, no envía.
 * - FUERA DE RANGO → registra historial horario y envía solo umbrales no enviados.
 */
export async function runAlertEngine(
  dispositivos: DispositivoUltimoEstado[],
  resolveNombrePlataforma: (d: DispositivoUltimoEstado, rowKey: string) => string
): Promise<AlertEngineResult> {
  const checkedAt = new Date().toISOString();
  const errors: string[] = [];
  let emailsSent = 0;
  let devicesChecked = 0;

  const smtp = readSmtpConfig();
  if (smtp == null) {
    return { checkedAt, devicesChecked: 0, emailsSent: 0, errors: [] };
  }

  const grupos = getGruposCorreo().filter((g) => g.enabled && g.emails.length > 0);
  if (grupos.length === 0) {
    return { checkedAt, devicesChecked: 0, emailsSent: 0, errors: [] };
  }

  const deviceMap = new Map(dispositivos.map((d) => [deviceRowKey(d), d]));

  for (const grupo of grupos) {
    for (const assignment of grupo.devices) {
      if (!assignment.enabled) continue;

      const dispositivo = deviceMap.get(assignment.rowKey);
      if (dispositivo == null) continue;

      devicesChecked++;
      const enRango = dispositivo.en_rango;
      recordRangePoll(assignment.rowKey, enRango);

      if (enRango !== false) {
        if (enRango === true) {
          clearEpisode(assignment.rowKey);
        }
        continue;
      }

      const now = new Date();
      let episode = getEpisode(assignment.rowKey);
      if (episode == null) {
        episode = startEpisode(assignment.rowKey, now.toISOString());
      }

      const hoursFromHistory = consecutiveHoursOutOfRange(assignment.rowKey, true);
      const hoursFromEpisode = episodeHoursElapsed(episode, now);
      const horasFueraRango = Math.max(hoursFromHistory, hoursFromEpisode);

      const umbrales = normalizeUmbrales(assignment.umbralesHoras);
      const pending = umbrales.filter(
        (u) => horasFueraRango >= u && episode!.lastSentUmbral < u
      );

      if (pending.length === 0) continue;

      const nombrePlataforma = resolveNombrePlataforma(dispositivo, assignment.rowKey);
      const { dispositivoReeferId, nombrePlataforma: nombrePlat } = resolveDeviceLabels({
        descripcionEquipo: assignment.descripcionEquipo,
        nombrePlataforma,
      });

      for (const umbralHoras of pending) {
        const content = buildFueraDeRangoEmail({
          dispositivo,
          dispositivoReeferId,
          nombrePlataforma: nombrePlat,
          cliente: grupo.cliente.trim() || 'Cliente',
          umbralHoras,
          horasFueraRango,
        });

        try {
          const result = await sendEmailViaApi({
            smtp,
            to: grupo.emails,
            subject: content.subject,
            text: content.text,
            html: content.html,
          });

          markUmbralSent(assignment.rowKey, umbralHoras);
          episode = getEpisode(assignment.rowKey)!;

          addCorreoEnvioLog({
            grupoId: grupo.id,
            grupoNombre: grupo.nombre,
            rowKey: assignment.rowKey,
            imei: dispositivo.imei,
            descripcionEquipo: dispositivoReeferId,
            nombrePlataforma: nombrePlat,
            umbralHoras,
            horasFueraRango,
            destinatarios: [...grupo.emails],
            subject: content.subject,
            sentAt: new Date().toISOString(),
            messageId: result.messageId,
            success: true,
          });
          emailsSent++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Error al enviar correo';
          errors.push(`${grupo.nombre} / ${dispositivoReeferId} (${umbralHoras}h): ${msg}`);
          addCorreoEnvioLog({
            grupoId: grupo.id,
            grupoNombre: grupo.nombre,
            rowKey: assignment.rowKey,
            imei: dispositivo.imei,
            descripcionEquipo: dispositivoReeferId,
            nombrePlataforma: nombrePlat,
            umbralHoras,
            horasFueraRango,
            destinatarios: [...grupo.emails],
            subject: content.subject,
            sentAt: new Date().toISOString(),
            success: false,
            error: msg,
          });
        }
      }
    }
  }

  return { checkedAt, devicesChecked, emailsSent, errors };
}
