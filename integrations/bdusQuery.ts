/**
 * Direct, build-time bdus5 queries — for an Astro component's own
 * frontmatter, a `getStaticPaths` function, or a build script, when
 * `bdusLoader`'s fixed one-table-per-collection shape doesn't fit: a filter
 * only known at build time (e.g. resolved from another record's own data —
 * ghazni's "finds linked to this funerary complex" is exactly this), or a
 * query you don't want declared as a whole content collection.
 *
 * Node-only, like `bdusLoader` — never import this from a React component
 * or anything that reaches the browser bundle; it uses `BDUS_API_KEY`
 * (never `PUBLIC_`), the same env pair `bdusLoader`/`getBdusServerConfig`
 * read.
 */
export {
  bdusListAll,
  bdusRecord,
  bdusQueryFull,
  bdusFullByFilter,
  bdusFindOne,
  bdusToFeatureCollection,
  normalizeBdusRecord,
  bdusFileUrl,
} from '../utils/bdus-client';
export type { BdusListOptions, BdusGeoJsonOptions } from '../utils/bdus-client';
export { getBdusServerConfig } from '../utils/bdus-config';
export type { BdusServerConfig, BdusMode } from '../utils/bdus-config';
