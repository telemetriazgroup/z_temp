import { formatDateTimeTz, formatDateSubjectTz } from './timezone.js';

function fmtTemp(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v} C°`;
}

function fmtDateShort(iso) {
  return formatDateTimeTz(iso);
}

function diaLabel(diaCalendario, hoy) {
  if (diaCalendario === hoy) return 'el día de hoy';
  return `el día ${diaCalendario}`;
}

export function buildFueraDeRangoEmail(params) {
  const {
    dispositivo,
    dispositivoReeferId,
    nombrePlataforma,
    cliente,
    umbralHoras,
    horasFueraRango,
    diaCalendario,
    hoy,
    referenciaDesde,
    tipoEvento = 'operaciones',
    esPrueba = false,
  } = params;

  const d = dispositivo.ultimo_dato ?? {};
  const fechaAlerta = formatDateSubjectTz(new Date());
  const tipoAlarma = esPrueba ? 'FUERA DE RANGO (PRUEBA)' : 'FUERA DE RANGO';
  const tipoTxt = tipoEvento === 'mantenimiento' ? 'Mantenimiento' : 'Operaciones';
  const subject = `REEFER ${dispositivoReeferId} - ${nombrePlataforma} - ALERTA ${tipoAlarma} ${fechaAlerta}`;

  const refTexto =
    referenciaDesde != null
      ? ` (referencia fuera de rango desde ${formatDateTimeTz(referenciaDesde)})`
      : '';

  const tiempoTexto = esPrueba
    ? `Simulación: mayor a ${umbralHoras} h ${diaLabel(diaCalendario, hoy)} (~${horasFueraRango} h).`
    : `Mayor a ${umbralHoras} horas ${diaLabel(diaCalendario, hoy)} (acumulado ~${horasFueraRango} h)${refTexto}.`;

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
    `• Tipo de evento: ${tipoTxt}`,
    `• Tipo de Alarma: ${tipoAlarma}`,
    `• Tiempo fuera de rango: ${tiempoTexto}`,
    `• Día de referencia: ${diaCalendario} (GMT-5)`,
    ...(referenciaDesde
      ? [`• Inicio fuera de rango: ${formatDateTimeTz(referenciaDesde)} (GMT-5)`]
      : []),
    `• Última Comunicación registrada: ${fmtDateShort(dispositivo.ultima_actualizacion)} (GMT-5)`,
    '',
    'Últimos parámetros registrados del equipo :',
    `• Set Point: ${fmtTemp(d.set_point)}`,
    `• Temp Supply: ${fmtTemp(d.temp_supply_1)}`,
    `• Return Air: ${fmtTemp(d.return_air)}`,
    `• Evaporator Coil: ${fmtTemp(d.evaporation_coil)}`,
    '',
    'Estado del equipo :',
    'El equipo se encuentra fuera del rango de temperatura configurado en la plataforma ZTRACK.',
    '',
    'Atentamente,',
    'ZTRACK-ZGROUP',
    'Sistema de Monitoreo y Alertas',
  ];

  const text = lines.join('\n');
  const html = `<!DOCTYPE html><html lang="es"><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
<p>Señores <strong>${cliente}</strong></p><p>${intro}</p>
<p><strong>Detalle del evento :</strong></p><ul>
<li><strong>Dispositivo(Reefer):</strong> ${dispositivoReeferId}</li>
<li><strong>Nombre en la plataforma:</strong> ${nombrePlataforma}</li>
<li><strong>Tipo de evento:</strong> ${tipoTxt}</li>
<li><strong>Tiempo fuera de rango:</strong> ${tiempoTexto}</li>
<li><strong>Día de referencia:</strong> ${diaCalendario} (GMT-5)</li>
${referenciaDesde ? `<li><strong>Inicio fuera de rango:</strong> ${formatDateTimeTz(referenciaDesde)} (GMT-5)</li>` : ''}
<li><strong>Última comunicación:</strong> ${fmtDateShort(dispositivo.ultima_actualizacion)} (GMT-5)</li>
</ul>
<p><strong>Temperaturas:</strong> Set ${fmtTemp(d.set_point)} · Supply ${fmtTemp(d.temp_supply_1)} · Return ${fmtTemp(d.return_air)}</p>
<p>Atentamente,<br><strong>ZTRACK-ZGROUP</strong></p></body></html>`;

  return { subject, text, html };
}
