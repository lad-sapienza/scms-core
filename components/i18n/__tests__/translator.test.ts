import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTranslator, type Dictionary } from '../translator';

const builtin: Dictionary = {
  dataTb: {
    loading: 'Loading data...',
    paginationSummary: 'Page {page} of {totalPages}',
  },
};

describe('createTranslator', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('resolves a nested key from the current-locale dictionary, no warning', () => {
    const t = createTranslator(
      { locale: 'it', defaultLocale: 'en', dictionary: { dataTb: { loading: 'Caricamento...' } } },
      builtin
    );
    expect(t('dataTb.loading')).toBe('Caricamento...');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back to the default-locale dictionary and warns', () => {
    const t = createTranslator(
      {
        locale: 'it',
        defaultLocale: 'en',
        dictionary: {},
        defaultDictionary: { dataTb: { loading: 'Loading data...' } },
      },
      builtin
    );
    expect(t('dataTb.loading')).toBe('Loading data...');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('dataTb.loading');
    expect(warnSpy.mock.calls[0][0]).toContain('"it"');
  });

  it('silently falls back to the builtin dictionary when the site never overrides this key, even with a dictionary in play', () => {
    // An empty (or merely non-overriding) site dictionary is the normal
    // case for most keys on most sites — not a translation gap, so no
    // warning. Only an asymmetry between the site's own locales (the case
    // above) is a real gap.
    const t = createTranslator({ locale: 'it', defaultLocale: 'en', dictionary: {} }, builtin);
    expect(t('dataTb.loading')).toBe('Loading data...');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('silently uses the builtin dictionary when the site has no dictionary at all', () => {
    const t = createTranslator({ locale: 'en', defaultLocale: 'en' }, builtin);
    expect(t('dataTb.loading')).toBe('Loading data...');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('renders the key itself and warns when nothing resolves it', () => {
    const t = createTranslator({ locale: 'it', defaultLocale: 'en', dictionary: {} }, builtin);
    expect(t('nav.doesNotExist')).toBe('nav.doesNotExist');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('interpolates named placeholders', () => {
    const t = createTranslator({ locale: 'en', defaultLocale: 'en' }, builtin);
    expect(t('dataTb.paginationSummary', { page: 2, totalPages: 5 })).toBe('Page 2 of 5');
  });

  it('leaves an unmatched placeholder untouched', () => {
    const t = createTranslator({ locale: 'en', defaultLocale: 'en' }, builtin);
    expect(t('dataTb.paginationSummary', { page: 2 })).toBe('Page 2 of {totalPages}');
  });

  it('a dictionary override takes priority over the builtin default', () => {
    const t = createTranslator(
      { locale: 'en', defaultLocale: 'en', dictionary: { dataTb: { loading: 'Custom loading...' } } },
      builtin
    );
    expect(t('dataTb.loading')).toBe('Custom loading...');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
