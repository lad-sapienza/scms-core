# Changelog

All notable changes to `@lad-sapienza/scms-core`. Prereleases were published
under the `alpha` dist-tag. Versions up to `0.1.0-alpha.5` were not tagged in
git; their entries are grouped by date.

## Unreleased

### Added
- `SearchUINested` (`@lad-sapienza/scms-core/components/Search`, also from the
  root barrel): advanced search with nested AND/OR groups. Emits a
  Directus/bdus5 filter (`_and`/`_or`/…); for flat trees also the same
  `{connector, filters}` shape `SearchUI` produces. Per-field `ops`,
  `transformValue` and `buildFilter` hooks, restorable from a serialised
  string (`initialQuery`, invalid input → empty search), `onChange`,
  `submitOnEnter`, `showSummary`, `isLoading`. Pure helpers exported:
  `nestedToFilter`, `nestedToFlat`, `serializeNested`, `parseNested`,
  `describeNested`. New `search.nested.*` dictionary keys (English built in).
  `SearchUI*`, `Map` and shared types are unchanged. Docs:
  `components/Map/Search/README.md`.
- `package.json` `exports`: `./components/Search`.

## 0.3.3 — 2026-11-20

A patch: new, opt-in public entry point, no change required for sites that
don't use it. Fixes a doc inaccuracy from 0.3.0/0.3.1 (both previously
described `bdusQueryFull`/`bdusToFeatureCollection` as callable "from an
Astro component's own frontmatter" — true only once this patch actually
exposes them there).

### Added
- `@lad-sapienza/scms-core/integrations/bdusQuery`: `bdusListAll`,
  `bdusRecord`, `bdusQueryFull`, `bdusFullByFilter`, `bdusFindOne`,
  `bdusToFeatureCollection`, `normalizeBdusRecord`, `bdusFileUrl`,
  `getBdusServerConfig` — direct, build-time bdus5 queries for an Astro
  component's own frontmatter, a `getStaticPaths` function, or a build
  script, for when `bdusLoader`'s one-table-per-collection shape doesn't fit
  (a filter only known at build time, e.g. resolved from another record's
  own data). Node-only, like `bdusLoader`.

## 0.3.2 — 2026-11-20

A patch: new, opt-in helper for an existing pattern (`getStaticPaths` +
`RecordProvider`/`Field`), no change required for sites that don't use it.

### Added
- `recordStaticPaths` (`@lad-sapienza/scms-core/components/Record`): turns
  content-collection entries into `getStaticPaths`' return shape — the
  archival/"frozen" counterpart to `RecordFetcher`/`useRecordFetcher`. A
  record page built this way pre-renders one static page per row at build
  time, with zero runtime dependency on Directus/bdus5, instead of fetching
  client-side on every page view — the right choice for a finished research
  project whose database won't be kept running indefinitely. Works with any
  collection (Directus- or bdus5-backed, or any other loader) since it only
  relies on the standard `{id, data}` entry shape; `RecordProvider`/`Field`/
  `Image` are unchanged either way.

## 0.3.1 — 2026-11-20

A patch: closes a gap left by 0.3.0 — `Map` had no bdus5 support at all, so
bdus5 couldn't yet "cover everything" Directus does for this component.
No change required for sites that don't use it.

