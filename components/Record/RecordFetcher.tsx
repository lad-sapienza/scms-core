import { useState, useEffect } from 'react';
import type { ComponentType } from 'react';
import { useTranslation } from '../i18n';
import { getBdusPublicConfig } from '../../utils/bdus-config';
import { bdusRecord, normalizeBdusRecord } from '../../utils/bdus-client';

function defaultSource(): 'directus' | 'bdus' {
  return import.meta.env.PUBLIC_BDUS_URL ? 'bdus' : 'directus';
}

export interface RecordFetcherProps {
  /** Which backend to fetch from. Defaults to 'bdus' when PUBLIC_BDUS_URL is set, else 'directus'. */
  source?: 'directus' | 'bdus';
  /** Directus base URL. Defaults to PUBLIC_DIRECTUS_URL env var. */
  directusUrl?: string;
  /** Directus static token for authentication. Defaults to PUBLIC_DIRECTUS_TOKEN env var. */
  directusToken?: string;
  /** bdus5 base URL. Defaults to PUBLIC_BDUS_URL env var. */
  bdusUrl?: string;
  /** bdus5 token. Defaults to PUBLIC_BDUS_TOKEN env var. */
  bdusToken?: string;
  /**
   * Fields to fetch (Directus fields query, e.g. `"*.*.*"`). Ignored for
   * bdus5, whose full-record endpoint always returns every field.
   * Defaults to `"*.*.*"`.
   */
  fields?: string;
  /**
   * User-provided layout component that receives the fetched `record` as a prop.
   * It also receives `table` and `id` for context.
   */
  Layout: ComponentType<{ record: any; table: string; id: string }>;
  /** Optional custom loading component. */
  LoadingComponent?: ComponentType;
  /** Optional custom error component. */
  ErrorComponent?: ComponentType<{ table: string; id: string }>;
}

function DefaultLoading() {
  const t = useTranslation();
  return (
    <div style={{ padding: '2rem', opacity: 0.5 }}>
      {t('record.loading')}
    </div>
  );
}

function DefaultError({ table, id }: { table: string; id: string }) {
  const t = useTranslation();
  return (
    <div style={{ padding: '2rem', color: 'red' }}>
      {t('record.notFound', { table, id })}
    </div>
  );
}

/**
 * Core component that reads `table`, `id`, and `fields` from the URL query
 * string, fetches the matching Directus record, and renders the user-supplied
 * `Layout` component with the resolved `record` object.
 *
 * **Usage in an Astro page:**
 * ```astro
 * ---
 * import { RecordFetcher } from '@lad-sapienza/scms-core/components/Record';
 * import MyLayout from '@components/MyRecordLayout.tsx';
 * ---
 * <RecordFetcher Layout={MyLayout} client:load />
 * ```
 *
 * **User layout** only needs to accept `record`:
 * ```tsx
 * export default function MyRecordLayout({ record }) {
 *   return <h1>{record.title}</h1>;
 * }
 * ```
 *
 * URL query parameters recognised:
 * - `table` — Directus collection name (required)
 * - `id`    — Record primary key (required)
 * - `fields` — Directus fields selector (optional, overrides the `fields` prop)
 */
export function RecordFetcher({
  source = defaultSource(),
  directusUrl = import.meta.env.PUBLIC_DIRECTUS_URL ?? '',
  directusToken = import.meta.env.PUBLIC_DIRECTUS_TOKEN ?? '',
  bdusUrl,
  bdusToken,
  fields: fieldsProp = '*.*.*',
  Layout,
  LoadingComponent = DefaultLoading,
  ErrorComponent = DefaultError,
}: RecordFetcherProps) {
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
          console.error('RecordFetcher: error fetching bdus5 record:', err);
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
        console.error('RecordFetcher: error fetching record:', err);
        setError(true);
        setLoading(false);
      });
  }, [source, directusUrl, directusToken, bdusUrl, bdusToken, fieldsProp]);

  if (loading) return <LoadingComponent />;
  if (error || !record) return <ErrorComponent table={table} id={id} />;

  return <Layout record={record} table={table} id={id} />;
}

export default RecordFetcher;
