import React from 'react';
import { Languages } from 'lucide-react';
import { useLocale } from '../i18n';
import type { AppLocale } from '../i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { cn } from './ui/utils';

type Props = {
  className?: string;
  /** Compact trigger for header / login. */
  compact?: boolean;
};

export function LanguageSwitcher({ className, compact = false }: Props) {
  const { locale, setLocale, t, locales } = useLocale();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {!compact && (
        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Languages className="h-4 w-4" />
          {t('common.language')}
        </span>
      )}
      <Select
        value={locale}
        onValueChange={(v) => setLocale(v as AppLocale)}
      >
        <SelectTrigger
          className={cn(compact ? 'h-9 w-[7.5rem]' : 'w-[10rem]')}
          aria-label={t('common.language')}
        >
          {compact && <Languages className="h-3.5 w-3.5 mr-1 shrink-0 opacity-70" />}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {locales.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.id === 'es' ? t('common.spanish') : t('common.english')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
