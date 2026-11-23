import { afterEach, describe, expect, it } from 'vitest';
import { getLocale, intlLocale, normalizeLocale, registerDictionary, serverLocale, setLocale, tr } from './i18n';
import { ES } from './locales/es';
import { FR } from './locales/fr';

const placeholders = (s: string) => new Set(s.match(/\{\w+\}/g) ?? []);

describe('i18n', () => {
  afterEach(() => {
    registerDictionary('es', ES);
    registerDictionary('fr', FR);
    setLocale('en');
  });

  it('tests run in English, whatever the machine language', () => {
    expect(getLocale()).toBe('en');
  });

  it('recognizes browser and system language formats', () => {
    expect(normalizeLocale('fr')).toBe('fr');
    expect(normalizeLocale('fr-CA')).toBe('fr');
    expect(normalizeLocale('fr_FR.UTF-8')).toBe('fr');
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('en_GB.UTF-8')).toBe('en');
    expect(normalizeLocale('es_AR.UTF-8')).toBe('es');
    expect(normalizeLocale('pt-BR')).toBeUndefined();
    expect(normalizeLocale('de-DE')).toBeUndefined();
    expect(normalizeLocale('')).toBeUndefined();
    expect(normalizeLocale(null)).toBeUndefined();
  });

  it('in English returns the source text itself, with the gaps filled', () => {
    expect(tr('Reading {0}', ['app.ts'])).toBe('Reading app.ts');
    expect(tr('Text nobody translated')).toBe('Text nobody translated');
    expect(intlLocale()).toBe('en-US');
  });

  it('in French and Spanish translates, and falls back to English without a translation', () => {
    setLocale('fr');
    expect(tr('Reading {0}', ['app.ts'])).toBe('Lit app.ts');
    expect(tr('Text nobody translated')).toBe('Text nobody translated');
    expect(intlLocale()).toBe('fr-FR');
    setLocale('es');
    expect(tr('Reading {0}', ['app.ts'])).toBe('Leyendo app.ts');
    expect(tr('{0} and {1}', ['one', 'two'])).toBe('one y two');
    expect(intlLocale()).toBe('es');
  });

  it('a translation may reorder the gaps', () => {
    registerDictionary('fr', { ...FR, '{0} of {1}': '{1} : {0}' });
    setLocale('fr');
    expect(tr('{0} of {1}', ['page', 'book'])).toBe('book : page');
  });

  it('gaps without an argument stay as they are (named ones are filled by the caller)', () => {
    expect(tr('I won {a} to {b}! 🏆')).toBe('I won {a} to {b}! 🏆');
    expect(tr('{0} and {1}', ['one'])).toBe('one and {1}');
    setLocale('es');
    expect(tr('I won {a} to {b}! 🏆')).toBe('¡Gané {a} a {b}! 🏆');
  });

  it('server: HABBLAUD_LANG wins; otherwise the system language, falling back to English', () => {
    expect(serverLocale({ HABBLAUD_LANG: 'en' }, 'fr-FR')).toBe('en');
    expect(serverLocale({ HABBLAUD_LANG: 'es-MX', LANG: 'fr_FR.UTF-8' })).toBe('es');
    expect(serverLocale({ LANG: 'en_US.UTF-8' }, 'en-US')).toBe('en');
    expect(serverLocale({}, 'en-US')).toBe('en');
    expect(serverLocale({})).toBe('en');
    // Unsupported system languages (Danish Mac, C locale on a Raspberry Pi, Portuguese) fall back to English.
    expect(serverLocale({ LANG: 'da_DK.UTF-8' }, 'da-DK')).toBe('en');
    expect(serverLocale({ LANG: 'C.UTF-8' })).toBe('en');
    expect(serverLocale({ LANG: 'pt_BR.UTF-8' })).toBe('en');
    // An unsupported language earlier in the chain doesn't hide a supported one later.
    expect(serverLocale({ LC_ALL: 'pt_BR.UTF-8', LANG: 'fr_FR.UTF-8' })).toBe('fr');
    expect(serverLocale({ LANG: 'fr_FR.UTF-8' })).toBe('fr');
    expect(serverLocale({ LC_ALL: 'es_ES.UTF-8', LANG: 'en_US.UTF-8' })).toBe('es');
    expect(serverLocale({}, 'es-AR')).toBe('es');
  });

  it('no translation is empty or loses or invents gaps', () => {
    for (const [lang, dict] of Object.entries({ es: ES, fr: FR })) {
      expect(Object.keys(dict).length, lang).toBeGreaterThan(0);
      for (const [src, t] of Object.entries(dict)) {
        expect(t.trim(), `${lang}: ${src}`).not.toBe('');
        const original = placeholders(src);
        for (const p of placeholders(t)) expect(original.has(p), `${lang}: ${src} -> ${t}`).toBe(true);
        // French may drop a gap ("click to go to {2}" -> "cliquez pour y aller"); Spanish keeps them all.
        if (lang !== 'fr') for (const p of original) expect(placeholders(t).has(p), `${lang}: ${src} -> ${t}`).toBe(true);
      }
    }
  });
});
