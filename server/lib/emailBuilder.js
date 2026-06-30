import { formatDateTimeTz, formatDateSubjectTz } from './timezone.js';
import { formatUmbralHoras } from './store.js';
import { buildTrazabilidadHtml, buildTrazabilidadText } from './emailTraceability.js';

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

/** Texto de tiempo: umbral del día + acumulado total desde referencia. */
function buildTiempoAlertaTexto({
  umbralHoras,
  diaCalendario,
  hoy,
  horasEnDia,
  horasAcumuladas,
  referenciaDesde,
  esPrueba,
  prefijoSimulacion,
  prefijoNormal,
}) {
  const diaTxt = diaLabel(diaCalendario, hoy);
  const acumTxt = `acumulado total ~${roundHoras(horasAcumuladas)} h desde ${formatDateTimeTz(referenciaDesde)}`;
  const hoyTxt = `${roundHoras(horasEnDia)} h en ${diaTxt}`;
  if (esPrueba) {
    return `${prefijoSimulacion} ${formatUmbralHoras(umbralHoras)} ${diaTxt} (${hoyTxt} · ${acumTxt}).`;
  }
  return `${prefijoNormal} ${formatUmbralHoras(umbralHoras)} ${diaTxt} (${hoyTxt} · ${acumTxt}).`;
}

function buildTemperaturasTexto(d) {
  return [
    '',
    'Últimos parámetros registrados del equipo :',
    `• Set Point: ${fmtTemp(d.set_point)}`,
    `• Temp Supply: ${fmtTemp(d.temp_supply_1)}`,
    `• Return Air: ${fmtTemp(d.return_air)}`,
    `• Evaporator Coil: ${fmtTemp(d.evaporation_coil)}`,
  ];
}

