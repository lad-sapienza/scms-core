# Changelog

All notable changes to `@lad-sapienza/scms-core`. Prereleases were published
under the `alpha` dist-tag. Versions up to `0.1.0-alpha.5` were not tagged in
git; their entries are grouped by date.

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
