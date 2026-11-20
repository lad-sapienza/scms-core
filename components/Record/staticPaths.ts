/**
 * Static record pages — the archival/"frozen" counterpart to
 * RecordFetcher/useRecordFetcher.
 *
 * RecordFetcher/useRecordFetcher fetch client-side, on every page view: the
 * site keeps working after a rebuild stops happening, but only as long as
 * the backend (Directus/bdus5) stays up. For a finished research project —
 * the common academic case where the database is retired once the grant
 * ends — a dynamic route using getStaticPaths pre-renders one page per
 * record at build time instead, so the output has zero runtime backend
 * dependency and can be archived as-is (e.g. a GitHub Release, deposited to
 * Zenodo for a DOI).
 *
 * This is deliberately a pure function, not an astro:content wrapper: pass
 * it whatever a content collection's getCollection() already gave you (or
 * any array shaped the same way) and it returns getStaticPaths' expected
 * shape. RecordProvider/Field/Image don't care whether `record` came from a
 * fetch or a static collection — the rest of the Record API is unchanged.
 */

export interface RecordEntryLike {
  /** The collection entry's own id, as astro:content sets it (e.g. the loader's `store.set({ id, data })`). */
  id: string;
  data: Record<string, any>;
}

export interface RecordStaticPathsOptions {
  /** URL param name for the dynamic route segment, e.g. `id` for `[id].astro`. Default: `'id'`. */
  param?: string;
  /** Use this field from the entry's `data` as the param value, instead of the entry's own `id`. */
  idField?: string;
}

export interface StaticPath {
  params: Record<string, string>;
  props: { record: Record<string, any> };
}

/**
 * Converts content-collection entries (or anything shaped like one) into
 * Astro's `getStaticPaths` return shape — one path per record, the full
 * record passed through as a prop.
 *
 * ```astro
 * ---
 * // src/pages/record/sites/[id].astro
 * import { getCollection } from 'astro:content';
 * import { recordStaticPaths, RecordProvider, Field } from '@lad-sapienza/scms-core/components/Record';
 *
 * export async function getStaticPaths() {
 *   const sites = await getCollection('sites'); // a bdusLoader/directusLoader-backed collection
 *   return recordStaticPaths(sites);
 * }
 *
 * const { record } = Astro.props;
 * ---
 * <RecordProvider record={record}>
 *   <h1><Field name="site_name" /></h1>
 * </RecordProvider>
 * ```
 */
export function recordStaticPaths(
  entries: RecordEntryLike[],
  options: RecordStaticPathsOptions = {}
): StaticPath[] {
  const param = options.param ?? 'id';

  return entries.map((entry) => ({
    params: { [param]: options.idField ? String(entry.data[options.idField]) : entry.id },
    props: { record: entry.data },
  }));
}
