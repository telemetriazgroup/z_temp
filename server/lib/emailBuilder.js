import { formatDateTimeTz, formatDateSubjectTz } from './timezone.js';
import { formatUmbralHoras } from './store.js';
import { buildTrazabilidadText, fmtPowerState } from './emailTraceability.js';

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

function roundHoras(h) {
  return Math.round(h * 10) / 10;
}

/** Solo umbral alcanzado + día (sin repetir horas acumuladas). */
function buildTiempoUmbralTexto({ umbralHoras, diaCalendario, hoy, esPrueba, prefijoSimulacion, prefijoNormal }) {
  const diaTxt = diaLabel(diaCalendario, hoy);
  if (esPrueba) {
    return `${prefijoSimulacion} ${formatUmbralHoras(umbralHoras)} ${diaTxt}.`;
  }
  return `${prefijoNormal} ${formatUmbralHoras(umbralHoras)} ${diaTxt}.`;
}

function buildParametrosLinea(d, powerLabel) {
  const power =
    powerLabel ??
    fmtPowerState(d.power_state ?? null);
  return `Set ${fmtTemp(d.set_point)} · Supply ${fmtTemp(d.temp_supply_1)} · Return ${fmtTemp(d.return_air)} · Evap. ${fmtTemp(d.evaporation_coil)} · Power: ${power}`;
}

function buildDetalleEventoTexto({
  cliente,
  intro,
  nombrePlataforma,
  tipoAlarma,
  tiempoLabel,
  tiempoTexto,
  diaCalendario,
  inicioLabel,
  referenciaDesde,
  horasEnDia,
  horasAcumuladas,
  ultimaComunicacion,
  parametrosLinea,
  trazText,
}) {
  return [
    `Señores ${cliente}`,
    '',
    intro,
    '',
    'Detalle del evento :',
    `• Nombre en la plataforma: ${nombrePlataforma}`,
    `• Tipo de Alarma: ${tipoAlarma}`,
    `• ${tiempoLabel}: ${tiempoTexto}`,
    `• Día de referencia (umbrales): ${diaCalendario} (GMT-5)`,
    `• ${inicioLabel}: ${formatDateTimeTz(referenciaDesde)} (GMT-5)`,
    `• Horas en el día: ~${roundHoras(horasEnDia)} h`,
    `• Horas acumuladas: ~${roundHoras(horasAcumuladas)} h`,
    `• Última comunicación: ${fmtDateShort(ultimaComunicacion)} (GMT-5)`,
    '',
    'Últimos parámetros registrados :',
    parametrosLinea,
    ...trazText,
    '',
    'Atentamente,',
    'ZTRACK-ZGROUP',
    'Sistema de Monitoreo y Alertas',
  ];
}

function buildDetalleEventoHtml({
  cliente,
  intro,
  nombrePlataforma,
  tipoAlarma,
  tiempoLabel,
  tiempoTexto,
  diaCalendario,
  inicioLabel,
  referenciaDesde,
  horasEnDia,
  horasAcumuladas,
  ultimaComunicacion,
  parametrosLinea,
  trazabilidadHtml,
}) {
  return `<!DOCTYPE html><html lang="es"><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
<p>Señores <strong>${cliente}</strong></p>
<p>${intro}</p>
<p><strong>Detalle del evento :</strong></p>
<ul>
<li><strong>Nombre en la plataforma:</strong> ${nombrePlataforma}</li>
<li><strong>Tipo de Alarma:</strong> ${tipoAlarma}</li>
<li><strong>${tiempoLabel}:</strong> ${tiempoTexto}</li>
<li><strong>Día de referencia (umbrales):</strong> ${diaCalendario} (GMT-5)</li>
<li><strong>${inicioLabel}:</strong> ${formatDateTimeTz(referenciaDesde)} (GMT-5)</li>
<li><strong>Horas en el día:</strong> ~${roundHoras(horasEnDia)} h</li>
<li><strong>Horas acumuladas:</strong> ~${roundHoras(horasAcumuladas)} h</li>
<li><strong>Última comunicación:</strong> ${fmtDateShort(ultimaComunicacion)} (GMT-5)</li>
</ul>
<p><strong>Últimos parámetros registrados :</strong><br>${parametrosLinea}</p>
${trazabilidadHtml}
<p>Atentamente,<br><strong>ZTRACK-ZGROUP</strong></p></body></html>`;
}

