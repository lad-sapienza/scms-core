/**
 * Simplified record fetching utility for Directus or bdus5 records
 */

import { fetchData } from './data-fetcher.js';
import { directusShorthandToConfig } from './directus-config.js';
import { getBdusPublicConfig } from './bdus-config.js';
import { bdusRecord, normalizeBdusRecord } from './bdus-client.js';

export interface GetRecordOptions {
  table: string;
  id: string;
  fields?: string[];
  /** Which backend to fetch from. Defaults to 'bdus' when PUBLIC_BDUS_URL is set, else 'directus'. */
  source?: 'directus' | 'bdus';
  url?: string;
  token?: string;
}

function defaultSource(): 'directus' | 'bdus' {
  return import.meta.env.PUBLIC_BDUS_URL ? 'bdus' : 'directus';
}

/**
 * Fetch a single record with a simplified API, from Directus or bdus5.
 *
 * @param options - Record fetching options
 * @returns Promise resolving to the record object or null if not found
 *
 * @example
 * ```js
 * // Basic usage (Directus)
 * const record = await getRecord({ table: 'articles', id: '123' });
 *
 * // bdus5, explicit
 * const record = await getRecord({ table: 'sites', id: '98', source: 'bdus' });
 *
 * // With specific fields (Directus only; bdus5 full-record fetch always returns every field)
 * const record = await getRecord({
 *   table: 'articles',
 *   id: '123',
 *   fields: ['title', 'content', 'author.*']
 * });
 * ```
 */
export async function getRecord(options: GetRecordOptions): Promise<any | null> {
  const {
    table,
    id,
    fields = ['*.*.*'],
    source = defaultSource(),
    url,
    token,
  } = options;

  // Normalize ID: convert to number if it looks numeric, otherwise keep as string
  const normalizedId = /^\d+$/.test(id) ? Number(id) : id;

  if (source === 'bdus') {
    try {
      const config = getBdusPublicConfig(url, token);
      if (!config) {
        console.error('Failed to configure bdus5 connection');
        return null;
      }
      return normalizeBdusRecord(await bdusRecord(config, table, normalizedId));
    } catch (err) {
      console.error(`Error fetching record ${id} from bdus5 table ${table}:`, err);
      return null;
    }
  }

  try {
    // Configure Directus connection
    const config = directusShorthandToConfig({
      table,
      url: url ?? import.meta.env.PUBLIC_DIRECTUS_URL,
      token: token ?? import.meta.env.PUBLIC_DIRECTUS_TOKEN,
    });

    if (!config) {
      console.error('Failed to configure Directus connection');
      return null;
    }

    // Fetch the record
    const recordData = await fetchData({
      type: 'directus',
      collection: table,
      config: config.config,
      itemId: normalizedId,
      fields,
    });

    // Return the first (and should be only) record
    return recordData && recordData.length > 0 ? recordData[0] : null;
  } catch (err) {
    console.error(`Error fetching record ${id} from ${table}:`, err);
    return null;
  }
}

/**
 * Simplified function for the most common use case
 *
 * @param table - Collection/table name
 * @param id - Record ID
 * @returns Promise resolving to the record object or null
 *
 * @example
 * ```js
 * const record = await getRecordById('articles', '123');
 * ```
 */
export async function getRecordById(table: string, id: string): Promise<any | null> {
  return getRecord({ table, id });
}

/**
 * Ultra-simplified function for Astro dynamic routes
 * Automatically extracts table and id from Astro.params
 *
 * @param astro - The Astro global object
 * @returns Promise resolving to the record object or null
 *
 * @example
 * ```astro
 * ---
 * const record = await getRecordFromParams(Astro);
 * ---
 * ```
 */
export async function getRecordFromParams(astro: any): Promise<any | null> {
  const { table, id } = astro.params;

  if (!table || !id) {
    return null;
  }

  const fieldsParam = astro?.url?.searchParams?.get('fields');
  const fields = fieldsParam
    ? fieldsParam
        .split(',')
        .map((field: string) => field.trim())
        .filter(Boolean)
    : undefined;

  return getRecord({ table, id, fields });
}
