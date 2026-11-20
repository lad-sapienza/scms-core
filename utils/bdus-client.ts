/**
 * BraDypUS v5 ("bdus5") API client.
 *
 * Talks to a bdus5 app (`<baseUrl>/api/...`) the same way Directus support
 * talks to a Directus instance, but bdus5's own shapes differ in two ways
 * this module normalizes away:
 *
 * - The lean list endpoint (`POST /api/records/<tb>`) returns flat rows —
 *   already shaped like a Directus `readItems` result, cheap for many rows.
 * - The full record endpoint (`GET /api/record/<tb>/<id>`) returns a nested
 *   `{ core: { <field>: { val } }, geodata, files, plugins, bibliography }`
 *   shape, costs one HTTP request per record, and is the only way to get a
 *   record's geometry. `normalizeBdusRecord` flattens it to a plain object
 *   (`core.<field>.val` -> top-level keys) so it drops into `<Field name=.../>`
 *   and other Directus-record-shaped consumers unchanged, while keeping the
 *   richer nested data available under `_geodata` / `_files` / `_plugins` /
 *   `_bibliography` / `_metadata` for callers that need it.
 */

import type { BdusMode, BdusServerConfig } from './bdus-config';

const MAX_PER_PAGE = 200;

export interface BdusListOptions {
  filter?: Record<string, any>;
  fields?: string[];
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  /** A second sort key, applied in JS — bdus5's list endpoint only accepts one sort_field. */
  sortField2?: string;
  /** Restrict to N results (after pagination/sort). */
  limit?: number;
  /**
   * `bdusQueryFull`/`bdusToFeatureCollection`/`bdusLoader` only ever run
   * `'build'` (the default — omit this). Passing `'realtime'` is rejected:
   * these functions always fetch full detail for every matching row, one
   * request per row, which is never safe to do on a page view.
   */
  mode?: BdusMode;
  /**
   * Full-record fetches only (bdusQueryFull and callers): how many
   * `/api/record/<tb>/<id>` requests to run at once. bdus5's rate limit on
   * that endpoint has been observed to be strict (a few requests/minute on
   * some apps, with a `Retry-After` in the 429); default 1 (fully
   * sequential) is the safe choice for an unattended build. Raise it only
   * if you've confirmed the target app tolerates more.
   */
  concurrency?: number;
  /** Full-record fetches only: minimum delay between dispatching requests, regardless of concurrency. Default 250ms. */
  requestSpacingMs?: number;
}

