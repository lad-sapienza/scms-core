# Map Component

Interactive map built on [MapLibre GL JS](https://maplibre.org/) (via
`@vis.gl/react-maplibre`). Renders a raster basemap, any number of toggleable
overlay layers pulled from heterogeneous data sources (GeoJSON, CSV, JSON,
Directus, a generic API, or raster XYZ/WMS tiles), and a built-in layer
control for switching basemaps and toggling overlays.

## Basic usage

```mdx
import { Map } from '@lad-sapienza/scms-core';

<Map />
```

With no props, `Map` renders a single OSM basemap centered on `0,0` at zoom
`2`. The shorthand props below cover the common single-layer case without
touching `overlayLayers` directly:

```mdx
<Map geojson="/data/sites.geojson" popup="<b>${name}</b>" fitToContent />

<Map csv={{ path: '/data/sites.csv', lng: 'longitude', lat: 'latitude' }} />

<Map directus={{ table: 'sites', geoField: 'location' }} />
```

`geojson`/`csv`/`json`/`directus` each accept either a bare string (path/URL)
or an object with `name`, `style`, `popup`, `fitToContent`, `filter` — see
`MapProps` in [`types.ts`](./types.ts) for the exact shape of each.

## Base layers (`baseLayers`)

Base layers are **radio-exclusive** — exactly one is visible at a time,
switched via the layer control's "BASE MAPS" section. Accepts either keys
from the built-in registry ([`defaultBasemaps.ts`](./defaultBasemaps.ts): OSM,
EsriSatellite, EsriStreets, EsriTopo, GoogleSatellite/Roadmap/Terrain,
CartoDB, Imperium, CAWM, ...) or custom `BaseLayerConfig` objects, and the two
forms can be mixed in the same array:

```mdx
<Map baseLayers={['OSM', 'EsriSatellite']} />

<Map baseLayers={[
  { name: 'My WMTS', url: 'https://tiles.example.org/{z}/{x}/{y}.png', tileSize: 512 },
  'OSM',
]} />
```

`{s}` in a tile URL (subdomain rotation, e.g. `https://{s}.tile.osm.org/...`)
is expanded automatically into `a`/`b`/`c`. `tileSize` defaults to 256 and
only needs setting for services that don't use standard 256px tiles.

## Overlay layers (`overlayLayers`)

Overlays are **independent and toggleable** (checkbox in the layer control) —
any number can be visible at once, layered on top of the basemap in array
order. Each entry is a `name` plus a `source`, where `source.type` picks one
of two families:

**Row/feature sources** — fetched once, converted to GeoJSON, and rendered as
a MapLibre `circle`/custom-style layer. Supports `style` (paint/layout
overrides), `popupTemplate`, `fitToContent`, `filter`, `searchInFields`:

| `source.type` | Notes |
|---|---|
| `geojson` | `{ data }` inline or `{ url }` to fetch |
| `csv` | `{ url, lng?, lat?, delimiter?, skipRows? }` — auto-detects lat/lng column names if `lng`/`lat` aren't given |
| `json` | `{ data }` inline array or `{ url }` |
| `directus` | Directus collection query, `geoField` names the geometry column |
| `api` | Generic `{ url, method?, headers?, body?, transformer? }` |
| `vector` | MapLibre vector-tile source (only produced internally when parsing a full `mapStyle`) |

If two overlay entries point at the exact same `source` (deep-equal), the
underlying fetch happens only once — each entry's own `filter` is applied on
top of the shared cached data, so e.g. the same Directus table can back
several differently-filtered/styled layers without redundant requests.

**Raster tile sources** — rendered directly as MapLibre raster tiles (same
code path as `baseLayers`), never fetched/converted. `style`, `popupTemplate`,
`fitToContent`, `filter` and `searchInFields` don't apply to these:

```mdx
<Map
  baseLayers={['OSM']}
  overlayLayers={[{
    name: 'Satellite',
    source: { type: 'xyz', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  }]}
/>
```

This is the case that motivated adding raster support to `overlayLayers` in
the first place: a raster layer (historical map, satellite imagery, ...)
shown as an independent overlay on top of a basemap the user picks — not
possible before, since a raster source could previously only be a
radio-exclusive `baseLayers` entry.

`XyzSourceConfig`: `{ type: 'xyz', url, tileSize?, attribution? }` — same
`{s}` subdomain expansion and `tileSize` default as `baseLayers`.

