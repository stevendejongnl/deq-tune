export const SUPPORTED_LOCALES = ["en", "ja", "de", "fr", "es", "nl"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

const LOCALE_STORAGE_KEY = "deq-tune-locale";

function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Picks the first browser language (e.g. "de-DE", "de") that matches a
 * supported locale, or DEFAULT_LOCALE if none match. */
export function detectBrowserLocale(browserLanguages: readonly string[]): Locale {
  for (const language of browserLanguages) {
    const languageCode = language.split("-")[0].toLowerCase();
    if (isSupportedLocale(languageCode)) {
      return languageCode;
    }
  }
  return DEFAULT_LOCALE;
}

/** What locale.ts needs from browser storage. Lets tests inject an
 * in-memory fake instead of stubbing `window.localStorage`. */
export interface LocaleStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Resolves the locale to start the app in: a previously saved choice if
 * there is one, otherwise the detected browser locale — persisting that
 * detection so a later visit doesn't silently switch if the browser's
 * language list changes. */
export function resolveInitialLocale(
  storage: LocaleStorage,
  browserLanguages: readonly string[],
): Locale {
  const saved = storage.getItem(LOCALE_STORAGE_KEY);
  if (saved !== null && isSupportedLocale(saved)) {
    return saved;
  }

  const detected = detectBrowserLocale(browserLanguages);
  storage.setItem(LOCALE_STORAGE_KEY, detected);
  return detected;
}

export function saveLocale(storage: LocaleStorage, locale: Locale): void {
  storage.setItem(LOCALE_STORAGE_KEY, locale);
}
