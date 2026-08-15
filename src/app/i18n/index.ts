export type { AppLocale, MessageTree, TranslateVars } from './types';
export {
  APP_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
} from './types';
export { LocaleProvider, useLocale, useT } from './LocaleContext';
export { translate, getMessage, interpolate } from './translate';
export { esMessages } from './locales/es';
export { enMessages } from './locales/en';
