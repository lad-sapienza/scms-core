# Changelog

All notable changes to `@lad-sapienza/scms-core`. Prereleases were published
under the `alpha` dist-tag. Versions up to `0.1.0-alpha.5` were not tagged in
git; their entries are grouped by date.

## Unreleased

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
