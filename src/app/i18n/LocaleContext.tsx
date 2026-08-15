import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { enUS, es } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';
import {
  APP_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  type AppLocale,
  type TranslateVars,
} from './types';
import { translate } from './translate';
import { esMessages } from './locales/es';
import { enMessages } from './locales/en';

const messagesByLocale = {
  es: esMessages,
  en: enMessages,
} as const;

const dateFnsByLocale: Record<AppLocale, DateFnsLocale> = {
  es,
  en: enUS,
};

const intlLocaleByApp: Record<AppLocale, string> = {
  es: 'es-PE',
  en: 'en-US',
};

function readStoredLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (raw === 'en' || raw === 'es') return raw;
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE;
}

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: string, vars?: TranslateVars) => string;
  dateFnsLocale: DateFnsLocale;
  intlLocale: string;
  locales: typeof APP_LOCALES;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(readStoredLocale);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'es';
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => {
    const tree = messagesByLocale[locale];
    return {
      locale,
      setLocale,
      t: (key, vars) => translate(tree, key, vars, esMessages),
      dateFnsLocale: dateFnsByLocale[locale],
      intlLocale: intlLocaleByApp[locale],
      locales: APP_LOCALES,
    };
  }, [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
}

/** Shortcut: only the `t` function. */
export function useT() {
  return useLocale().t;
}
