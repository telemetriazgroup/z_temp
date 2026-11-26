import { formatDateTimeTz, formatDateSubjectTz } from './timezone.js';
import { formatUmbralHoras } from './store.js';
import { buildTrazabilidadText, fmtPowerState } from './emailTraceability.js';
import { evaporadorValido } from './lecturasValidas.js';

function fmtTemp(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return `${v} C°`;
}

function fmtEvap(v) {
  const n = evaporadorValido(v);
  return n == null ? '—' : `${n} C°`;
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
  return `Set ${fmtTemp(d.set_point)} · Supply ${fmtTemp(d.temp_supply_1)} · Return ${fmtTemp(d.return_air)} · Evap. ${fmtEvap(d.evaporation_coil)} · Power: ${power}`;
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
    notaCobertura,
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
  if (notaCobertura) linesDetalle.push(`• ${notaCobertura}`);

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
${notaCobertura ? `<li>${escHtml(notaCobertura)}</li>` : ''}
</ul>
<p><strong>Últimos parámetros registrados :</strong><br>${parametrosLinea}</p>
<p>Atentamente,<br><strong>ZTRACK-ZGROUP</strong></p></body></html>`;

  return { subject, text, html, attachments: [] };
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Equipos callados dentro del horario de zona sin cobertura.
 * Va a quien recibe las fallas de API, no al cliente.
 */
export function buildCoberturaHorariaEmail(params) {
  const equipos = Array.isArray(params?.equipos) ? params.equipos : [];
  const fechaAlerta = formatDateSubjectTz(new Date());
  const subject = `Cobertura limitada — ${equipos.length} equipo(s) fuera de línea en su horario ${fechaAlerta}`;
  const intro =
    'Estos equipos están fuera de línea dentro del horario en el que la zona no tiene señal. ' +
    'No se avisó al cliente: no se trata como falla de telemetría. ' +
    'Revise si hay que actualizar ese horario o informar que la cobertura no llega a esas horas.';
  const lineas = equipos.map((e) => {
    const nombre = e.nombre || e.imei || 'Equipo';
    return `• ${nombre} · IMEI ${e.imei || '—'} · sin señal ${e.desde} a ${e.hasta} · última comunicación ${fmtDateShort(e.ultima)} (GMT-5) · ~${roundHoras(e.horas)} h sin datos`;
  });
  const text = [
    'Administración',
    '',
    intro,
    '',
    'Equipos :',
    ...lineas,
    '',
    'El aviso se repite cada hora mientras sigan callados en ese horario.',
    '',
    'Atentamente,',
    'ZTRACK-ZGROUP',
  ].join('\n');
  const html = `<!DOCTYPE html><html lang="es"><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
<p>Administración</p>
<p>${escHtml(intro)}</p>
<p><strong>Equipos :</strong></p>
<ul>${lineas.map((l) => `<li>${escHtml(l.replace(/^• /, ''))}</li>`).join('')}</ul>
<p>El aviso se repite cada hora mientras sigan callados en ese horario.</p>
<p>Atentamente,<br><strong>ZTRACK-ZGROUP</strong></p></body></html>`;
  return { subject, text, html, attachments: [] };
}

/**
 * El enlace completo dejó de entregar datos. Va a asistencia técnica, no al cliente.
 */
export function buildApiSinConexionEmail(params) {
  const { codigo, horas, equipos, since, error } = params;
  const fechaAlerta = formatDateSubjectTz(new Date());
  const horasTxt =
    horas != null && !Number.isNaN(horas) ? `~${roundHoras(horas)} h` : 'más de 3 h';
  const subject = `API ${codigo} SIN CONEXIÓN — asistencia técnica ${fechaAlerta}`;
  const intro =
    `La API ${codigo} no se está conectando y requiere asistencia técnica del equipo informático. ` +
    'Se presume un error de comunicaciones con la API, no una falla de los equipos. ' +
    'Este aviso no se envía a los clientes.';
  const detalle = [
    `• Enlace / API: ${codigo}`,
    `• Equipos de ese enlace fuera de línea: ${equipos}`,
    `• Tiempo sin comunicación del enlace: ${horasTxt}`,
    `• Última comunicación conocida: ${fmtDateShort(since)} (GMT-5)`,
  ];
  if (error) detalle.push(`• Error de la sonda: ${error}`);
  detalle.push('• Próximo aviso: cada hora, mientras el enlace siga sin datos.');

  const text = [
    'Equipo informático',
    '',
    intro,
    '',
    'Detalle :',
    ...detalle,
    '',
    'Atentamente,',
    'ZTRACK-ZGROUP',
    'Sistema de Monitoreo y Alertas',
  ].join('\n');

  const html = `<!DOCTYPE html><html lang="es"><body style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">
<p>Equipo informático</p>
<p>${intro}</p>
<p><strong>Detalle :</strong></p>
<ul>${detalle.map((l) => `<li>${l.replace(/^• /, '')}</li>`).join('')}</ul>
<p>Atentamente,<br><strong>ZTRACK-ZGROUP</strong></p></body></html>`;

  return { subject, text, html, attachments: [] };
}
