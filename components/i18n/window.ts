import type { Dictionary } from './translator';

/** Shape of the per-page config `<I18nInit>` writes to `window.__scmsI18n`. */
export interface ScmsI18nGlobal {
  locale: string;
  defaultLocale: string;
  dictionary?: Dictionary;
  defaultDictionary?: Dictionary;
}

declare global {
  interface Window {
    __scmsI18n?: ScmsI18nGlobal;
  }
}

/**
 * Reads the per-page i18n config set by `<I18nInit>`. Deliberately a plain
 * `window` global rather than React Context: Astro's `client:*` islands are
 * independent hydration roots with no shared component tree, so a Context
 * Provider mounted in one island (e.g. inside `BSNavbar`) would never reach
 * another island elsewhere on the page (e.g. `DataTb`). A page's locale
 * never changes during its lifetime — switching locale is a full page
 * navigation (see `LocaleSwitcher`), not client-side routing — so a plain
 * global read, set once before any island hydrates, is sufficient.
 *
 * Returns `undefined` on a site that never rendered `<I18nInit>` (the
 * common case: a site that hasn't opted into i18n at all).
 */
export function readGlobalI18nConfig(): ScmsI18nGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.__scmsI18n;
}