`WmsSourceConfig`: `{ type: 'wms', url, layers, format?, version?, transparent?, styles?, crs?, tileSize?, attribution? }` builds a GetMap tile URL
using MapLibre's `{bbox-epsg-3857}` placeholder. Defaults: `format:
'image/png'`, `version: '1.3.0'`, `transparent: true`, `crs: 'EPSG:3857'`,
`tileSize: 256`.

```mdx
<Map overlayLayers={[{
  name: 'Historical layer',
  source: {
    type: 'wms',
    url: 'https://wms.example.org/geoserver/wms',
    layers: 'workspace:layer_name',
  },
}]} />
```

Both raster source types need the tile server to send CORS headers
(`Access-Control-Allow-Origin`) — MapLibre renders tiles as WebGL textures,
which browsers refuse to upload cross-origin without a successful CORS
check, unlike a plain `<img>`-based renderer (e.g. Leaflet). If tiles fail to
load with a CORS error in the console, the fix is on the tile server, not
here — for object-storage-backed static tile sets (e.g. OpenStack Swift),
this is typically one container-metadata header
(`X-Container-Meta-Access-Control-Allow-Origin: *`).

## Controls

| Prop | Type | Default | Description |
|---|---|---|---|
| `layerControl` | `boolean \| ControlPosition` | `'top-right'` | Basemap radio + overlay checkboxes. `false` hides it. |
| `navigationControl` | `ControlPosition` | `'top-left'` | Zoom +/- and compass |
| `geolocateControl` | `ControlPosition` | — | "find my location" |
| `fullscreenControl` | `ControlPosition` | — | Fullscreen toggle |
| `scaleControl` | `ControlPosition` | — | Scale bar |

`ControlPosition` is one of `'top-right' | 'top-left' | 'bottom-right' |
'bottom-left'`.

## Full style mode (`mapStyle`)

Pass a full MapLibre style URL/object via `mapStyle` to bypass `baseLayers`/
`overlayLayers` resolution entirely — raster sources in the style become
basemap entries, vector-tile layers become overlay entries, and
`styleOverrides` can patch individual style layers' `paint`/`layout` plus
add `popupTemplate`/`fitToContent`/`visible` (properties the style spec
itself has no room for). See `MapProps` in [`types.ts`](./types.ts) for the
exact shape.

## Props

### `Map`

| Prop | Type | Default | Description |
|---|---|---|---|
| `height` | `string` | `'600px'` | CSS height |
| `center` | `string` | `'0,0,2'` | `"lng,lat,zoom"` |
| `baseLayers` | `(BaseLayerConfig \| BasemapKey)[]` | `['OSM']` | See above |
| `overlayLayers` | `OverlayLayerConfig[]` | `[]` | See above |
| `mapStyle` | `string \| object` | — | Full MapLibre style, see above |
| `styleOverrides` | `object` | — | Per-layer patches when using `mapStyle` |
| `geojson` / `csv` / `json` / `directus` | — | — | Single-layer shorthands, see Basic usage |
| `sprite` | `string` | — | Sprite URL |

### `BaseLayerConfig`

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Label in the layer control |
| `url` | `string` | Tile URL template, `{z}/{x}/{y}` (+ optional `{s}`) |
| `attribution` | `string?` | Attribution HTML |
| `tileSize` | `number?` | Default 256 |

### `OverlayLayerConfig`

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Label in the layer control |
| `source` | `SourceConfig \| XyzSourceConfig \| WmsSourceConfig` | See above |
| `style` | `any?` | MapLibre paint/layout override (row/feature sources only) |
| `popupTemplate` | `string?` | e.g. `"<b>${Title}</b>: ${Description}"` (row/feature sources only) |
| `visible` | `boolean?` | Initial visibility (default `true`) |
| `fitToContent` | `boolean?` | Fit map bounds to this layer's data on load (row/feature sources only) |
| `filter` | `FilterObject \| ((feature) => boolean)?` | Client-side filter (row/feature sources only) |
| `searchInFields` | `SearchInFields?` | Enables the per-layer search UI (row/feature sources only) |

## Architecture notes

- `Map.tsx` renders `RasterLayerLibre` for every `baseLayers` entry and for
  any `overlayLayers` entry whose `source.type` is `xyz`/`wms`; everything
  else goes through `fetchData`/`dataToGeoJson`
  ([`utils/data-fetcher.ts`](../../utils/data-fetcher.ts),
  [`utils.ts`](./utils.ts)) into a MapLibre `geojson` source.
- `LayerControl.tsx` is a plain MapLibre `IControl` (not a React child of the
  map) so it survives the basemap/overlay state living in `Map.tsx`'s own
  React state rather than needing a portal.
- `expandXyzSubdomains`/`buildWmsUrl` (in [`utils.ts`](./utils.ts)) are the
  only two functions that build tile URL templates — both `baseLayers` and
  raster `overlayLayers` go through them, so there's one place to fix or
  extend tile-URL construction.
