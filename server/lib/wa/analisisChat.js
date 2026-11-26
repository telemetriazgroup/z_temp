import {
  computeApagadoIntervals,
  computeOutOfRangeIntervals,
  rowEnRangoTemperaturaParaAlerta,
  timestampRegistroHistorial,
} from '../historicalTelemetry.js';
import { clasificarDefrostEnFilas } from '../analisis/defrostAlerta.js';
import { powerStateEfectivo } from '../powerEfectivo.js';
import { etiqueta } from './equiposCuenta.js';
import {
  bandaNormal,
  fechaCorta,
  filasHistorial,
  fmtNumero,
  lineaRangoNormal,
  marcaDe,
  pieMenu,
} from './consultaEquipo.js';
import {
  compresorAlto,
  esTermokingOTunel,
  evaporadorSaturado,
  HORAS_COMPRESOR,
  HORAS_EVAPORADOR,
} from '../sensoresAlerta.js';

function horasTexto(h) {
  if (h == null || Number.isNaN(h)) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${Math.round(h * 10) / 10} h`;
}

function episodioActual(intervalos) {
  return intervalos.find((it) => it.until == null) ?? null;
}

function franja(iso) {
  const texto = fechaCorta(iso);
  const hora = Number(texto.slice(11, 13));
  if (!Number.isFinite(hora)) return null;
  const desde = Math.floor(hora / 3) * 3;
  const hasta = desde + 3;
  return `${String(desde).padStart(2, '0')}:00–${String(hasta).padStart(2, '0')}:00`;
}

function patronDe(intervalos) {
  const cuentas = new Map();
  for (const it of intervalos) {
    const f = franja(it.since);
    if (!f) continue;
    cuentas.set(f, (cuentas.get(f) || 0) + 1);
  }
  let mejor = null;
  for (const [f, n] of cuentas) {
    if (!mejor || n > mejor.n) mejor = { f, n };
  }
  if (!mejor || mejor.n < 2 || intervalos.length < 2) return null;
  if (mejor.n / intervalos.length < 0.5) return null;
  return `Suele salir de rango entre las ${mejor.f} (${mejor.n} de ${intervalos.length} episodios).`;
}

function filaCercana(filas, iso) {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return null;
  let mejor = null;
  let dist = Infinity;
  for (const row of filas) {
    const t = timestampRegistroHistorial(row);
    if (Number.isNaN(t)) continue;
    const d = Math.abs(t - target);
    if (d < dist) {
      dist = d;
      mejor = row;
    }
  }
  if (!mejor || dist > 20 * 60 * 1000) return null;
  return mejor;
}

function fraseCruce(filas, sinceIso, banda) {
  const row = filaCercana(filas, sinceIso);
  if (!row) return '';
  const ret = Number(row.return_air);
  const set = Number(row.set_point);
  if (!Number.isFinite(ret)) return '';
  if (!Number.isFinite(set)) return ` El retorno detectado fue *${fmtNumero(ret)}* °C.`;
  const bajo = Math.round((set - banda.min) * 10) / 10;
  const alto = Math.round((set + banda.max) * 10) / 10;
  const lado = ret < bajo ? 'por debajo del mínimo' : ret > alto ? 'por encima del máximo' : 'fuera de la banda';
  return ` El retorno detectado fue *${fmtNumero(ret)}* °C, ${lado}. En ese momento lo normal era *${fmtNumero(bajo)}* a *${fmtNumero(alto)}* °C.`;
}

function rachaActual(filas, pred) {
  const orden = [...filas]
    .map((row) => ({ row, t: timestampRegistroHistorial(row) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);
  if (!orden.length || !pred(orden[orden.length - 1].row)) return null;
  let i = orden.length - 1;
  while (i > 0 && pred(orden[i - 1].row)) i -= 1;
  return {
    horas: (orden[orden.length - 1].t - orden[i].t) / 3600000,
    since: new Date(orden[i].t).toISOString(),
    row: orden[orden.length - 1].row,
  };
}

function lineasSensores(filas, codigo) {
  const lineas = [];
  const eva = rachaActual(filas, (row) => evaporadorSaturado(row.set_point, row.evaporation_coil));
  if (eva && eva.horas >= HORAS_EVAPORADOR) {
    const actual = Number(eva.row.evaporation_coil);
    const set = Number(eva.row.set_point);
    lineas.push(
      `Evaporador saturado, posible obstrucción por hielo, desde ${fechaCorta(eva.since)} (${horasTexto(eva.horas)}).` +
        (Number.isFinite(actual)
          ? ` Ahora el evaporador está en *${fmtNumero(actual)}* °C${Number.isFinite(set) ? ` y el set en *${fmtNumero(set)}* °C` : ''}.`
          : '') +
        ' Conviene realizar defrost.'
    );
  }
  if (esTermokingOTunel(codigo)) {
    const comp = rachaActual(filas, (row) => compresorAlto(row.compress_coil_1));
    if (comp && comp.horas >= HORAS_COMPRESOR) {
      const actual = Number(comp.row.compress_coil_1);
      lineas.push(
        `Temperatura alta de compresor desde ${fechaCorta(comp.since)} (${horasTexto(comp.horas)}).` +
          (Number.isFinite(actual) ? ` Ahora está en *${fmtNumero(actual)}* °C.` : '')
      );
    }
  }
  return lineas;
}

function filaConCodigo(row, codigo) {
  const power = powerStateEfectivo(row, codigo);
  return {
    ...row,
    codigo: row.codigo || codigo,
    power_state: power == null ? row.power_state : power,
  };
}

export async function textoAnalisis(e, username) {
  const marca = marcaDe(e.codigo);
  const banda = bandaNormal(e, username);
  const rangoOpts = banda.opts;
  const doce = await filasHistorial(e, 12);
  const filas12 = doce.filas.map((row) => filaConCodigo(row, e.codigo));
  const ahora = new Date();
  const fuera12 = computeOutOfRangeIntervals(filas12, rangoOpts, ahora, rowEnRangoTemperaturaParaAlerta);
  const apagado12 = computeApagadoIntervals(filas12, ahora, e.codigo);
  let abierto = episodioActual(fuera12);
  const off = episodioActual(apagado12);
  const inicioVentana = filas12.reduce((m, row) => {
    const t = timestampRegistroHistorial(row);
    return Number.isNaN(t) ? m : Math.min(m, t);
  }, Infinity);
  const cortaEnElBorde =
    abierto &&
    Number.isFinite(inicioVentana) &&
    new Date(abierto.since).getTime() - inicioVentana < 20 * 60 * 1000;
  const ultima = filas12.reduce((best, row) => {
    const t = timestampRegistroHistorial(row);
    if (Number.isNaN(t)) return best;
    if (!best || t > best.t) return { t, row };
    return best;
  }, null)?.row;
  const energia = ultima ? powerStateEfectivo(ultima, e.codigo) : null;

  let tres = null;
  let fuera3 = [];
  let filas3 = [];
  if (cortaEnElBorde || (abierto && abierto.durationHours > 12)) {
    tres = await filasHistorial(e, 72);
    filas3 = tres.filas.map((row) => filaConCodigo(row, e.codigo));
    fuera3 = computeOutOfRangeIntervals(filas3, rangoOpts, ahora, rowEnRangoTemperaturaParaAlerta);
    const real = episodioActual(fuera3);
    if (real) abierto = real;
  }

  const setActual = ultima ? Number(ultima.set_point) : null;
  const retActual = ultima ? Number(ultima.return_air) : null;
  const filasDelCruce = filas3.length ? filas3 : filas12;
  const lineas = [
    `*${etiqueta(e)}* · análisis`,
    marca ? `Marca ${marca}` : null,
    lineaRangoNormal(Number.isFinite(setActual) ? setActual : null, banda),
    Number.isFinite(retActual) ? `Retorno actual: *${fmtNumero(retActual)}* °C.` : null,
    energia === 0 ? 'Ahora está *apagado*.' : energia === 1 ? 'Ahora está *encendido*.' : 'No pude confirmar si está encendido.',
  ];
  if (off) {
    lineas.push(`Apagado desde ${fechaCorta(off.since)} (${horasTexto(off.durationHours)}).`);
  }
  if (abierto) {
    lineas.push(
      `Fuera de rango desde ${fechaCorta(abierto.since)} (${horasTexto(abierto.durationHours)}).${fraseCruce(filasDelCruce, abierto.since, banda)}`
    );
  } else if (filas12.length) {
    const cerrado = [...fuera12].reverse().find((it) => it.until);
    lineas.push(
      cerrado
        ? `En las últimas 12 h estuvo fuera de rango de ${fechaCorta(cerrado.since)} a ${fechaCorta(cerrado.until)}.${fraseCruce(filas12, cerrado.since, banda)} Ahora está en rango.`
        : 'En las últimas 12 h no veo un tramo fuera de rango. Ahora está en rango.'
    );
  } else {
    lineas.push('No hay lecturas de las últimas 12 h para evaluar el rango.');
  }

  if (abierto && abierto.durationHours > 12 && tres) {
    const off3 = computeApagadoIntervals(filas3, ahora, e.codigo);
    lineas.push('', 'Lleva más de 12 h fuera de rango. Reviso los últimos 3 días.');
    lineas.push(`Episodios fuera de rango: ${fuera3.length}.`);
    const largos = [...fuera3].sort((a, b) => b.durationHours - a.durationHours).slice(0, 3);
    for (const it of largos) {
      const fin = it.until ? fechaCorta(it.until) : 'sigue';
      lineas.push(`• ${fechaCorta(it.since)} → ${fin} (${horasTexto(it.durationHours)}).${fraseCruce(filas3, it.since, banda)}`);
    }
    const patron = patronDe(fuera3);
    if (patron) lineas.push(patron);
    else if (fuera3.length <= 1) lineas.push('No se repite: es un solo tramo continuo, no un patrón de varias salidas.');
    const offs = off3.filter((it) => it.durationHours >= 0.5);
    if (offs.length) {
      lineas.push(`También estuvo apagado ${offs.length} vez/veces en esos 3 días.`);
    }
    lineas.push(`Fuente: ${tres.origen}.`);
  } else {
    lineas.push(`Fuente de las 12 h: ${doce.origen}.`);
  }

  const filasSensor = filas3.length ? filas3 : filas12;
  lineas.push(...lineasSensores(filasSensor, e.codigo));

  lineas.push('', pieMenu());
  return lineas.filter((x) => x != null).join('\n');
}

/** Por encima de esto el condensador se comenta al especialista. */
const CONDENSADOR_ALTO = 65;

function diaLima(fecha) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

function horaLimaCorta(fecha) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(fecha);
}

export function horaConversada(iso, now = new Date()) {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'hace un momento';
  const cuando = new Date(ms);
  const hm = horaLimaCorta(cuando);
  const ese = diaLima(cuando);
  const hoy = diaLima(now);
  if (ese === hoy) return `las ${hm}`;
  const ayer = diaLima(new Date(now.getTime() - 24 * 3600000));
  if (ese === ayer) return `ayer a las ${hm}`;
  const fecha = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: 'numeric',
    month: 'long',
  }).format(cuando);
  return `el ${fecha} a las ${hm}`;
}

function unirNovedades(partes) {
  if (partes.length === 1) return partes[0];
  if (partes.length === 2) return `${partes[0]} y ${partes[1]}`;
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/**
 * Texto del grupo, para quien ya conoce el reefer.
 * Si todo está bien, no alarma. Si algo falla, dice desde cuándo.
 */
export function narrarEstadoGrupo(estado, now = new Date()) {
  if (estado?.sinLecturas) {
    return {
      hayNovedad: false,
      texto: 'No tengo lecturas de las últimas 12 horas para decir cómo viene.',
    };
  }
  if (estado?.sinComunicacion) {
    return {
      hayNovedad: true,
      texto: `No está comunicando desde ${horaConversada(estado.sinComunicacion, now)}.`,
    };
  }
  const novedades = [];
  if (estado?.fueraDesde) {
    novedades.push(`el retorno está fuera de rango desde ${horaConversada(estado.fueraDesde, now)}`);
  }
  if (estado?.evaporador?.since) {
    const defrost = Number(estado.evaporador.horas) >= HORAS_EVAPORADOR ? '; conviene hacer defrost' : '';
    novedades.push(`el evaporador está saturado desde ${horaConversada(estado.evaporador.since, now)}${defrost}`);
  }
  if (estado?.condensador?.since) {
    novedades.push(`el condensador está alto desde ${horaConversada(estado.condensador.since, now)}`);
  }
  if (estado?.compresor?.since) {
    novedades.push(`el compresor está muy caliente desde ${horaConversada(estado.compresor.since, now)}`);
  }
  const encendido =
    estado?.energia === 0
      ? estado.apagadoDesde
        ? `Está apagado desde ${horaConversada(estado.apagadoDesde, now)}.`
        : 'Está apagado.'
      : estado?.energia === 1
        ? 'Está encendido.'
        : 'No pude confirmar si está encendido.';
  if (!novedades.length) {
    if (estado?.energia === 0) return { hayNovedad: true, texto: encendido };
    return { hayNovedad: false, texto: `${encendido} En estas 12 horas todo está normal.` };
  }
  const detalle = unirNovedades(novedades);
  const frase = detalle.charAt(0).toUpperCase() + detalle.slice(1);
  return { hayNovedad: true, texto: `${encendido} ${frase}.` };
}

export async function relatoParaGrupo(e) {
  const banda = bandaNormal(e, null);
  const doce = await filasHistorial(e, 12);
  let filas = (doce.filas || []).map((row) => filaConCodigo(row, e.codigo));
  if (!filas.length) return narrarEstadoGrupo({ sinLecturas: true });
  const ahora = new Date();
  let fuera = computeOutOfRangeIntervals(filas, banda.opts, ahora, rowEnRangoTemperaturaParaAlerta);
  let abierto = episodioActual(fuera);
  const inicioVentana = filas.reduce((m, row) => {
    const t = timestampRegistroHistorial(row);
    return Number.isNaN(t) ? m : Math.min(m, t);
  }, Infinity);
  const cortaEnElBorde =
    abierto &&
    Number.isFinite(inicioVentana) &&
    new Date(abierto.since).getTime() - inicioVentana < 20 * 60 * 1000;
  if (cortaEnElBorde || (abierto && abierto.durationHours > 12)) {
    const tres = await filasHistorial(e, 72);
    const filas3 = (tres.filas || []).map((row) => filaConCodigo(row, e.codigo));
    if (filas3.length) {
      filas = filas3;
      fuera = computeOutOfRangeIntervals(filas, banda.opts, ahora, rowEnRangoTemperaturaParaAlerta);
      const real = episodioActual(fuera);
      if (real) abierto = real;
    }
  }
  let fueraDesde = abierto?.since || null;
  if (abierto?.since) {
    const aj = clasificarDefrostEnFilas(filas, abierto.since, ahora);
    if (aj.pausar) fueraDesde = null;
    else if (!aj.falso && aj.fueraDesde) fueraDesde = aj.fueraDesde;
  }
  const apagado = episodioActual(computeApagadoIntervals(filas, ahora, e.codigo));
  const ultima = [...filas].reverse().find((row) => Number.isFinite(timestampRegistroHistorial(row)));
  const energia = ultima ? powerStateEfectivo(ultima, e.codigo) : null;
  const evaporador = rachaActual(filas, (row) => evaporadorSaturado(row.set_point, row.evaporation_coil));
  const condensador = rachaActual(filas, (row) => Number(row.condensation_coil) >= CONDENSADOR_ALTO);
  const compresor = esTermokingOTunel(e.codigo)
    ? rachaActual(filas, (row) => compresorAlto(row.compress_coil_1))
    : null;
  return narrarEstadoGrupo(
    {
      energia,
      apagadoDesde: apagado?.since || null,
      fueraDesde,
      evaporador: evaporador ? { since: evaporador.since, horas: evaporador.horas } : null,
      condensador: condensador ? { since: condensador.since } : null,
      compresor: compresor ? { since: compresor.since } : null,
    },
    ahora
  );
}
