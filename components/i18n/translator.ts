/**
 * Core translation logic — pure, no React, no Astro. Shared by both
 * `useTranslation()` (React components) and direct `.astro`-file usage.
 */

/** A translation dictionary: string leaves, nested under arbitrary key namespaces (e.g. `dataTb.pagination`). */
export type Dictionary = { [key: string]: string | Dictionary };

export interface TranslatorConfig {
  locale: string;
  defaultLocale: string;
  /** The site's own dictionary for `locale`. */
  dictionary?: Dictionary;
  /** The site's own dictionary for `defaultLocale`, if different from `dictionary`. */
  defaultDictionary?: Dictionary;
}

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

function resolveKey(dict: Dictionary | undefined, path: string): string | undefined {
  if (!dict) return undefined;
  let current: string | Dictionary | undefined = dict;
  for (const segment of path.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = current[segment];
  }
  return typeof current === 'string' ? current : undefined;
}

/** Replaces `{name}` placeholders with values from `vars`. Leaves an unmatched placeholder untouched rather than blanking it. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/**
 * Builds a `t(key, vars?)` translator. Resolution order: the site's
 * dictionary for the current locale → the site's dictionary for the
 * default locale → `builtin` (scms-core's own English defaults for
 * component-owned keys) → the key itself, as a last resort. Every step
 * down this chain logs a `console.warn` naming the missing key and locale,
 * except the builtin-dictionary hit: falling back to scms-core's own
 * default only means the site never chose to override that particular
 * component-owned key — the normal, designed state for most keys on most
 * sites, not a translation gap. A real gap is specifically "this key is
 * translated in the site's OTHER locale but not this one" (the step above),
 * which is what actually warns.
 */
export function createTranslator(config: TranslatorConfig, builtin?: Dictionary): Translator {
  return (key, vars) => {
    let value = resolveKey(config.dictionary, key);

    if (value === undefined) {
      value = resolveKey(config.defaultDictionary, key);
      if (value !== undefined) {
        console.warn(`[i18n] Missing "${config.locale}" translation for key "${key}" — falling back to "${config.defaultLocale}".`);
      }
    }

    if (value === undefined) {
      value = resolveKey(builtin, key);
    }

    if (value === undefined) {
      console.warn(`[i18n] No translation found for key "${key}" in any dictionary — rendering the key itself.`);
      value = key;
    }

    return interpolate(value, vars);
  };
}
