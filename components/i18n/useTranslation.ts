import { useState, useEffect } from 'react';
import { createTranslator, type Translator } from './translator';
import { BUILTIN_DICTIONARY } from './builtinDictionary';
import { readGlobalI18nConfig } from './window';

const BUILTIN_ONLY_TRANSLATOR = createTranslator({ locale: 'en', defaultLocale: 'en' }, BUILTIN_DICTIONARY);

/**
 * Returns a `t(key, vars?)` translator for use inside a React component.
 * See `window.ts` for why this reads a global instead of React Context.
 *
 * Starts with the built-in-only translator on every render — server *and*
 * the client's first render — because `window.__scmsI18n` only exists
 * client-side; reading it during the initial render would make the client's
 * first paint disagree with what the server sent, causing a React hydration
 * mismatch (the exact two-phase-init pattern `ThemeToggle` also uses, for
 * the same reason). The real dictionary is applied a moment later via
 * `useEffect`, once mounted client-side.
 *
 * @example
 * ```tsx
 * const t = useTranslation();
 * <input placeholder={t('dataTb.searchPlaceholder')} />
 * <span>{t('dataTb.paginationSummary', { page: 2, totalPages: 5 })}</span>
 * ```
 */
export function useTranslation(): Translator {
  const [translator, setTranslator] = useState<Translator>(() => BUILTIN_ONLY_TRANSLATOR);

  useEffect(() => {
    const global = readGlobalI18nConfig();
    if (global) {
      setTranslator(() => createTranslator(global, BUILTIN_DICTIONARY));
    }
  }, []);

  return translator;
}