function buildTemperaturasHtml(d, extra = '') {
  return `<p><strong>Últimos parámetros registrados:</strong><br>
Set ${fmtTemp(d.set_point)} · Supply ${fmtTemp(d.temp_supply_1)} · Return ${fmtTemp(d.return_air)} · Evap. ${fmtTemp(d.evaporation_coil)}${extra}</p>`;
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
    tipoEvento = 'operaciones',
    esPrueba = false,
    trazabilidad = null,
  } = params;

  const d = dispositivo.ultimo_dato ?? {};
  const acumulado = horasAcumuladas ?? horasFueraRango;
  const enDia = horasEnDia ?? horasFueraRango;
  const fechaAlerta = formatDateSubjectTz(new Date());
  const tipoAlarma = esPrueba ? 'FUERA DE RANGO (PRUEBA)' : 'FUERA DE RANGO';
  const tipoTxt = tipoEvento === 'mantenimiento' ? 'Mantenimiento' : 'Operaciones';
  const subject = `REEFER ${dispositivoReeferId} - ${nombrePlataforma} - ALERTA ${tipoAlarma} ${fechaAlerta}`;

  const tiempoTexto = buildTiempoAlertaTexto({
    umbralHoras,
    diaCalendario,
    hoy,
    horasEnDia: enDia,
    horasAcumuladas: acumulado,
    referenciaDesde,
    esPrueba,
    prefijoSimulacion: 'Simulación: mayor a',
    prefijoNormal: 'Mayor a',
  });

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
    `• Día de referencia (umbrales): ${diaCalendario} (GMT-5)`,
    ...(referenciaDesde
      ? [`• Inicio fuera de rango (referencia): ${formatDateTimeTz(referenciaDesde)} (GMT-5)`]
      : []),
    `• Horas en el día calendario: ~${roundHoras(enDia)} h`,
    `• Horas acumuladas del incidente: ~${roundHoras(acumulado)} h`,
    `• Última Comunicación registrada: ${fmtDateShort(dispositivo.ultima_actualizacion)} (GMT-5)`,
    ...buildTemperaturasTexto(d),
    ...buildTrazabilidadText(trazabilidad),
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
<li><strong>Día de referencia (umbrales):</strong> ${diaCalendario} (GMT-5)</li>
${referenciaDesde ? `<li><strong>Inicio fuera de rango:</strong> ${formatDateTimeTz(referenciaDesde)} (GMT-5)</li>` : ''}
<li><strong>Horas en el día:</strong> ~${roundHoras(enDia)} h</li>
<li><strong>Horas acumuladas:</strong> ~${roundHoras(acumulado)} h</li>
<li><strong>Última comunicación:</strong> ${fmtDateShort(dispositivo.ultima_actualizacion)} (GMT-5)</li>
</ul>
${buildTemperaturasHtml(d)}
${buildTrazabilidadHtml(trazabilidad)}
<p>Atentamente,<br><strong>ZTRACK-ZGROUP</strong></p></body></html>`;

  return { subject, text, html };
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
    tipoEvento = 'operaciones',
    esPrueba = false,
    trazabilidad = null,
  } = params;

  const d = dispositivo.ultimo_dato ?? {};
  const acumulado = horasAcumuladas ?? horasApagado;
  const enDia = horasEnDia ?? horasApagado;
  const fechaAlerta = formatDateSubjectTz(new Date());
  const tipoAlarma = esPrueba ? 'APAGADO (PRUEBA)' : 'APAGADO';
  const tipoTxt = tipoEvento === 'mantenimiento' ? 'Mantenimiento' : 'Operaciones';
  const subject = `REEFER ${dispositivoReeferId} - ${nombrePlataforma} - ALERTA ${tipoAlarma} ${fechaAlerta}`;

  const tiempoTexto = buildTiempoAlertaTexto({
    umbralHoras,
    diaCalendario,
    hoy,
    horasEnDia: enDia,
    horasAcumuladas: acumulado,
    referenciaDesde,
    esPrueba,
    prefijoSimulacion: 'Simulación: equipo apagado más de',
    prefijoNormal: 'Equipo apagado (power_state 0) más de',
  });

  const intro = esPrueba
    ? 'Se envía este correo de PRUEBA de APAGADO generado por la plataforma ZTRACK.'
    : 'Se notifica la siguiente ALERTA APAGADO. El equipo está OFF; no se envía alerta de fuera de rango en paralelo.';

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
    `• Tiempo apagado: ${tiempoTexto}`,
    `• Día de referencia (umbrales): ${diaCalendario} (GMT-5)`,
    `• Inicio apagado (referencia): ${formatDateTimeTz(referenciaDesde)} (GMT-5)`,
    `• Horas en el día calendario: ~${roundHoras(enDia)} h`,
    `• Horas acumuladas del incidente: ~${roundHoras(acumulado)} h`,
    `• Última Comunicación registrada: ${fmtDateShort(dispositivo.ultima_actualizacion)} (GMT-5)`,
    ...buildTemperaturasTexto(d),
    '• Power state: APAGADO (0)',
    ...buildTrazabilidadText(trazabilidad),
    '',
    'Estado del equipo :',
    'El equipo se encuentra apagado. Las alertas de fuera de rango solo aplican cuando power_state = 1 (encendido).',
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
<li><strong>Tipo de Alarma:</strong> ${tipoAlarma}</li>
<li><strong>Tiempo apagado:</strong> ${tiempoTexto}</li>
<li><strong>Día de referencia (umbrales):</strong> ${diaCalendario} (GMT-5)</li>
<li><strong>Inicio apagado:</strong> ${formatDateTimeTz(referenciaDesde)} (GMT-5)</li>
<li><strong>Horas en el día:</strong> ~${roundHoras(enDia)} h</li>
<li><strong>Horas acumuladas:</strong> ~${roundHoras(acumulado)} h</li>
<li><strong>Última comunicación:</strong> ${fmtDateShort(dispositivo.ultima_actualizacion)} (GMT-5)</li>
</ul>
${buildTemperaturasHtml(d, ' · <strong>Power: APAGADO (0)</strong>')}
${buildTrazabilidadHtml(trazabilidad)}
<p>Atentamente,<br><strong>ZTRACK-ZGROUP</strong></p></body></html>`;

  return { subject, text, html };
}
