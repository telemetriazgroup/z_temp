import React, { useEffect, useState } from 'react';
import { fetchAyudaSoporte, defaultAyudaSoporteContent } from '../modules/ayuda';
import { MessageCircle } from 'lucide-react';
import { cn } from './ui/utils';

function waHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

/** Botón flotante de WhatsApp (esquina inferior derecha) → número de Ayuda/Soporte. */
export function WhatsAppFloatingButton() {
  const [href, setHref] = useState<string | null>(() =>
    waHref(defaultAyudaSoporteContent().contacto.whatsapp)
  );
  const [label, setLabel] = useState('WhatsApp soporte');

  useEffect(() => {
    let cancelled = false;
    void fetchAyudaSoporte()
      .then((data) => {
        if (cancelled) return;
        const next = waHref(data.contacto.whatsapp);
        setHref(next);
        setLabel(data.contacto.whatsappLabel?.trim() || 'WhatsApp soporte');
      })
      .catch(() => {
        /* mantener default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className={cn(
        'fixed z-[60] bottom-5 right-5 sm:bottom-6 sm:right-6',
        'flex h-14 w-14 items-center justify-center rounded-full',
        'bg-[#25D366] text-white shadow-lg',
        'hover:bg-[#1ebe57] hover:scale-105',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2',
        'transition-transform duration-200'
      )}
    >
      <MessageCircle className="h-7 w-7" strokeWidth={2.25} fill="currentColor" />
      <span className="sr-only">{label}</span>
    </a>
  );
}
