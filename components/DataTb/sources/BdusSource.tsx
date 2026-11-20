/**
 * BdusSource Component
 *
 * Headless loader for the bdus5 (BraDypUS v5) lean list endpoint. Renders
 * nothing; calls onDataLoad/onLoadingChange/onError, for building a fully
 * custom table UI. See DataTb/README.md "Headless Source Components".
 */

import { useEffect } from 'react';
import { bdusListAll } from '../../../utils/bdus-client';
import type { BdusServerConfig } from '../../../utils/bdus-config';
import type { SourceComponentProps } from '../types';

export interface BdusSourceProps extends SourceComponentProps {
  /** Table name in the bdus5 app */
  tb: string;

  /** bdus5 configuration */
  config: BdusServerConfig;

  /** Filter query (same operators as Directus: _eq, _icontains, ...) */
  filter?: Record<string, any>;

  /** Fields to select */
  fields?: string[];

  /** Sort field */
  sortField?: string;
  sortDir?: 'asc' | 'desc';

  /** Limit results */
  limit?: number;
}

export function BdusSource({
  tb,
  config,
  filter,
  fields,
  sortField,
  sortDir,
  limit,
  onDataLoad,
  onLoadingChange,
  onError,
}: BdusSourceProps) {
  useEffect(() => {
    const load = async () => {
      try {
        if (!config.baseUrl) {
          throw new Error('bdus5 configuration (baseUrl) is required');
        }

        onLoadingChange?.(true);
        const rows = await bdusListAll(config, tb, { filter, fields, sortField, sortDir, limit });
        onDataLoad(rows);
        onLoadingChange?.(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load bdus5 data';
        onError?.(new Error(`bdus5 error: ${message}`));
        onLoadingChange?.(false);
      }
    };

    load();
  }, [tb, config.baseUrl, config.apiKey, JSON.stringify(filter), JSON.stringify(fields), sortField, sortDir, limit]);

  return null;
}