const MAX_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bdusFetch(config: BdusServerConfig, path: string, init?: RequestInit, attempt = 0): Promise<any> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  // A full-record build (one request per row, pooled) can trip bdus5's rate
  // limit even at modest concurrency. Back off and retry rather than fail
  // the whole build over a transient 429.
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const delayMs = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
    await sleep(delayMs);
    return bdusFetch(config, path, init, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`bdus5 API ${path} -> HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  if (data.status === 'error') {
    throw new Error(`bdus5 API ${path} -> ${data.code ?? 'error'}: ${data.detail ?? ''}`);
  }

  return data;
}

/** Fetches every row matching a filter from the lean list endpoint, paginating internally (v5 caps per_page at 200). */
export async function bdusListAll(
  config: BdusServerConfig,
  tb: string,
  opts: BdusListOptions = {}
): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  let page = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const body: Record<string, any> = {
      per_page: MAX_PER_PAGE,
      page,
      ...(opts.filter ? { filter: opts.filter } : {}),
      ...(opts.fields ? { fields: opts.fields } : {}),
      ...(opts.sortField ? { sort_field: opts.sortField, sort_dir: opts.sortDir ?? 'asc' } : {}),
    };
    const data = await bdusFetch(config, `/api/records/${tb}`, { method: 'POST', body: JSON.stringify(body) });
    rows.push(...data.data);
    if (rows.length >= data.total || data.data.length === 0) break;
    page++;
  }

  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

/** Fetches the full nested record (core/geodata/files/plugins/bibliography) by internal numeric id. */
export async function bdusRecord(config: BdusServerConfig, tb: string, id: number | string): Promise<any> {
  return bdusFetch(config, `/api/record/${tb}/${id}`);
}

/** Runs `fn` over `items` with at most `concurrency` in flight at once, waiting `spacingMs` before each dispatch. */
async function pool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  spacingMs = 0
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      if (spacingMs > 0 && i > 0) await sleep(spacingMs);
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/**
 * Flattens a full bdus5 record into a plain object: `core.<field>.val` ->
 * top-level `<field>`, plus `id`. The first `geodata` entry's GeoJSON
 * geometry (if any) is exposed as `_geometry`. Raw nested data stays
 * available under `_geodata` / `_files` / `_plugins` / `_bibliography` /
 * `_metadata` for callers that need more than the flat fields.
 */
export function normalizeBdusRecord(raw: any): Record<string, any> {
  const flat: Record<string, any> = {};

  for (const [name, field] of Object.entries<any>(raw?.core ?? {})) {
    flat[name] = field?.val;
  }

  const geodataEntries = Object.values<any>(raw?.geodata ?? {});
  const firstGeo = geodataEntries[0];

  flat.id = raw?.core?.id?.val ?? raw?.metadata?.rec_id;
  flat._geometry = firstGeo?.geojson ?? null;
  flat._geodata = raw?.geodata ?? {};
  flat._files = raw?.files ?? [];
  flat._plugins = raw?.plugins ?? {};
  flat._bibliography = raw?.bibliography ?? [];
  flat._metadata = raw?.metadata ?? {};

  return flat;
}

/**
 * Runs a query and returns normalized FULL record detail for every match
 * (the lean list endpoint doesn't include geodata/files/plugins, which maps,
 * galleries and record pages need). One HTTP request per matching row
 * (pooled, concurrency 10) — fine at build time, too expensive to run per
 * visitor; see module docs and bdus-config.ts.
 */
export async function bdusQueryFull(
  config: BdusServerConfig,
  tb: string,
  opts: BdusListOptions = {}
): Promise<Record<string, any>[]> {
  if (opts.mode === 'realtime') {
    throw new Error(
      `bdusQueryFull("${tb}") declares mode: 'realtime', but it always fetches full detail for every matching row (one request per row) — never safe to run on a page view. ` +
        'Call it only from build-time code (a loader, or an Astro component\'s own frontmatter); omit `mode` (default \'build\') there.'
    );
  }

  const previews = await bdusListAll(config, tb, { filter: opts.filter, fields: ['id'], sortField: opts.sortField, sortDir: opts.sortDir, limit: opts.limit });
  let records = await pool(
    previews,
    opts.concurrency ?? 1,
    (p) => bdusRecord(config, tb, p.id).then(normalizeBdusRecord),
    opts.requestSpacingMs ?? 250
  );

  if (opts.sortField) {
    const primary = opts.sortField;
    const dir = opts.sortDir === 'desc' ? -1 : 1;
    records = [...records].sort((a, b) => {
      const primaryCmp = String(a[primary] ?? '').localeCompare(String(b[primary] ?? ''), undefined, { numeric: true }) * dir;
      if (primaryCmp !== 0 || !opts.sortField2) return primaryCmp;
      return String(a[opts.sortField2] ?? '').localeCompare(String(b[opts.sortField2] ?? ''));
    });
  }

  return records;
}

/** Normalized full record detail for every row matching a raw filter object. */
export async function bdusFullByFilter(
  config: BdusServerConfig,
  tb: string,
  filter: Record<string, any>
): Promise<Record<string, any>[]> {
  return bdusQueryFull(config, tb, { filter });
}

/** Finds the single record matching `field = value` and returns its normalized full detail (or null). */
export async function bdusFindOne(
  config: BdusServerConfig,
  tb: string,
  field: string,
  value: string
): Promise<Record<string, any> | null> {
  const matches = await bdusListAll(config, tb, { filter: { [field]: { _eq: value } }, fields: ['id'], limit: 1 });
  if (matches.length === 0) return null;
  return normalizeBdusRecord(await bdusRecord(config, tb, matches[0].id));
}

export interface BdusGeoJsonOptions extends BdusListOptions {
  /** Properties to drop from the GeoJSON feature (besides the reserved `_geometry`/`_geodata`/... keys, always dropped). */
  omit?: string[];
}

/**
 * Build-time helper: fetches full detail for every matching row and returns
 * a GeoJSON FeatureCollection, using each record's `_geometry` (from
 * `geodata`) as the feature geometry and its flat fields as properties.
 * Rows without geometry are skipped. Mirrors the `{type:'geojson', data}`
 * shorthand already accepted by the `Map` and `DataTb` components — pass the
 * result straight in as `data`.
 */
export async function bdusToFeatureCollection(
  config: BdusServerConfig,
  tb: string,
  opts: BdusGeoJsonOptions = {}
): Promise<{ type: 'FeatureCollection'; features: any[] }> {
  const records = await bdusQueryFull(config, tb, opts);
  const omit = new Set(['_geometry', '_geodata', '_files', '_plugins', '_bibliography', '_metadata', ...(opts.omit ?? [])]);

  const features = records
    .filter((r) => r._geometry)
    .map((r) => ({
      type: 'Feature' as const,
      id: r.id,
      geometry: r._geometry,
      properties: Object.fromEntries(Object.entries(r).filter(([k]) => !omit.has(k))),
    }));

  return { type: 'FeatureCollection', features };
}

/** Public, unauthenticated URL for an uploaded bdus5 file. */
export function bdusFileUrl(appName: string, fileId: number | string, ext: string, filesHost = 'https://bdus.lad-sapienza.it'): string {
  return `${filesHost.replace(/\/$/, '')}/projects/${appName}/files/${fileId}.${ext}`;
}
