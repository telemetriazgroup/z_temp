export function digitosTelefono(valor: string) {
  return String(valor || '').replace(/\D/g, '');
}

export function formatoTelefono(valor: string) {
  const digitos = digitosTelefono(valor);
  if (digitos.startsWith('51') && digitos.length === 11) {
    return `+51 ${digitos.slice(2, 5)} ${digitos.slice(5, 8)} ${digitos.slice(8)}`;
  }
  return digitos ? `+${digitos}` : '';
}

type Trozo = { t: string; bold?: boolean };
type Palabra = { t: string; bold?: boolean; w: number };

function envolver(ctx: CanvasRenderingContext2D, texto: string, max: number) {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const lineas: string[] = [];
  let actual = '';
  for (const palabra of palabras) {
    const siguiente = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(siguiente).width > max && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = siguiente;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [''];
}

function partir(ctx: CanvasRenderingContext2D, trozos: Trozo[], max: number, size: number) {
  const palabras: Palabra[] = [];
  for (const trozo of trozos) {
    for (const palabra of trozo.t.split(/\s+/).filter(Boolean)) {
      ctx.font = `${trozo.bold ? '700 ' : ''}${size}px Segoe UI, sans-serif`;
      palabras.push({ t: palabra, bold: trozo.bold, w: ctx.measureText(`${palabra} `).width });
    }
  }
  const lineas: Palabra[][] = [];
  let linea: Palabra[] = [];
  let ancho = 0;
  for (const palabra of palabras) {
    if (ancho + palabra.w > max && linea.length) {
      lineas.push(linea);
      linea = [];
      ancho = 0;
    }
    linea.push(palabra);
    ancho += palabra.w;
  }
  if (linea.length) lineas.push(linea);
  return lineas;
}

function dibujarRico(
  ctx: CanvasRenderingContext2D,
  trozos: Trozo[],
  x: number,
  y: number,
  max: number,
  size: number,
  color: string,
  alto: number,
) {
  const lineas = partir(ctx, trozos, max, size);
  lineas.forEach((linea, i) => {
    let dx = x;
    for (const palabra of linea) {
      ctx.font = `${palabra.bold ? '700 ' : ''}${size}px Segoe UI, sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(palabra.t, dx, y + i * alto);
      dx += ctx.measureText(`${palabra.t} `).width;
    }
  });
  return lineas.length * alto;
}

function redondear(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tituloPaso(ctx: CanvasRenderingContext2D, n: number, titulo: string, x: number, y: number) {
  ctx.fillStyle = '#075e54';
  ctx.beginPath();
  ctx.arc(x + 14, y + 14, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 14px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x + 14, y + 15);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#0f2744';
  ctx.font = '700 20px Segoe UI, sans-serif';
  ctx.fillText(titulo, x + 36, y + 20);
}

function burbuja(
  ctx: CanvasRenderingContext2D,
  textos: string[],
  x: number,
  y: number,
  ancho: number,
  mia: boolean,
) {
  ctx.font = '15px Segoe UI, sans-serif';
  const maxTexto = Math.max(80, ancho - 36);
  const lineas = textos.flatMap((texto) => envolver(ctx, texto, maxTexto));
  const anchoTexto = Math.max(...lineas.map((linea) => ctx.measureText(linea).width), 16);
  const w = Math.min(ancho - 8, anchoTexto + 20);
  const h = 16 + lineas.length * 20;
  const izquierda = mia ? x + ancho - w - 4 : x + 4;
  ctx.fillStyle = mia ? '#d9fdd3' : '#ffffff';
  redondear(ctx, izquierda, y, w, h, 10);
  ctx.fill();
  ctx.fillStyle = '#0f2744';
  ctx.font = '15px Segoe UI, sans-serif';
  lineas.forEach((linea, i) => ctx.fillText(linea, izquierda + 10, y + 20 + i * 20));
  return h + 8;
}

function altoBurbuja(ctx: CanvasRenderingContext2D, textos: string[], ancho: number) {
  ctx.font = '15px Segoe UI, sans-serif';
  const maxTexto = Math.max(80, ancho - 36);
  const lineas = textos.flatMap((texto) => envolver(ctx, texto, maxTexto));
  return 16 + lineas.length * 20 + 8;
}

export function imagenGuiaAsistente(numero: string): Promise<Blob> {
  const visible = formatoTelefono(numero) || numero.trim();
  const mencion = '@asistente_desarrollo';
  const ancho = 1080;
  const margen = 36;
  const gap = 16;
  const col = (ancho - margen * 2 - gap) / 2;
  const escala = 2;
  const sonda = document.createElement('canvas').getContext('2d');
  if (!sonda) return Promise.reject(new Error('No se pudo preparar la imagen'));

  const intro = `Etiqueta a ${mencion} y dile qué equipo quieres. Solo busca entre los equipos de este grupo.`;
  sonda.font = '18px Segoe UI, sans-serif';
  const introAlto = envolver(sonda, intro, ancho - margen * 2).length * 24;
  const p1 = 'En el grupo, etiqueta al asistente y escribe el pedido en el mismo mensaje. Puedes usar el ZGRU, el nombre o la cotización.';
  const p2 = 'El asistente saluda y envía la gráfica de las últimas 12 horas. No muestra un menú: ya encontró el equipo.';
  const p3: Trozo[] = [
    { t: 'El asistente lista' },
    { t: 'hasta 5,', bold: true },
    { t: 'de la más parecida a la menos. Responde' },
    { t: 'sin volver a etiquetarlo:', bold: true },
    { t: 'escribe el número o el ZGRU.' },
  ];
  const p4: Trozo[] = [
    { t: 'Escribe otra pista. Sirve' },
    { t: 'la cotización, el nombre u otro ZGRU.', bold: true },
    { t: 'La cotización empieza por 100, por ejemplo 10020264035.' },
  ];
  const p5: Trozo[] = [
    { t: 'Si no escribes en' },
    { t: '5 minutos,', bold: true },
    { t: 'la conversación se cierra sola. Para preguntar de nuevo,' },
    { t: 'vuelve a etiquetar al asistente.', bold: true },
  ];
  const p6: Trozo[] = [
    { t: 'Ya asimilamos varios equipos para la' },
    { t: 'alerta automática.', bold: true },
    { t: 'Algunos pueden no estar todavía: el equipo de desarrollo está integrando más equipos a esa respuesta. En la alerta se etiqueta a las personas marcadas.' },
  ];

  const altoParrafo = (trozos: Trozo[], max: number) => partir(sonda, trozos, max, 16).length * 22;
  const chatAncho = col - 36;
  const chat3 = ancho - margen * 2 - 36;
  const ejemplos = 16 + 4 * 20;
  const chat2 =
    24 +
    altoBurbuja(sonda, [`${mencion} ZGRU1047392 DONOFRIO PVEA COMAS`], chatAncho) +
    altoBurbuja(sonda, ['Buenos días Jorge', 'Gráfica de 12 h de ZGRU1047392 DONOFRIO PVEA COMAS.'], chatAncho);
  const fila1 = Math.max(
    16 + 36 + altoParrafo([{ t: p1 }], col - 36) + 8 + ejemplos + 16,
    16 + 36 + altoParrafo([{ t: p2 }], col - 36) + 8 + chat2 + 8,
  );
  const opciones = [
    '¿De cuál quiere ver la gráfica? Indique el ZGRU o el número del 1 al 4.',
    '1. ZGRU1047392 · DONOFRIO PVEA COMAS',
    '2. ZGRU2206118 · MAKRO Santa Anita',
    '3. ZGRU1186255 · REDONDOS Huancayo',
    '4. ZGRU3094410 · San Fernando Ate',
  ];
  const chatOpciones =
    24 +
    altoBurbuja(sonda, opciones, chat3) +
    altoBurbuja(sonda, ['2'], chat3) +
    altoBurbuja(sonda, ['o también: ZGRU5014460'], chat3);
  const fila3 = 16 + 36 + altoParrafo(p3, chat3) + 8 + chatOpciones + 8;
  const fila45 = Math.max(
    16 + 36 + altoParrafo(p4, col - 36) + 16,
    16 + 36 + altoParrafo(p5, col - 36) + 16,
  );
  const fila6 = 16 + 36 + altoParrafo(p6, chat3) + 16;
  const alto = 36 + 28 + 40 + introAlto + 16 + 118 + 16 + fila1 + 16 + fila3 + 16 + fila45 + 16 + fila6 + 16 + 56 + 28;

  const canvas = document.createElement('canvas');
  canvas.width = ancho * escala;
  canvas.height = alto * escala;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('No se pudo preparar la imagen'));
  ctx.scale(escala, escala);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e8eef5';
  ctx.fillRect(0, 0, ancho, alto);
  ctx.fillStyle = '#f7fafc';
  ctx.fillRect(0, 0, ancho, alto);

  let y = 36;
  ctx.fillStyle = '#075e54';
  ctx.font = '700 13px Segoe UI, sans-serif';
  ctx.fillText('ZTRACK  ·  ASISTENTE DE DESARROLLO', margen, y + 12);
  y += 28;
  ctx.fillStyle = '#0f2744';
  ctx.font = '700 34px Segoe UI, sans-serif';
  ctx.fillText('Cómo pedirle la gráfica', margen, y + 28);
  y += 40;
  ctx.font = '18px Segoe UI, sans-serif';
  ctx.fillStyle = '#35516e';
  envolver(ctx, intro, ancho - margen * 2).forEach((linea, i) => ctx.fillText(linea, margen, y + 16 + i * 24));
  y += introAlto;
  ctx.fillStyle = '#075e54';
  ctx.fillRect(margen, y + 10, ancho - margen * 2, 3);
  y += 22;

  ctx.fillStyle = '#e7f6ef';
  redondear(ctx, margen, y, ancho - margen * 2, 108, 14);
  ctx.fill();
  ctx.fillStyle = '#075e54';
  ctx.font = '700 15px Segoe UI, sans-serif';
  ctx.fillText('Agregue este número y guárdelo como asistente_desarrollo', margen + 16, y + 26);
  ctx.fillStyle = '#0f2744';
  ctx.font = '700 46px Segoe UI, sans-serif';
  ctx.fillText(visible, margen + 16, y + 78);
  ctx.fillStyle = '#35516e';
  ctx.font = '16px Segoe UI, sans-serif';
  ctx.fillText(`En el grupo se invoca como ${mencion}`, margen + 16, y + 100);
  y += 124;

  const tarjeta = (x: number, top: number, w: number, h: number) => {
    ctx.fillStyle = '#ffffff';
    redondear(ctx, x, top, w, h, 16);
    ctx.fill();
    ctx.strokeStyle = '#d5e2ee';
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  tarjeta(margen, y, col, fila1);
  tarjeta(margen + col + gap, y, col, fila1);
  let contenido = y + 16;
  tituloPaso(ctx, 1, 'Invócalo', margen + 16, contenido);
  dibujarRico(ctx, [{ t: p1 }], margen + 16, contenido + 44, col - 36, 16, '#0f2744', 22);
  const ejY = contenido + 44 + altoParrafo([{ t: p1 }], col - 36) + 8;
  ctx.fillStyle = '#e7f6ef';
  redondear(ctx, margen + 16, ejY, col - 32, ejemplos, 12);
  ctx.fill();
  const ejemplosLineas = [
    [`${mencion} ZGRU1047392 `, 'DONOFRIO PVEA COMAS'],
    [`${mencion} ZGRU2206118 `, 'MAKRO Santa Anita'],
    [`${mencion} ZGRU1186255 `, 'REDONDOS Huancayo'],
    [`${mencion} ZGRU3094410 `, 'San Fernando Ate'],
  ];
  ejemplosLineas.forEach(([antes, destaque], i) => {
    const yy = ejY + 20 + i * 20;
    ctx.font = '13px Segoe UI, sans-serif';
    ctx.fillStyle = '#0f2744';
    ctx.fillText(antes, margen + 28, yy);
    const dx = ctx.measureText(antes).width;
    ctx.font = '700 13px Segoe UI, sans-serif';
    ctx.fillStyle = '#075e54';
    ctx.fillText(destaque, margen + 28 + dx, yy);
  });

  const x2 = margen + col + gap;
  tituloPaso(ctx, 2, 'Si hay un solo equipo', x2 + 16, contenido);
  dibujarRico(ctx, [{ t: p2 }], x2 + 16, contenido + 44, col - 36, 16, '#0f2744', 22);
  const chatY = contenido + 44 + altoParrafo([{ t: p2 }], col - 36) + 8;
  ctx.fillStyle = '#ece5dd';
  redondear(ctx, x2 + 16, chatY, col - 32, chat2, 14);
  ctx.fill();
  let by = chatY + 12;
  by += burbuja(ctx, [`${mencion} ZGRU1047392 DONOFRIO PVEA COMAS`], x2 + 16, by, col - 32, true);
  burbuja(ctx, ['Buenos días Jorge', 'Gráfica de 12 h de ZGRU1047392 DONOFRIO PVEA COMAS.'], x2 + 16, by, col - 32, false);
  y += fila1 + 16;

  tarjeta(margen, y, ancho - margen * 2, fila3);
  tituloPaso(ctx, 3, 'Si hay varias opciones, elige una', margen + 16, y + 16);
  dibujarRico(ctx, p3, margen + 16, y + 60, chat3, 16, '#0f2744', 22);
  const chat3Y = y + 60 + altoParrafo(p3, chat3) + 8;
  ctx.fillStyle = '#ece5dd';
  redondear(ctx, margen + 16, chat3Y, chat3, chatOpciones, 14);
  ctx.fill();
  let oy = chat3Y + 12;
  oy += burbuja(ctx, opciones, margen + 16, oy, chat3, false);
  oy += burbuja(ctx, ['2'], margen + 16, oy, chat3, true);
  burbuja(ctx, ['o también: ZGRU2206118'], margen + 16, oy, chat3, true);
  y += fila3 + 16;

  tarjeta(margen, y, col, fila45);
  tarjeta(margen + col + gap, y, col, fila45);
  tituloPaso(ctx, 4, 'Si no lo encuentra', margen + 16, y + 16);
  dibujarRico(ctx, p4, margen + 16, y + 60, col - 36, 16, '#0f2744', 22);
  tituloPaso(ctx, 5, 'Tienes 5 minutos', x2 + 16, y + 16);
  dibujarRico(ctx, p5, x2 + 16, y + 60, col - 36, 16, '#0f2744', 22);
  y += fila45 + 16;

  tarjeta(margen, y, ancho - margen * 2, fila6);
  tituloPaso(ctx, 6, 'Alerta automática y saludo', margen + 16, y + 16);
  dibujarRico(ctx, p6, margen + 16, y + 60, chat3, 16, '#0f2744', 22);
  y += fila6 + 16;

  ctx.fillStyle = '#0f2744';
  redondear(ctx, margen, y, ancho - margen * 2, 46, 14);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px Segoe UI, sans-serif';
  ctx.fillText(
    'Un ZGRU exacto trae la gráfica al momento. Varias coincidencias: responda 1, 2, 3, 4 o 5, o el ZGRU.',
    margen + 16,
    y + 29,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen'))), 'image/png');
  });
}
