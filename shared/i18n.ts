// Interface languages. English is the source language: every text is written in English and goes through tr(),
// which returns the active language's translation or, without one, the English text itself, so an incomplete
// translation never breaks the interface.
//
// Locale selection (once, when this module loads):
// - browser: the saved preference (Settings > Language), else the browser languages, else English;
// - server: HABBLAUD_LANG, else the system language (LC_ALL / LC_MESSAGES / LANG / Intl), else English (see
//   serverLocale).
// Activity texts are built by the server, so they follow the server's locale.
import { DICTIONARIES } from './locales/all';

export type Locale = 'en' | 'es' | 'fr';

/** In picker order; each language is named in itself, for whoever doesn't read the current one. */
export const LOCALES: { id: Locale; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
];

/** Key of the preference saved in the browser. */
export const LOCALE_STORAGE_KEY = 'habblaud:locale';

/** Available dictionaries (English has none: it is the source). Empty in the browser at first: see registerDictionary. */
const DICTS: Partial<Record<Locale, Readonly<Record<string, string>>>> = { ...DICTIONARIES };

/** The browser loads only the active language's dictionary and registers it here before mounting the interface. */
export function registerDictionary(l: Locale, dict: Readonly<Record<string, string>>): void {
  DICTS[l] = dict;
}

/** "fr-FR", "fr_CA.UTF-8", "es_MX"... -> a supported language; undefined if it's none of them. */
export function normalizeLocale(v: string | null | undefined): Locale | undefined {
  const s = (v ?? '').trim().toLowerCase().replace('_', '-');
  if (!s) return undefined;
  if (s === 'fr' || s.startsWith('fr-')) return 'fr';
  if (s === 'en' || s.startsWith('en-')) return 'en';
  if (s === 'es' || s.startsWith('es-')) return 'es';
  return undefined;
}

/**
 * Server locale (activities, notices, logs). HABBLAUD_LANG wins; then the first supported system language (LC_ALL,
 * LC_MESSAGES, LANG and, last, Intl). A system in an unsupported language (Danish, German, `C.UTF-8`...) falls back to
 * English.
 */
export function serverLocale(env: Record<string, string | undefined>, intl?: string): Locale {
  const own = normalizeLocale(env.HABBLAUD_LANG);
  if (own) return own;
  for (const v of [env.LC_ALL, env.LC_MESSAGES, env.LANG, intl]) {
    const n = normalizeLocale(v);
    if (n) return n;
  }
  return 'en';
}

function detect(): Locale {
  const g = globalThis as {
    window?: unknown;
    localStorage?: { getItem(k: string): string | null };
    navigator?: { languages?: readonly string[]; language?: string };
    process?: { env?: Record<string, string | undefined> };
  };
  if (g.window !== undefined) {
    try {
      const saved = normalizeLocale(g.localStorage?.getItem(LOCALE_STORAGE_KEY));
      if (saved) return saved;
    } catch {
      // localStorage blocked (private mode, iframe): go on to the browser languages.
    }
    for (const l of g.navigator?.languages ?? [g.navigator?.language ?? '']) {
      const n = normalizeLocale(l);
      if (n) return n;
    }
    return 'en';
  }
  const env = g.process?.env ?? {};
  // Tests compare English texts: they stay in English even on a machine set to another language.
  if (env.VITEST) return normalizeLocale(env.HABBLAUD_LANG_TEST) ?? 'en';
  let intl: string | undefined;
  try {
    intl = Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    intl = undefined;
  }
  return serverLocale(env, intl);
}

let current: Locale = detect();

export function getLocale(): Locale {
  return current;
}

/** Switches the active language (tests; in the browser, switching from the interface reloads the page). */
export function setLocale(l: Locale): void {
  current = l;
}

/**
 * Translates an English text. Numbered gaps ({0}, {1}...) receive `args` in order; a translation may reorder them.
 * Without a translation for the active language, returns the English text.
 */
export function tr(src: string, args?: readonly unknown[]): string {
  const dict = DICTS[current];
  const s = (dict && dict[src]) || src;
  if (!args || args.length === 0) return s;
  return s.replace(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m));
}

/** Language in Intl's format (dates, numbers). */
export function intlLocale(): string {
  return current === 'fr' ? 'fr-FR' : current === 'es' ? 'es' : 'en-US';
}
