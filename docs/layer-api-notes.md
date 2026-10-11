# Layer API — decisioni prese e implementate

Emerse portando il WebGIS di `borderscape` (Gatsby+Leaflet) su Astro + `Map` di scms-core.
Discusse e implementate. Riassunto per riferimento futuro.

## 1. Overlay raster (XYZ/WMS) indipendenti dal basemap

Prima: un layer raster poteva esistere solo come `baseLayers` (radio-esclusivo). Non c'era modo
di sovrapporre un overlay raster indipendente (es. un satellite storico) con checkbox propria.

Deliberatamente **non** si è fatto un redesign `role: base|overlay` con `layers[]` unico — quel
disegno rincorreva il vocabolario di MapLibre/Leaflet senza toccare il vero differenziale del
componente, cioè l'unificazione delle fonti dati non-GIS (Directus, CSV, JSON, in futuro
bradypus). Si è unificato solo a livello di **source**, dentro la pipeline overlay/checkbox già
esistente:

- `OverlayLayerConfig['source']` ora accetta, oltre a `SourceConfig` (csv/json/directus/api/
  geojson/vector), anche `XyzSourceConfig` (`{ type: 'xyz', url, tileSize?, attribution? }`) e
  `WmsSourceConfig` (`{ type: 'wms', url, layers, format?, version?, transparent?, styles?, crs?,
  tileSize?, attribution? }`) — vedi `components/Map/types.ts`.
- `Map.tsx` intercetta questi due tipi nel branch di rendering degli overlay e li renderizza con
  `RasterLayerLibre` (stesso componente usato per i basemap) invece di passare da
  `fetchData`/`dataToGeoJson`.
- `baseLayers` e la struttura di `LayerControl` (radio per i base, checkbox per gli overlay)
  restano invariati — un WMS come basemap radio-esclusivo non è stato implementato, non richiesto.

## 2. Supporto XYZ era incompleto — risolto

- `{s}` non veniva mai espanso (`RasterLayerLibre` riceveva `url={[layer.url]}`, un solo URL).
  Fix: `expandXyzSubdomains()` in `components/Map/utils.ts`, applicata sia ai basemap che agli
  overlay xyz. Rotazione fissa `a/b/c` (nessun caso d'uso richiede subdomain custom).
- `tileSize` ora esposto su `BaseLayerConfig` e sui due nuovi source type.

## 3. Rename `vectorLayers`/`VectorLayerConfig` → `overlayLayers`/`OverlayLayerConfig`

Il nome vecchio era fuorviante nel momento in cui la prop può contenere layer raster.
Breaking change (pre-1.0, un solo consumer interno: `ZoteroGeoViewer.tsx`, aggiornato).

## 4. Mini-cache per fetch ridondanti — risolta

Se più layer entry condividevano lo stesso `source` (stessa tabella/query, filtri o stili
diversi), ognuna lo rifetchava da zero: il vecchio dedup (`loadedLayers: Set<string>`) non lo
preveniva perché il controllo "già caricato?" avveniva in uno scan sincrono prima che il fetch
della prima entry completasse.

Fix: `rawSourceCache: Map<string, FeatureCollection>` (chiave `JSON.stringify(source)`) contiene
il GeoJSON grezzo pre-filtro; ogni layer applica il proprio `filter` sopra il dato cacheato,
senza rifetchare. Contestualmente rimosso anche il gate `layer.visible !== false` dalla
condizione di caricamento (bug correlato: un layer partito `visible:false` non veniva mai
caricato nemmeno dopo che l'utente lo spuntava, perché l'effetto dipendeva solo da
`[allOverlayLayers]`, non dal toggle di visibilità) — `visible` ora controlla solo la
visualizzazione iniziale, non il caricamento.

## 5. Render loop con gli shorthand `geojson` / `csv` / `json` / `directus` — risolto (alpha.9)

Emerso migrando `elamortuary`, ma riproducibile anche sul sito docs
(`/en/docs/components/map/`, primo esempio): usando **solo** uno shorthand e omettendo
`overlayLayers`, il componente entrava in loop di render — `Maximum update depth exceeded` a
ripetizione e `fitToContent` che riparte all'infinito (zoom lentissimo).

Causa: il default `overlayLayers = []` nella destrutturazione di `Map.tsx` allocava un array
nuovo a ogni render. Quell'array è dependency della `useMemo` di `allOverlayLayers`, quindi la
memo si ricalcolava ogni render → l'effetto di load keyed su `[allOverlayLayers]` rigirava →
`setLayersData` → re-render → loop.

Fix (due punti, minimi):

- `components/Map/Map.tsx`: hoist di `EMPTY_OVERLAY_LAYERS` a costante di modulo (stesso pattern
  di `DEFAULT_BASE_LAYERS`), usata come valore di default del parametro — riferimento stabile tra
  i render.
- `components/Map/MapMdx.tsx`: aggiunta la stabilizzazione di `directus` (`stableDirectus` via
  `JSON.stringify`), che alimentava la stessa catena `implicitSource` → `allOverlayLayers` degli
  altri shorthand ma non era memoizzata — un `directus={{ … }}` inline da MDX innescava lo stesso
  loop.

`overlayLayers={[…]}` esplicito non era mai stato colpito (è il pattern di FortNet): `MapMdx` lo
stabilizza già via `JSON.stringify`.