export function buildFueraDeRangoEmail(params) {
  const {
    dispositivo,
    dispositivoReeferId,
    nombrePlataforma,
    cliente,
    umbralHoras,
    horasFueraRango,
    horasEnDia,
    horasAcumuladas,
    diaCalendario,
    hoy,
    referenciaDesde,
    esPrueba = false,
    trazabilidadHtml = '',
    trazabilidadAttachments = [],
  } = params;

  const d = dispositivo.ultimo_dato ?? {};
  const acumulado = horasAcumuladas ?? horasFueraRango;
  const enDia = horasEnDia ?? horasFueraRango;
  const fechaAlerta = formatDateSubjectTz(new Date());
  const tipoAlarma = esPrueba ? 'FUERA DE RANGO (PRUEBA)' : 'FUERA DE RANGO';
  const subject = `REEFER ${dispositivoReeferId} - ${nombrePlataforma} - ALERTA ${tipoAlarma} ${fechaAlerta}`;

  const tiempoTexto = buildTiempoUmbralTexto({
    umbralHoras,
    diaCalendario,
    hoy,
    esPrueba,
    prefijoSimulacion: 'Simulación: mayor a',
    prefijoNormal: 'Mayor a',
  });

  const intro = esPrueba
    ? 'Se envía este correo de PRUEBA de FUERA DE RANGO generado por la plataforma ZTRACK.'
    : 'Se notifica la siguiente ALERTA FUERA DE RANGO.';

  const trazText = buildTrazabilidadText(params.trazabilidad ?? null);
  const parametrosLinea = buildParametrosLinea(d);

  const text = buildDetalleEventoTexto({
    cliente,
    intro,
    nombrePlataforma,
    tipoAlarma,
    tiempoLabel: 'Tiempo fuera de rango',
    tiempoTexto,
    diaCalendario,
    inicioLabel: 'Inicio fuera de rango',
    referenciaDesde,
    horasEnDia: enDia,
    horasAcumuladas: acumulado,
    ultimaComunicacion: dispositivo.ultima_actualizacion,
    parametrosLinea,
    trazText,
  }).join('\n');

  const html = buildDetalleEventoHtml({
    cliente,
    intro,
    nombrePlataforma,
    tipoAlarma,
    tiempoLabel: 'Tiempo fuera de rango',
    tiempoTexto,
    diaCalendario,
    inicioLabel: 'Inicio fuera de rango',
    referenciaDesde,
    horasEnDia: enDia,
    horasAcumuladas: acumulado,
    ultimaComunicacion: dispositivo.ultima_actualizacion,
    parametrosLinea,
    trazabilidadHtml,
  });

  return { subject, text, html, attachments: trazabilidadAttachments };
}

export function buildApagadoEmail(params) {
  const {
    dispositivo,
    dispositivoReeferId,
    nombrePlataforma,
    cliente,
    umbralHoras,
    horasApagado,
    horasEnDia,
    horasAcumuladas,
    diaCalendario,
    hoy,
    referenciaDesde,
    esPrueba = false,
    trazabilidadHtml = '',
    trazabilidadAttachments = [],
  } = params;

  const d = dispositivo.ultimo_dato ?? {};
  const acumulado = horasAcumuladas ?? horasApagado;
  const enDia = horasEnDia ?? horasApagado;
  const fechaAlerta = formatDateSubjectTz(new Date());
  const tipoAlarma = esPrueba ? 'APAGADO (PRUEBA)' : 'APAGADO';
  const subject = `REEFER ${dispositivoReeferId} - ${nombrePlataforma} - ALERTA ${tipoAlarma} ${fechaAlerta}`;

  const tiempoTexto = buildTiempoUmbralTexto({
    umbralHoras,
    diaCalendario,
    hoy,
    esPrueba,
    prefijoSimulacion: 'Simulación: equipo apagado más de',
    prefijoNormal: 'Equipo apagado más de',
  });

  const intro = esPrueba
    ? 'Se envía este correo de PRUEBA de APAGADO generado por la plataforma ZTRACK.'
    : 'Se notifica la siguiente ALERTA APAGADO.';

  const trazText = buildTrazabilidadText(params.trazabilidad ?? null);
  const parametrosLinea = buildParametrosLinea(d, 'APAGADO');

  const text = buildDetalleEventoTexto({
    cliente,
    intro,
    nombrePlataforma,
    tipoAlarma,
    tiempoLabel: 'Tiempo apagado',
    tiempoTexto,
    diaCalendario,
    inicioLabel: 'Inicio apagado',
    referenciaDesde,
    horasEnDia: enDia,
    horasAcumuladas: acumulado,
    ultimaComunicacion: dispositivo.ultima_actualizacion,
    parametrosLinea,
    trazText,
  }).join('\n');

  const html = buildDetalleEventoHtml({
    cliente,
    intro,
    nombrePlataforma,
    tipoAlarma,
    tiempoLabel: 'Tiempo apagado',
    tiempoTexto,
    diaCalendario,
    inicioLabel: 'Inicio apagado',
    referenciaDesde,
    horasEnDia: enDia,
    horasAcumuladas: acumulado,
    ultimaComunicacion: dispositivo.ultima_actualizacion,
    parametrosLinea,
    trazabilidadHtml,
  });

  return { subject, text, html, attachments: trazabilidadAttachments };
}
