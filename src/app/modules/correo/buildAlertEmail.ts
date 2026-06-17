import type { DispositivoUltimoEstado } from '../../types';

export interface FueraDeRangoEmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface FueraDeRangoEmailParams {
  dispositivo: DispositivoUltimoEstado;
  /** ID reefer en el correo (ej. ZGRU5295105) */
  dispositivoReeferId: string;
  /** Nombre en plataforma (ej. MP BIXINAS) */
  nombrePlataforma: string;
  cliente: string;
  /** Umbral alcanzado (2, 3, 4 …) */
  umbralHoras: number;
  horasFueraRango: number;
  esPrueba?: boolean;
}

function fmtTemp(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v} C°`;
}

function fmtDateShort(iso: string | null | undefined): string {
  if (iso == null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${h}:${min}`;
}

function fmtDateSubject(iso: string | null | undefined): string {
  if (iso == null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export function buildFueraDeRangoEmail(params: FueraDeRangoEmailParams): FueraDeRangoEmailContent {
  const {
    dispositivo,
    dispositivoReeferId,
    nombrePlataforma,
    cliente,
    umbralHoras,
    horasFueraRango,
    esPrueba = false,
  } = params;

  const d = dispositivo.ultimo_dato;
  const fechaAlerta = fmtDateSubject(new Date().toISOString());
  const tipoAlarma = esPrueba ? 'FUERA DE RANGO (PRUEBA)' : 'FUERA DE RANGO';
  const subject = `REEFER ${dispositivoReeferId} - ${nombrePlataforma} - ALERTA ${tipoAlarma} ${fechaAlerta}`;

  const tiempoTexto = esPrueba
    ? `Simulación: mayor a ${umbralHoras} horas (actual ~${horasFueraRango} h).`
    : `Mayor a ${umbralHoras} horas.`;

  const intro = esPrueba
    ? 'Se envía este correo de PRUEBA generado por la plataforma ZTRACK.'
    : 'Se notifica la siguiente ALERTA FUERA DE RANGO, generada por la plataforma ZTRACK.';

  const lines = [
    `Señores ${cliente}`,
    '',
    intro,
    '',
    'Detalle del evento :',
    `• Dispositivo(Reefer): ${dispositivoReeferId}`,
    `• Nombre en la plataforma: ${nombrePlataforma}`,
    `• Cliente: ${cliente}`,
    `• Tipo de Alarma: ${tipoAlarma}`,
    `• Tiempo fuera de rango: ${tiempoTexto}`,
    `• Última Comunicación registrada: ${fmtDateShort(dispositivo.ultima_actualizacion)}`,
    '',
    'Últimos parámetros registrados del equipo :',
    `• Set Point: ${fmtTemp(d?.set_point)}`,
    `• Temp Supply: ${fmtTemp(d?.temp_supply_1)}`,
    `• Return Air: ${fmtTemp(d?.return_air)}`,
    `• Evaporator Coil: ${fmtTemp(d?.evaporation_coil)}`,
    '',
    'Estado del equipo :',
    'El equipo se encuentra fuera del rango de temperatura configurado en la plataforma ZTRACK.',
    '',
    'Se recomienda validar físicamente el estado del equipo. En ocasiones puede deberse a operaciones normales en la cámara; si tiene dudas, contacte a la asistencia técnica de ZGROUP. La conectividad suele restablecerse automáticamente.',
    '',
    'Atentamente,',
    'ZTRACK-ZGROUP',
    'Sistema de Monitoreo y Alertas',
  ];

  const text = lines.join('\n');

  const bullet = (label: string, value: string) =>
    `<li><strong>${label}:</strong> ${value}</li>`;

  const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.55;max-width:640px;font-size:14px">
  <p>Señores <strong>${cliente}</strong></p>
  <p>${intro}</p>
  <p><strong>Detalle del evento :</strong></p>
  <ul style="padding-left:20px">
    ${bullet('Dispositivo(Reefer)', dispositivoReeferId)}
    ${bullet('Nombre en la plataforma', nombrePlataforma)}
    ${bullet('Cliente', cliente)}
    ${bullet('Tipo de Alarma', tipoAlarma)}
    ${bullet('Tiempo fuera de rango', tiempoTexto)}
    ${bullet('Última Comunicación registrada', fmtDateShort(dispositivo.ultima_actualizacion))}
  </ul>
  <p><strong>Últimos parámetros registrados del equipo :</strong></p>
  <ul style="padding-left:20px">
    ${bullet('Set Point', fmtTemp(d?.set_point))}
    ${bullet('Temp Supply', fmtTemp(d?.temp_supply_1))}
    ${bullet('Return Air', fmtTemp(d?.return_air))}
    ${bullet('Evaporator Coil', fmtTemp(d?.evaporation_coil))}
  </ul>
  <p><strong>Estado del equipo :</strong></p>
  <p>El equipo se encuentra fuera del rango de temperatura configurado en la plataforma ZTRACK.</p>
  <p style="color:#444">Se recomienda validar físicamente el estado del equipo. En ocasiones puede deberse a operaciones normales en la cámara; si tiene dudas, contacte a la asistencia técnica de ZGROUP. La conectividad suele restablecerse automáticamente.</p>
  <p>Atentamente,<br><strong>ZTRACK-ZGROUP</strong><br>Sistema de Monitoreo y Alertas</p>
</body>
</html>`.trim();

  return { subject, text, html };
}

/** Compatibilidad con envío de prueba simple. */
export function buildFueraDeRangoEmailLegacy(
  dispositivo: DispositivoUltimoEstado,
  nombreEquipo: string,
  options?: { esPrueba?: boolean; cliente?: string }
): FueraDeRangoEmailContent {
  return buildFueraDeRangoEmail({
    dispositivo,
    dispositivoReeferId: nombreEquipo,
    nombrePlataforma: nombreEquipo,
    cliente: options?.cliente ?? 'Cliente',
    umbralHoras: 2,
    horasFueraRango: 2,
    esPrueba: options?.esPrueba,
  });
}
