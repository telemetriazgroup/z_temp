export type AppLocale = 'es' | 'en';

export const APP_LOCALES: { id: AppLocale; label: string; nativeLabel: string }[] = [
  { id: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { id: 'en', label: 'English', nativeLabel: 'English' },
];

export const DEFAULT_LOCALE: AppLocale = 'es';
export const LOCALE_STORAGE_KEY = 'ztrack_locale';

/** Nested dictionary of UI strings. */
export type MessageTree = { [key: string]: string | MessageTree };

export type TranslateVars = Record<string, string | number | undefined | null>;
