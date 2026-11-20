import { useState, useEffect } from 'react';
import { getBdusPublicConfig } from '../../utils/bdus-config';
import { bdusRecord, normalizeBdusRecord } from '../../utils/bdus-client';

export interface UseRecordFetcherOptions {
  /** Which backend to fetch from. Defaults to 'bdus' when PUBLIC_BDUS_URL is set, else 'directus'. */
  source?: 'directus' | 'bdus';
  /** Directus base URL. Defaults to PUBLIC_DIRECTUS_URL env var. */
  directusUrl?: string;
  /** Directus static token. Defaults to PUBLIC_DIRECTUS_TOKEN env var. */
  directusToken?: string;
  /** bdus5 base URL (e.g. "https://bdus.lad-sapienza.it/<app>"). Defaults to PUBLIC_BDUS_URL env var. */
  bdusUrl?: string;
  /** bdus5 token. Defaults to PUBLIC_BDUS_TOKEN env var. */
  bdusToken?: string;
  /**
   * Fields to fetch (Directus fields query). Ignored for bdus5, whose
   * full-record endpoint always returns every field.
   * Can be overridden per-request by a `fields` URL query parameter.
   * Defaults to `"*.*.*"`.
   */
  fields?: string;
}

export interface UseRecordFetcherResult {
  record: any | null;
  loading: boolean;
  error: boolean;
  table: string;
  id: string;
}

function defaultSource(): 'directus' | 'bdus' {
  return import.meta.env.PUBLIC_BDUS_URL ? 'bdus' : 'directus';
}

/**
 * React hook that reads `table`, `id`, and `fields` from the URL query
 * string and fetches the matching record, from Directus or bdus5.
 *
 * Designed to be called inside a user component that is itself hydrated by
 * Astro (`client:load` / `client:idle` etc.), avoiding the limitation that
 * Astro cannot serialize React components across the hydration boundary.
 *
 * @example
 * ```tsx
 * // src/components/RecordView.tsx
 * import { useRecordFetcher } from '@lad-sapienza/scms-core/components/Record';
 *
 * export default function RecordView() {
 *   const { record, loading, error, table, id } = useRecordFetcher();
 *
 *   if (loading) return <p>Loading…</p>;
 *   if (error || !record) return <p>Record not found.</p>;
 *
 *   return <h1>{record.title}</h1>;
 * }
 * ```
 *
 * ```astro
 * <!-- src/pages/record.astro -->
 * <RecordView client:load />
 * ```
 */
export function useRecordFetcher({
  source = defaultSource(),
  directusUrl = import.meta.env.PUBLIC_DIRECTUS_URL ?? '',
  directusToken = import.meta.env.PUBLIC_DIRECTUS_TOKEN ?? '',
  bdusUrl,
  bdusToken,
  fields: fieldsProp = '*.*.*',
}: UseRecordFetcherOptions = {}): UseRecordFetcherResult {
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [table, setTable] = useState('');
  const [id, setId] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const actualTable = params.get('table') ?? '';
    const actualId = params.get('id') ?? '';
    const fields = params.get('fields') ?? fieldsProp;

    setTable(actualTable);
    setId(actualId);

    if (!actualTable || !actualId) {
      setError(true);
      setLoading(false);
      return;
    }

    if (source === 'bdus') {
      const config = getBdusPublicConfig(bdusUrl, bdusToken);
      if (!config) {
        setError(true);
        setLoading(false);
        return;
      }
      const normalizedId = /^\d+$/.test(actualId) ? Number(actualId) : actualId;
      bdusRecord(config, actualTable, normalizedId)
        .then((raw) => {
          setRecord(normalizeBdusRecord(raw));
          setLoading(false);
        })
        .catch((err) => {
          console.error('useRecordFetcher: error fetching bdus5 record:', err);
          setError(true);
          setLoading(false);
        });
      return;
    }

    const url = `${directusUrl.replace(/\/$/, '')}/items/${actualTable}/${actualId}?fields=${encodeURIComponent(fields)}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (directusToken) {
      headers['Authorization'] = `Bearer ${directusToken}`;
    }

    fetch(url, { headers })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setRecord(data.data ?? data);
        setLoading(false);
      })
      .catch(err => {
        console.error('useRecordFetcher: error fetching record:', err);
        setError(true);
        setLoading(false);
      });
  }, [source, directusUrl, directusToken, bdusUrl, bdusToken, fieldsProp]);

  return { record, loading, error, table, id };
}
