/**
 * Shared BraDypUS v5 ("bdus") Configuration Utilities
 *
 * Provides consistent bdus5 connection handling across components, mirroring
 * directus-config.ts so the two sources share the same shorthand/query-string
 * conventions (bdus5's filter operators are the same `_eq`/`_icontains`/...
 * vocabulary Directus uses).
 *
 * bdus5 intentionally has TWO separate config resolvers because, unlike
 * Directus, fetching full record detail (needed for geodata/files/plugins)
 * costs one HTTP request per row — fine at build time, too expensive to run
 * in the visitor's browser on every page view for anything but a single
 * record:
 *
 * - `getBdusServerConfig` reads `BDUS_BASE_URL` / `BDUS_API_KEY` (no `PUBLIC_`
 *   prefix: never bundled into client JS). Use it from Node-only code —
 *   Astro frontmatter, integrations/loaders — for listings, maps and tables
 *   that need many rows.
 * - `getBdusPublicConfig` / `bdusShorthandToConfig` read `PUBLIC_BDUS_URL` /
 *   `PUBLIC_BDUS_TOKEN` (bundled into client JS, like `PUBLIC_DIRECTUS_*`
 *   already is). Use only for single-record fetches (one request per page
 *   view) with a key scoped to read-only, public-safe data.
 */

import { parseDirectusQueryString } from './directus-config';

export interface BdusServerConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * Declares when a bdus5 fetch actually happens, so the cost tradeoff (see
 * module docs) is a typed, checked part of the config instead of implied by
 * which function you happen to call:
 *
 * - `'realtime'` — runs in the browser, on every page view. Only ever cheap
 *   (one request): the lean list endpoint, or a single full record.
 * - `'build'` — runs in Node at build time, once per build. The only mode
 *   that may fetch full detail (geometry/files/plugins) for many rows, since
 *   that costs one request per row.
 *
 * Each entry point below defaults to the only mode it actually supports and
 * rejects the other explicitly, rather than silently ignoring it.
 */
export type BdusMode = 'realtime' | 'build';

/** Simplified bdus5 shorthand, mirroring DirectusShorthand for the client-side (DataTb) use case. */
export interface BdusShorthand {
  /** Table name in the bdus5 app */
  tb: string;

  /** Directus-style query string (e.g. "filter[typology][_icontains]=fort&sort=site_name&limit=50") */
  queryString?: string;

  /** Optional: override bdus5 base URL (defaults to PUBLIC_BDUS_URL env var), e.g. "https://bdus.lad-sapienza.it/fortnet" */
  baseUrl?: string;

  /** Optional: override bdus5 token (defaults to PUBLIC_BDUS_TOKEN env var) */
  apiKey?: string;

  /**
   * Always `'realtime'` here — this shorthand only ever drives a client-side
   * fetch. Declare it explicitly for clarity if you like; passing `'build'`
   * is rejected (use `bdusLoader`/`bdusQueryFull`/`bdusToFeatureCollection`
   * from Node code instead — see the main package README's "Directus vs.
   * bdus5" table).
   */
  mode?: BdusMode;

  /**
   * Name of a `core` field holding a geometry, for `Map`'s point conversion
   * — same idea as Directus's `geoField`. Only works for bdus5 tables that
   * store coordinates as a plain field (or see `Map`'s `lng`/`lat`-style
   * auto-detection); a table whose geometry lives in bdus5's `geodata`
   * plugin table cannot be plotted this way — that costs one request per
   * row (see module docs) and needs the build-time path instead
   * (`bdusLoader`/`bdusToFeatureCollection`, passed into `Map`'s `geojson`
   * prop as already-built data).
   */
  geoField?: string;
}

/** Full bdus5 source configuration (internal format used by data-fetcher) */
export interface BdusSourceConfig {
  type: 'bdus';
  tb: string;
  config: BdusServerConfig;
  /** Optional: fetch a single record by internal numeric id instead of listing */
  itemId?: string | number;
  filter?: Record<string, any>;
  fields?: string[];
  sort?: string[];
  limit?: number;
  /** GeoJSON/geometry field name (for Map's point conversion) — see BdusShorthand.geoField. */
  geoField?: string;
}

/**
 * Server/build-time bdus5 config. Reads `BDUS_BASE_URL` / `BDUS_API_KEY`
 * from the environment (`process.env` when run under plain Node, e.g. a
 * script; `import.meta.env` when run under Vite/Astro).
 *
 * Returns null (and logs) if the base URL is missing. Never call this from
 * code that also runs in the browser bundle — the key is meant to stay
 * server-side.
 */
export function getBdusServerConfig(baseUrl?: string, apiKey?: string): BdusServerConfig | null {
  const env: Record<string, string | undefined> = {
    ...(typeof process !== 'undefined' ? process.env : {}),
    ...(import.meta.env as unknown as Record<string, string | undefined>),
  };

  const resolvedUrl = baseUrl || env.BDUS_BASE_URL;
  const resolvedKey = apiKey || env.BDUS_API_KEY;

  if (!resolvedUrl) {
    console.error(
      'bdus5 base URL is not configured. Set BDUS_BASE_URL (e.g. "https://bdus.lad-sapienza.it/<app>") or pass baseUrl explicitly.'
    );
    return null;
  }

  return { baseUrl: resolvedUrl.replace(/\/$/, ''), apiKey: resolvedKey || '' };
}

/**
 * Client-exposed bdus5 config. Reads `PUBLIC_BDUS_URL` / `PUBLIC_BDUS_TOKEN`
 * — bundled into the browser build, like `PUBLIC_DIRECTUS_URL/TOKEN`. Only
 * use this (or a key scoped the same way) for single-record lookups.
 */
export function getBdusPublicConfig(url?: string, token?: string): BdusServerConfig | null {
  const publicUrl = url || import.meta.env.PUBLIC_BDUS_URL;
  const publicToken = token || import.meta.env.PUBLIC_BDUS_TOKEN;

  if (!publicUrl) {
    console.error(
      'bdus5 URL is not configured. Set PUBLIC_BDUS_URL environment variable or pass url explicitly.'
    );
    return null;
  }

  return { baseUrl: publicUrl.replace(/\/$/, ''), apiKey: publicToken || '' };
}

/**
 * Convert simplified bdus5 shorthand to full source config, for the client
 * (DataTb `bdus` prop). Reuses Directus's query-string grammar since bdus5
 * accepts the same filter operators.
 */
export function bdusShorthandToConfig(bdus: BdusShorthand): BdusSourceConfig | null {
  if (bdus.mode === 'build') {
    throw new Error(
      `bdus5 shorthand for table "${bdus.tb}" declares mode: 'build', but this shorthand only ever runs client-side (realtime). ` +
        'Use bdusLoader (content.config.ts), or bdusQueryFull/bdusToFeatureCollection from an Astro component\'s own frontmatter, for a build-time fetch instead.'
    );
  }

  const config = getBdusPublicConfig(bdus.baseUrl, bdus.apiKey);
  if (!config) return null;

  const sourceConfig: BdusSourceConfig = {
    type: 'bdus',
    tb: bdus.tb,
    config,
  };

  if (bdus.queryString) {
    const parsed = parseDirectusQueryString(bdus.queryString);
    Object.assign(sourceConfig, parsed);
  }

  return sourceConfig;
}
