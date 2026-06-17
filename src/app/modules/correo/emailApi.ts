import type { SendEmailPayload, SendEmailResult } from './types';

const SEND_URL =
  import.meta.env.VITE_CORREO_API_URL ?? '/reefer/api/correo/send';

export async function sendEmailViaApi(payload: SendEmailPayload): Promise<SendEmailResult> {
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let body: SendEmailResult & { message?: string };
  try {
    body = (await res.json()) as SendEmailResult & { message?: string };
  } catch {
    throw new Error(
      res.ok
        ? 'Respuesta inválida del servidor de correo'
        : `Error ${res.status} al contactar el servidor de correo`
    );
  }

  if (!res.ok || body.ok === false) {
    throw new Error(body.error ?? body.message ?? `Error ${res.status} al enviar correo`);
  }

  return body;
}
