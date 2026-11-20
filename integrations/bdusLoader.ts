/**
 * bdus5 (BraDypUS v5) Content Loader for Astro Content Collections
 *
 * Build-time only, mirroring directusLoader.ts: fetches every row from a
 * bdus5 table and makes it available as an Astro Content Collection. Reads
 * `BDUS_BASE_URL` / `BDUS_API_KEY` from the environment — never the
 * `PUBLIC_` ones, since this always runs in Node (never the browser).
 *
 * Full record detail (one request per row — see utils/bdus-client.ts) is
 * fetched for every row, since a content collection is typically consumed
 * for detail pages, not just a lean listing; normalized the same way as the
 * rest of the bdus5 support, so entries look like flat Directus-style rows.
 */

import type { Loader } from 'astro/loaders';
import { getBdusServerConfig } from '../utils/bdus-config';
import { bdusQueryFull, type BdusListOptions } from '../utils/bdus-client';

export interface BdusLoaderOptions extends BdusListOptions {
  baseUrl?: string;
  apiKey?: string;
  tb: string;
}

export function bdusLoader(options: BdusLoaderOptions): Loader {
  return {
    name: 'bdus-loader',
    load: async ({ store, logger }) => {
      const config = getBdusServerConfig(options.baseUrl, options.apiKey);
      if (!config) {
        throw new Error(
          'bdus5 base URL not configured. Set BDUS_BASE_URL (and BDUS_API_KEY) in .env or provide baseUrl/apiKey options.'
        );
      }

      logger.info(`Fetching from bdus5: ${config.baseUrl}/api/records/${options.tb}`);

      const records = await bdusQueryFull(config, options.tb, {
        filter: options.filter,
        fields: options.fields,
        sortField: options.sortField,
        sortDir: options.sortDir,
        sortField2: options.sortField2,
        limit: options.limit,
      });

      logger.info(`Loaded ${records.length} items from bdus5 table: ${options.tb}`);

      store.clear();
      for (const item of records) {
        store.set({
          id: String(item.id),
          data: item,
        });
      }
    },
  };
}
