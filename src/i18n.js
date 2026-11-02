// -----------------------------------------------------------------------------
// User-facing texts.
//
// Every text the integration sends to Gladys (action messages, widget
// contents, connection status) is a multi-language object: Gladys picks the
// language of the user, English being the fallback. The integration speaks
// the four languages of its documentation: English, French, German, Spanish.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/**
 * Build a multi-language text.
 * @param {string} en
 * @param {string} fr
 * @param {string} de
 * @param {string} es
 * @returns {{ en: string, fr: string, de: string, es: string }}
 */
export function text(en, fr, de, es) {
  return { en, fr, de, es };
}

/**
 * Pick one language of a multi-language text, English as the fallback.
 * @param {Record<string, string>} value
 * @param {string} [language]
 */
export function pick(value, language) {
  if (typeof value === 'string') {
    return value;
  }
  const lang = String(language ?? 'en')
    .slice(0, 2)
    .toLowerCase();
  return value[lang] ?? value.en;
}

/**
 * Apply `fn` to every language of a multi-language text: handy to build a
 * sentence around a value that does not need translating (a station name).
 * @param {Record<string, string>} value
 * @param {(text: string, lang: string) => string} fn
 */
export function mapText(value, fn) {
  return Object.fromEntries(Object.entries(value).map(([lang, t]) => [lang, fn(t, lang)]));
}
