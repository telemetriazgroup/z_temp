/** Convierte una imagen de archivo a data-URL JPEG cuadrada (máx. side px). */
export async function fileToAvatarDataUrl(
  file: File,
  { maxSide = 256, quality = 0.85, maxBytes = 180_000 } = {}
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Seleccione un archivo de imagen (JPG, PNG o WebP)');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('La imagen no debe superar 8 MB');
  }

  const bitmap = await createImageBitmap(file);
  const side = Math.min(maxSide, Math.max(bitmap.width, bitmap.height));
  const scale = Math.min(side / bitmap.width, side / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo procesar la imagen');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let q = quality;
  let dataUrl = canvas.toDataURL('image/jpeg', q);
  while (dataUrl.length > maxBytes && q > 0.4) {
    q -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', q);
  }
  if (dataUrl.length > maxBytes * 1.2) {
    throw new Error('No se pudo comprimir la imagen lo suficiente');
  }
  return dataUrl;
}