### Added
- `Map`'s `bdus` shorthand prop (and `OverlayLayerConfig.source: {type:
  'bdus', ...}`), mirroring `directus`: realtime-only, one request, plots a
  table whose coordinates are a plain `core` field (`geoField`, or
  `csv`-style lat/lng auto-detection).
- `dataToGeoJson`/`getGeoFields` now exported from
  `@lad-sapienza/scms-core/components/Map` — the build-time counterpart for
  a bdus5 table whose geometry lives in the `geodata` plugin table instead
  (one request per row, so it must be fetched at build time): convert a
  `bdusLoader`-backed content collection's entries with `dataToGeoJson`
  (already understands the `_geometry` property bdus5 normalization
  attaches) and pass the result to `geojson`. See `components/Map/README.md`
  → "bdus5 with full geometry" and the main README's "Directus vs. bdus5".

## 0.3.0 — 2026-11-20

A minor: new, opt-in data source, no change required for sites that don't
use it.

### Added
- **bdus5 (BraDypUS v5) support**, as a second data-source backend alongside
  Directus — same filter vocabulary, parallel entry points:
  - `DataTb`'s `bdus` shorthand prop and `'bdus'` `SourceConfig`/`BdusSource`
    (lean list, one request, like the existing `directus` source).
  - `RecordFetcher` / `useRecordFetcher` / `getRecord` now accept
    `source: 'bdus'` (or auto-detect from `PUBLIC_BDUS_URL`) for single-record
    detail pages.
  - `bdusLoader` (`@lad-sapienza/scms-core/integrations/bdusLoader`) for
    `content.config.ts`, mirroring `directusLoader`.
  - Internal `utils/bdus-client.ts` / `utils/bdus-config.ts` (`bdusListAll`,
    `bdusRecord`, `bdusQueryFull`, `normalizeBdusRecord`,
    `bdusToFeatureCollection`, `bdusFileUrl`) for build-time use (Astro
    frontmatter, custom loaders) when many rows need geometry/files/plugins —
    bdus5's full-record endpoint is one request *per row*, so that case is
    build-time only by design; see README "Directus vs. bdus5".
  - Env vars: `BDUS_BASE_URL` / `BDUS_API_KEY` (build-time only, never
    bundled to the client) for loaders and bulk/geo fetches; `PUBLIC_BDUS_URL`
    / `PUBLIC_BDUS_TOKEN` (client-exposed, like `PUBLIC_DIRECTUS_*`) for
    single-record fetches only.
  - `BdusShorthand`/`BdusListOptions` accept an optional `mode: 'realtime' |
    'build'`, declaring — and enforcing, not just documenting — which case a
    given config is for. Each entry point defaults to the only mode it
    actually supports and throws a clear error if you declare the other one
    (e.g. `bdus={{ tb, mode: 'build' }}` on `DataTb` throws immediately,
    telling you to use `bdusLoader`/`bdusQueryFull` instead).

## 0.2.1 — 2026-10-12

### Changed
- Peer dependency `astro` raised from `^7.2.4` to `^7.2.10`: this is what
  `@astrojs/mdx` 8 (a dependency since 0.2.0) already required, so no site that
  installed 0.2.0 is affected. `scms-create` now scaffolds
  `@astrojs/markdown-remark` `^7.3.0` instead of deriving it from the Astro
  version.

### Migrating a site
- If the site declares `@astrojs/markdown-remark` and its lockfile pins 7.2.x,
  the build fails with ``` `@astrojs/markdown-remark` is too old to render
  `.mdx` files ``` (see the 0.2.0 notes below).

## 0.2.0 — 2026-10-12

A minor, not a patch: sites depending on `^0.1.x` would otherwise pick this up
automatically (see `RELEASING.md`).

### Changed (breaking)
- `@astrojs/react` 6 → 7: the integration now uses `@vitejs/plugin-react` v6
  with Oxc for JSX and Fast Refresh. The `babel` option of `react()` is gone.
- `@astrojs/mdx` 7 → 8: MDX processing is delegated to Markdown processors.
  Needs `astro ^7.2.10`.
- `@directus/sdk` 21 → 27 (internal; the `directus` source options are
  unchanged). Not exercised against a live Directus instance by the test suite.

### Migrating a site
- Remove `overrides["@vitejs/plugin-react"]` from the site's `package.json`.
  With the override the build still works, but logs deprecation warnings and
  runs an unsupported combination.
- If the site declares `@astrojs/markdown-remark`, raise it to `^7.3.0`
  (`@astrojs/mdx` 8 requires it) and regenerate the lockfile:
  `npm install @astrojs/markdown-remark@^7.3.0`. `npm update` is not enough
  when the lockfile pins 7.2.x. Build error when it is too old:
  `` `@astrojs/markdown-remark` is too old to render `.mdx` files. Update it
  to the latest version: npm install @astrojs/markdown-remark@latest ``
- If the site passes `babel` to `react()`, move those plugins and presets to
  `@rolldown/plugin-babel` under `vite.plugins`.
- `@astrojs/react` 7 declares `oxc-transform-react` as a peer dependency.
- `maplibre-gl` stays at `^6.7.0` (the peer range is unchanged).

### Added
- `scms-create` templates ship `.github/dependabot.yml` and
  `.github/workflows/dependabot-automerge.yml`; the deploy workflow now also
  runs a build-only check on pull requests.

### Internal
- GitHub Actions CI (typecheck, tests, build e2e) and Dependabot for this
  repository; vitest 5.

## 0.1.1 — 2026-10-11

### Fixed
- `<Map>` controls and popups were unstyled in production builds when the map
  was imported from an MDX content-collection entry rendered through a
  component that receives `Content` as a prop: the MapLibre CSS was emitted
  but never linked. `scms()` now links it from every page. Opt out with
  `scms({ mapCss: false })`.

## 0.1.0 — 2026-10-11

First stable release. The package is Astro-only (see README → Requirements) and
its public API is now defined by the `exports` map.

### Changed (breaking)
- `package.json` now declares an `exports` map. Only the documented entry
  points resolve; deep imports such as `components/DataTb/DataTbMdx`,
  `components/Record/useRecordFetcher` or anything under `utils/` no longer
  work. Use the public paths listed in the README.

### Removed (breaking)
- Legacy `MapComponent` export from the package root: import `Map` instead
  (`import { Map } from '@lad-sapienza/scms-core'`).
- Internal `MapCore` re-export from `components/Map`.

## 0.1.0-alpha.13 — 2026-10-11

### Added
- **Map:** `markers` shorthand for one or a few hand-placed points, with an
  optional `label` popup, and `markersZoom` to centre on them at a fixed zoom.
  A lone point no longer zooms to the maximum level under `fitToContent`.

## 0.1.0-alpha.12 — 2026-10-02

### Added
- `scms-optimize-images` command (JPG → lossy WebP, PNG → lossless WebP).

## 0.1.0-alpha.11 — 2026-09-08

### Changed
- **Map:** migrated to MapLibre GL JS v6 (requires WebGL2; peer dependency
  `maplibre-gl ^6`). The Web Worker is configured by the package itself.

## 0.1.0-alpha.10 — 2026-09-07

### Added
- Language-folder support in `scms-add-content` / `scms-add-collection`.

## 0.1.0-alpha.9 — 2026-08-28

### Fixed
- **Map:** render loop with the `geojson` / `csv` / `json` / `directus`
  shorthands.

## 0.1.0-alpha.8 — 2026-08-25

### Added
- **Map:** raster (XYZ / WMS) overlays, independent and toggleable alongside
  the radio-exclusive basemaps.

### Changed
- **Map:** `vectorLayers` / `VectorLayerConfig` renamed to `overlayLayers` /
  `OverlayLayerConfig`.

## 0.1.0-alpha.6 – alpha.7 — 2026-08-23

### Added
- `RedirectPage` component for static client-side redirects.

## 0.1.0-alpha.0 – alpha.5 — 2026-08-22/23

### Added
- Initial import from the sCMS core.
- `scms-create`, `scms-add-collection`, `scms-add-content` commands; default
  paths moved to `src/`.
- Locale-prefixed routing: `LocaleSwitcher`, active-link fix.
- Dark mode: `ThemeToggle`, anti-FOUC init.
- i18n dictionary mechanism for component strings.

### Fixed
- Pre-bundling of `papaparse` / `maplibre-gl` for dev-mode consumers.
- Level-3 dropdown menu unreachable on mobile in `BSNavbar`.
- `LayerControl` basemap radio buttons desynchronised from the active layer.
- Gallery empty-state placeholder markup and styles removed.
