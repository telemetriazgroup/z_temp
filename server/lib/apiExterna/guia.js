function bloques(base) {
  const raiz = String(base || 'https://SU-SERVIDOR/reefer/api/v1').replace(/\/$/, '');
  return [
    {
      titulo: 'Qué es esta API',
      parrafos: [
        'ZTRACK entrega la telemetría de los reefer. El otro programa no llama a las fuentes de los equipos: llama a ZTRACK y con la respuesta arma su tabla y su gráfica.',
        'Hay dos clases de clave. La de una cuenta ve los equipos asignados a esa cuenta y no caduca sola. La demo la crea el superadmin, dura las horas o los días que él indique y solo ve los equipos que él eligió. Sirve para que un cliente pruebe la conexión o para una prueba de desarrollo.',
      ],
    },
    {
      titulo: 'Clave',
      parrafos: [
        'Cada solicitud lleva la clave. Sin ella la respuesta es 401. La clave se muestra una sola vez al crearla.',
        'Cuando la demo llega a su hora de vencimiento, la misma clave responde 401 con el texto «La conexión demo venció». Si el superadmin la revoca antes, deja de servir en el momento.',
      ],
      codigo: `curl -s -H "Authorization: Bearer CLAVE" \\\n  "${raiz}/equipos"\n\n# también vale:\ncurl -s -H "X-Api-Key: CLAVE" \\\n  "${raiz}/equipos"`,
    },
    {
      titulo: 'Tabla de equipos',
      parrafos: [
        'GET /equipos devuelve el último estado de cada equipo permitido. Use nombre, imei, origen, marca, conexion, encendido, set_point, suministro, retorno, en_rango, alarmas y ultima_lectura_lima para la tabla.',
        'conexion puede ser online, wait, offline o historial. encendido es on, off o null. Las temperaturas van en grados Celsius. ultima_lectura_lima es hora de Perú (America/Lima). ultima_lectura es UTC, por si el programa ya trabaja en UTC.',
      ],
      codigo: `{\n  "ok": true,\n  "zona_horaria": "America/Lima",\n  "resumen": { "total": 1, "online": 1, "encendidos": 1 },\n  "equipos": [\n    {\n      "imei": "860000000000001",\n      "origen": "TUNEL",\n      "marca": "Thermoking",\n      "nombre": "ZGRU0000000 CLIENTE EJEMPLO",\n      "conexion": "online",\n      "encendido": "on",\n      "ultima_lectura_lima": "2026-11-26 16:50",\n      "set_point": -20,\n      "suministro": -19.1,\n      "retorno": -18.4,\n      "en_rango": true,\n      "en_deshielo": false,\n      "alarmas": [{ "codigo": 2 }]\n    }\n  ]\n}`,
    },
    {
      titulo: 'Un equipo',
      parrafos: [
        'GET /equipos/{origen}/{imei} devuelve el mismo objeto dentro de equipo. El origen es TUNEL, TERMOKING, STARCOOL o STARCOOL2. Si el IMEI existe en dos orígenes, son dos equipos distintos y hay que pedir cada origen.',
        'Si la clave no tiene ese equipo, la respuesta es 404 «Equipo no disponible para esta cuenta». No indica si el IMEI existe en otra flota.',
      ],
      codigo: `curl -s -H "Authorization: Bearer CLAVE" \\\n  "${raiz}/equipos/TUNEL/860000000000001"`,
    },
    {
      titulo: 'Gráfica',
      parrafos: [
        'GET /equipos/{origen}/{imei}/historial devuelve una serie ordenada de tramas. Cada punto trae fecha (UTC) y fecha_lima, más set_point, suministro, retorno, ambiente, evaporador, encendido, en_rango y en_deshielo.',
        'Sin parámetros trae las últimas 12 horas. horas acepta de 1 a 168. desde y hasta aceptan YYYY-MM-DD HH:mm en hora Lima, o una fecha ISO. El rango máximo es 7 días. Si la serie es muy larga, recortado queda en true y total indica cuántas tramas había.',
      ],
      codigo: `curl -s -H "Authorization: Bearer CLAVE" \\\n  "${raiz}/equipos/TUNEL/860000000000001/historial?horas=12"\n\ncurl -s -H "Authorization: Bearer CLAVE" \\\n  "${raiz}/equipos/STARCOOL2/860000000000002/historial?desde=2026-11-26%2008:00&hasta=2026-11-26%2020:00"`,
    },
    {
      titulo: 'Límites y errores',
      parrafos: [
        '120 solicitudes por minuto y 30 historiales por minuto por clave. Al pasar el límite la respuesta es 429 e incluye reintentar_en_segundos.',
        '401 clave ausente, incorrecta, revocada o demo vencida. 403 la IP no está en la lista de esa clave. 400 origen, IMEI o fechas mal escritas. 404 equipo fuera de la clave. 405 cualquier método que no sea GET. 502 no se pudo leer el historial. 503 la flota no está disponible en ese momento.',
        'La API solo lee. No enciende equipos, no cambia setpoint y no abre las fuentes de telemetría.',
      ],
    },
  ];
}

export function guiaEstructurada(base) {
  return {
    titulo: 'Guía de uso de la API ZTRACK',
    base: String(base || '').replace(/\/$/, ''),
    secciones: bloques(base),
  };
}

export function guiaMarkdown(base) {
  const guia = guiaEstructurada(base);
  const partes = [`# ${guia.titulo}`, ''];
  if (guia.base) {
    partes.push(`Base: \`${guia.base}\``, '');
  }
  for (const seccion of guia.secciones) {
    partes.push(`## ${seccion.titulo}`, '');
    for (const parrafo of seccion.parrafos) partes.push(parrafo, '');
    if (seccion.codigo) partes.push('```', seccion.codigo, '```', '');
  }
  return partes.join('\n');
}
