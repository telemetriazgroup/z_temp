import { horasSinComunicacion } from '../enlaceCaido.js';

const HORAS_COBERTURA = 2;

/** Cobertura inestable solo si lleva más de 2 horas sin información nueva. */
export function marcaCobertura(dispositivo, now = new Date()) {
  const base = dispositivo?._flota || dispositivo || {};
  const estado = String(base.estado_conexion || dispositivo?.estado_conexion || '').toLowerCase();
  const horas = horasSinComunicacion(base.ultima_actualizacion ? base : dispositivo, now);
  const since = base.ultima_actualizacion || dispositivo?.ultima_actualizacion || null;
  return {
    inestable: horas != null && horas > HORAS_COBERTURA,
    estado,
    horas,
    since,
  };
}

export function horasTexto(horas) {
  const n = Number(horas);
  if (!Number.isFinite(n)) return 'sin marca de tiempo';
  if (n < 1) return `${Math.max(1, Math.round(n * 60))} min`;
  return `${Math.round(n * 10) / 10} h`;
}

/**
 * La misma regla con la que el asistente avisa o se queda callado.
 * `pronto` es cuando ya pasó tres cuartos del umbral.
 */
export function decisionDeAlerta({ condicion, horas, umbral, enVentana, yaEnviado, suspendida }) {
  if (suspendida) {
    return { enviar: false, pronto: false, motivo: 'La alerta de este equipo está suspendida.' };
  }
  if (!condicion) {
    return {
      enviar: false,
      pronto: false,
      motivo: 'Sin condición de alerta: el enlace es reciente y no hay apagado ni salida de rango.',
    };
  }
  if (!enVentana) {
    return { enviar: false, pronto: false, motivo: 'Fuera del horario en que este grupo avisa solo.' };
  }
  const umbralN = Number(umbral);
  const horasN = Number(horas);
  if (!Number.isFinite(horasN)) {
    return { enviar: false, pronto: false, motivo: 'Hay una condición, pero no hay hora de inicio para medir el umbral.' };
  }
  if (!(horasN >= umbralN)) {
    const pronto = umbralN > 0 && horasN / umbralN >= 0.75;
    return {
      enviar: false,
      pronto,
      motivo: `Lleva ${horasTexto(horasN)} y el umbral de este grupo es ${umbralN} h.`,
    };
  }
  if (yaEnviado) {
    return {
      enviar: false,
      pronto: false,
      motivo: 'Ya se avisó en esta hora. Si sigue igual, el siguiente aviso es en la hora siguiente.',
    };
  }
  return {
    enviar: true,
    pronto: false,
    motivo: `Lleva ${horasTexto(horasN)} y supera el umbral de ${umbralN} h. Corresponde avisar.`,
  };
}

export function textoCoberturaInestable(since, now = new Date()) {
  let cuando = '';
  const fecha = since ? new Date(since) : null;
  if (fecha && !Number.isNaN(fecha.getTime())) {
    const texto = new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(fecha);
    cuando = ` desde ${texto}`;
  }
  return `Cobertura inestable. No se tiene información actualizada del equipo${cuando}. La gráfica muestra las últimas 12 horas que el equipo sí transmitió.`;
}
