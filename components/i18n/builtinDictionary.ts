import type { Dictionary } from './translator';

/**
 * scms-core's own English defaults for component-owned translation keys —
 * the ultimate fallback so every component works with sensible English text
 * out of the box, with zero site configuration. A site only needs to supply
 * keys it actually wants translated or overridden; anything it omits still
 * resolves here.
 *
 * Covers every React component's own strings (DataTb, Map/Search,
 * ZoteroGeoViewer, Gallery, Record, BSNavbar). Deliberately does NOT cover
 * `.astro`-only components (TableOfContents, Gallery.astro's empty state,
 * SEO) — those render server-side with no access to `window.__scmsI18n`
 * (see window.ts), and no locale-prop-threading convention has been
 * designed for them yet. Not a gap to "fix" casually — a real design
 * decision for a future pass, not this one.
 */
export const BUILTIN_DICTIONARY: Dictionary = {
  dataTb: {
    loading: 'Loading data...',
    empty: 'No data available',
    error: 'Error loading data',
    searchPlaceholder: 'Search...',
    // {page}/{totalPages} as named placeholders, not two separate "Page"/"of"
    // strings glued together — word order around numbers varies by language.
    paginationSummary: 'Page {page} of {totalPages}',
    rowsTotal: '({count} total)',
  },
  map: {
    defaultLayerName: 'Default Layer',
    baseMaps: 'Base Maps',
    searchLayer: 'Search {name}',
    active: '(Active)',
    closeModal: 'Close modal',
    search: {
      noFieldsConfigured: 'No searchable fields configured for this layer.',
      loading: 'Loading...',
      placeholder: 'Search...',
      submit: 'Search',
      clear: 'Clear',
      advancedSearch: 'Advanced Search',
      simpleSearch: 'Simple Search',
      addFilter: 'Add Filter',
      removeFilter: 'Remove filter',
      cannotRemoveLastFilter: 'Cannot remove the last filter',
      // Operator/connector *labels* only — the underscore-prefixed keys
      // used as filter values (_eq, _neq, _and, ...) are a wire format
      // (Directus-style filter operators), not UI text, and stay as-is.
      operators: {
        eq: 'Equals',
        neq: "Doesn't equal",
        lt: 'Less than',
        lte: 'Less than or equal to',
        gt: 'Greater than',
        gte: 'Greater than or equal to',
        null: 'Is null',
        nnull: "Isn't null",
        contains: 'Contains',
        icontains: 'Contains (case-insensitive)',
        ncontains: "Doesn't contain",
        startsWith: 'Starts with',
        istartsWith: 'Starts with (case-insensitive)',
        nstartsWith: "Doesn't start with",
        endsWith: 'Ends with',
        iendsWith: 'Ends with (case-insensitive)',
        nendsWith: "Doesn't end with",
      },
      connectors: {
        and: 'AND',
        or: 'OR',
      },
    },
  },
  gallery: {
    openImage: 'Open image: {alt}',
  },
  zoteroGeoViewer: {
    error: {
      title: 'Error loading Zotero data',
      propsUndefined: 'Component props are undefined',
      groupIdRequired: 'Group ID is required',
    },
    groupId: 'Group ID: {id}',
    loading: 'Loading...',
    loadingLibrary: 'Loading Zotero library...',
    noDataLoaded: 'No data loaded',
    // The vector layer name shown as a checkbox label in the map's own layer control.
    layerName: 'Zotero Items',
    popup: {
      // {count} is substituted verbatim as MapLibre's own "${propertyName}"
      // popup-template syntax, not resolved by t() itself — see
      // ZoteroGeoViewer.tsx for how the two templating layers combine.
      items: 'Items: {count}',
      showRecords: '📚 Show {count} records',
    },
    stats: {
      title: 'Library Statistics',
      totalItems: 'Total Items',
      georeferenced: 'Georeferenced',
    },
    search: {
      title: 'Search Tags',
      placeholder: 'Search for locations...',
      also: 'Also: {list}',
      moreCount: '+{count} more',
      clearSearch: 'Clear search',
      selected: 'Selected: {tag}',
      alsoIncludes: 'Also includes: {list}',
      helpText: 'Use the map markers to explore items at this location.',
    },
    recordsPreview: {
      title: 'Zotero records for {tag}',
      including: '(including: {list})',
      loading: 'Loading records...',
      error: 'Error: {message}',
      viewInLibrary: 'View in the Zotero Library',
      noRecords: 'No records found for this tag.',
    },
  },
  record: {
    loading: 'Loading record…',
    notFound: 'Record not found for table “{table}” with ID “{id}”.',
  },
  navbar: {
    toggleNavigation: 'Toggle navigation',
  },
};
