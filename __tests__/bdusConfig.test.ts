import { describe, it, expect, afterEach } from 'vitest';
import { getBdusServerConfig, getBdusPublicConfig, bdusShorthandToConfig } from '../utils/bdus-config';

afterEach(() => {
  delete (process.env as any).BDUS_BASE_URL;
  delete (process.env as any).BDUS_API_KEY;
  delete (import.meta.env as any).PUBLIC_BDUS_URL;
  delete (import.meta.env as any).PUBLIC_BDUS_TOKEN;
});

describe('getBdusServerConfig', () => {
  it('returns null and does not throw when no base URL is configured', () => {
    expect(getBdusServerConfig()).toBeNull();
  });

  it('resolves from explicit args over env', () => {
    process.env.BDUS_BASE_URL = 'https://bdus.lad-sapienza.it/env-app';
    process.env.BDUS_API_KEY = 'env-key';
    const config = getBdusServerConfig('https://bdus.lad-sapienza.it/explicit-app/', 'explicit-key');
    expect(config).toEqual({ baseUrl: 'https://bdus.lad-sapienza.it/explicit-app', apiKey: 'explicit-key' });
  });

  it('falls back to BDUS_BASE_URL / BDUS_API_KEY env vars and trims a trailing slash', () => {
    process.env.BDUS_BASE_URL = 'https://bdus.lad-sapienza.it/fortnet/';
    process.env.BDUS_API_KEY = 'read-only-key';
    expect(getBdusServerConfig()).toEqual({ baseUrl: 'https://bdus.lad-sapienza.it/fortnet', apiKey: 'read-only-key' });
  });
});

describe('getBdusPublicConfig', () => {
  it('returns null when PUBLIC_BDUS_URL is not set', () => {
    expect(getBdusPublicConfig()).toBeNull();
  });

  it('resolves from PUBLIC_BDUS_URL / PUBLIC_BDUS_TOKEN', () => {
    (import.meta.env as any).PUBLIC_BDUS_URL = 'https://bdus.lad-sapienza.it/fortnet';
    (import.meta.env as any).PUBLIC_BDUS_TOKEN = 'public-token';
    expect(getBdusPublicConfig()).toEqual({ baseUrl: 'https://bdus.lad-sapienza.it/fortnet', apiKey: 'public-token' });
  });

  it('defaults apiKey to an empty string when no token is given', () => {
    expect(getBdusPublicConfig('https://bdus.lad-sapienza.it/fortnet')).toEqual({
      baseUrl: 'https://bdus.lad-sapienza.it/fortnet',
      apiKey: '',
    });
  });
});

describe('bdusShorthandToConfig', () => {
  it('returns null when the base URL cannot be resolved', () => {
    expect(bdusShorthandToConfig({ tb: 'sites' })).toBeNull();
  });

  it('builds a full source config, parsing the Directus-style query string', () => {
    const source = bdusShorthandToConfig({
      tb: 'sites',
      baseUrl: 'https://bdus.lad-sapienza.it/fortnet',
      apiKey: 'read-only-key',
      queryString: 'filter[typology][_icontains]=fort&sort=site_name&limit=50',
    });

    expect(source).toEqual({
      type: 'bdus',
      tb: 'sites',
      config: { baseUrl: 'https://bdus.lad-sapienza.it/fortnet', apiKey: 'read-only-key' },
      filter: { typology: { _icontains: 'fort' } },
      sort: ['site_name'],
      limit: 50,
    });
  });

  it('rejects mode: "build" — this shorthand only ever runs client-side', () => {
    expect(() => bdusShorthandToConfig({ tb: 'sites', baseUrl: 'https://bdus.lad-sapienza.it/fortnet', mode: 'build' })).toThrow(
      /only ever runs client-side/
    );
  });

  it('accepts an explicit mode: "realtime" (same as omitting it)', () => {
    const source = bdusShorthandToConfig({ tb: 'sites', baseUrl: 'https://bdus.lad-sapienza.it/fortnet', mode: 'realtime' });
    expect(source?.tb).toBe('sites');
  });
});
