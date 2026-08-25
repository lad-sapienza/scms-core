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
