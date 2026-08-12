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

/** Equipo volvió a temperatura en rango (cierre de incidente fuera de rango). */
export function buildRecuperacionEnRangoEmail(params) {
  const {
    dispositivo,
    dispositivoReeferId,
    nombrePlataforma,
    cliente,
    referenciaDesde,
    recuperadoAt,
    durationHours,
    umbralesEnviados = [],
  } = params;

  const d = dispositivo.ultimo_dato ?? {};
  const fechaAlerta = formatDateSubjectTz(new Date());
  const tipoAlarma = 'EQUIPO VOLVIÓ A RANGO';
  const subject = `REEFER ${dispositivoReeferId} - ${nombrePlataforma} - ${tipoAlarma} ${fechaAlerta}`;
  const intro =
    'Se notifica que el equipo, que estuvo fuera de rango, ya se reguló y volvió a estar en rangos normales de temperatura.';
  const parametrosLinea = buildParametrosLinea(d);
  const dur =
    durationHours != null && !Number.isNaN(durationHours)
      ? `~${roundHoras(durationHours)} h`
      : '—';
  const umbralesTxt =
    Array.isArray(umbralesEnviados) && umbralesEnviados.length
      ? umbralesEnviados.map((u) => formatUmbralHoras(u)).join(', ')
      : '—';

  const text = [
    `Señores ${cliente}`,
    '',
    intro,
    '',
    'Detalle del evento :',
    `• Nombre en la plataforma: ${nombrePlataforma}`,
    `• Tipo de Alarma: ${tipoAlarma}`,
    `• Inicio fuera de rango: ${formatDateTimeTz(referenciaDesde)} (GMT-5)`,
    `• Recuperación: ${formatDateTimeTz(recuperadoAt)} (GMT-5)`,
    `• Duración del incidente: ${dur}`,
    `• Alertas fuera de rango enviadas en el intervalo: ${umbralesTxt}`,
    `• Última comunicación: ${fmtDateShort(dispositivo.ultima_actualizacion)} (GMT-5)`,
    '',
    'Últimos parámetros registrados :',
    parametrosLinea,
    '',
    'Atentamente,',
    'ZTRACK-ZGROUP',
    'Sistema de Monitoreo y Alertas',
  ].join('\n');

  const html = `<!DOCTYPE html><html lang="es"><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
<p>Señores <strong>${cliente}</strong></p>
<p>${intro}</p>
<p><strong>Detalle del evento :</strong></p>
<ul>
<li><strong>Nombre en la plataforma:</strong> ${nombrePlataforma}</li>
<li><strong>Tipo de Alarma:</strong> ${tipoAlarma}</li>
<li><strong>Inicio fuera de rango:</strong> ${formatDateTimeTz(referenciaDesde)} (GMT-5)</li>
<li><strong>Recuperación:</strong> ${formatDateTimeTz(recuperadoAt)} (GMT-5)</li>
<li><strong>Duración del incidente:</strong> ${dur}</li>
<li><strong>Alertas fuera de rango enviadas en el intervalo:</strong> ${umbralesTxt}</li>
<li><strong>Última comunicación:</strong> ${fmtDateShort(dispositivo.ultima_actualizacion)} (GMT-5)</li>
</ul>
<p><strong>Últimos parámetros registrados :</strong><br>${parametrosLinea}</p>
<p>Atentamente,<br><strong>ZTRACK-ZGROUP</strong></p></body></html>`;

  return { subject, text, html, attachments: [] };
}

/**
 * Fuera de línea.
 * - usuario: sin horas
 * - ops (ztrack): con horas sin comunicación
 */
export function buildFueraDeLineaEmail(params) {
  const {
    dispositivo,
    dispositivoReeferId,
    nombrePlataforma,
    cliente,
    variante = 'usuario',
    horasOffline,
    referenciaDesde,
  } = params;

  const d = dispositivo.ultimo_dato ?? {};
  const fechaAlerta = formatDateSubjectTz(new Date());
  const tipoAlarma = 'EQUIPO FUERA DE LÍNEA';
  const subject = `REEFER ${dispositivoReeferId} - ${nombrePlataforma} - ALERTA ${tipoAlarma} ${fechaAlerta}`;
  const esOps = variante === 'ops';
  const intro = esOps
    ? 'Se notifica ALERTA EQUIPO FUERA DE LÍNEA (correo operativo ZTRACK).'
    : 'Se notifica que el equipo se encuentra fuera de línea.';
  const parametrosLinea = buildParametrosLinea(d);
  const horasTxt =
    horasOffline != null && !Number.isNaN(horasOffline)
      ? `~${roundHoras(horasOffline)} h sin comunicación`
      : '—';

  const linesDetalle = [
    `• Nombre en la plataforma: ${nombrePlataforma}`,
    `• Tipo de Alarma: ${tipoAlarma}`,
  ];
  if (esOps) {
    linesDetalle.push(`• Tiempo fuera de línea: ${horasTxt}`);
    linesDetalle.push(
      `• Última comunicación: ${fmtDateShort(referenciaDesde ?? dispositivo.ultima_actualizacion)} (GMT-5)`
    );
  } else {
    linesDetalle.push(
      `• Última comunicación: ${fmtDateShort(dispositivo.ultima_actualizacion)} (GMT-5)`
    );
  }

  const text = [
    `Señores ${cliente}`,
    '',
    intro,
    '',
    'Detalle del evento :',
    ...linesDetalle,
    '',
    'Últimos parámetros registrados :',
    parametrosLinea,
    '',
    'Atentamente,',
    'ZTRACK-ZGROUP',
    'Sistema de Monitoreo y Alertas',
  ].join('\n');

  const liOps = esOps
    ? `<li><strong>Tiempo fuera de línea:</strong> ${horasTxt}</li>
<li><strong>Última comunicación:</strong> ${fmtDateShort(referenciaDesde ?? dispositivo.ultima_actualizacion)} (GMT-5)</li>`
    : `<li><strong>Última comunicación:</strong> ${fmtDateShort(dispositivo.ultima_actualizacion)} (GMT-5)</li>`;

  const html = `<!DOCTYPE html><html lang="es"><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
<p>Señores <strong>${cliente}</strong></p>
<p>${intro}</p>
<p><strong>Detalle del evento :</strong></p>
<ul>
<li><strong>Nombre en la plataforma:</strong> ${nombrePlataforma}</li>
<li><strong>Tipo de Alarma:</strong> ${tipoAlarma}</li>
${liOps}
</ul>
<p><strong>Últimos parámetros registrados :</strong><br>${parametrosLinea}</p>
<p>Atentamente,<br><strong>ZTRACK-ZGROUP</strong></p></body></html>`;

  return { subject, text, html, attachments: [] };
}
