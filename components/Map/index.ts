export { Map } from './MapMdx';
export { defaultBasemaps, getBasemap, getBasemaps } from './defaultBasemaps';
export type { BasemapKey } from './defaultBasemaps';
export type { OverlayLayerConfig } from './types';
export * from './types';

/**
 * Converts rows already carrying a `_geometry` property (as produced by
 * `normalizeBdusRecord`/`bdusLoader`, or any other build-time-fetched,
 * already-geolocated data) into a `FeatureCollection` ready for `geojson`.
 * This is the "cover everything" build-time counterpart to this component's
 * `bdus` (and `directus`) shorthand: those only ever do a cheap, realtime
 * fetch (no geometry from bdus5's `geodata` plugin table, which costs one
 * request per row — see the main package README's "Directus vs. bdus5"
 * table). For that case, fetch at build time instead (`bdusLoader` in
 * `content.config.ts`, or `bdusQueryFull`/`bdusToFeatureCollection` from an
 * Astro component's own frontmatter) and convert the result with this
 * function before passing it to `geojson`:
 *
 * ```astro
 * ---
 * import { getCollection } from 'astro:content';
 * import { Map, dataToGeoJson } from '@lad-sapienza/scms-core/components/Map';
 *
 * const sites = await getCollection('sites'); // bdusLoader-backed collection
 * const geojson = dataToGeoJson(sites.map((entry) => entry.data));
 * ---
 * <Map geojson={geojson} client:only="react" />
 * ```
 */
export { dataToGeoJson, getGeoFields } from './utils';
