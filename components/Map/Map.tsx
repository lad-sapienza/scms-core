import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import MapLibreMap, {
  NavigationControl,
  FullscreenControl,
  ScaleControl,
  GeolocateControl,
  Source,
  Layer,
  Popup,
  type MapRef
} from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapProps, OverlayLayerConfig } from './types';
import { RasterLayerLibre } from './RasterLayerLibre';
import { LayerControlIControl } from './LayerControl';
import { directusShorthandToConfig } from '../../utils/directus-config';
import type { BaseLayerConfig } from './types';
import { defaultBasemaps, getBasemap } from './defaultBasemaps';
import { fetchData } from '../../utils/data-fetcher';
import type { SourceConfig } from '../../utils/data-fetcher';
import { dataToGeoJson, parseStringTemplate, filterObjectToPredicate, searchQueryToMapLibreFilter, searchQueryToPredicate, expandXyzSubdomains, buildWmsUrl } from './utils';
import { useTranslation } from '../i18n';
import type { FeatureCollection } from 'geojson';
import type { CircleLayerSpecification } from 'maplibre-gl';
import type { SearchQuery } from './types';

// Default base layer (OSM)
const DEFAULT_BASE_LAYERS: BaseLayerConfig[] = [defaultBasemaps.OSM];

// Vector-tile, xyz and wms sources are rendered natively/via RasterLayerLibre
// and never go through fetchData — this narrows the union so TS knows
// `layer.source` is a plain SourceConfig wherever this guard is used.
function isFetchableLayer(layer: OverlayLayerConfig): layer is OverlayLayerConfig & { source: SourceConfig } {
  return layer.source.type !== 'vector' && layer.source.type !== 'xyz' && layer.source.type !== 'wms';
}

export function Map({
  height = '600px',
  center = '0,0,2',
  mapStyle,
  styleOverrides,
  baseLayers = DEFAULT_BASE_LAYERS,
  overlayLayers = [],
  geolocateControl,
  fullscreenControl,
  navigationControl = 'top-left',
  scaleControl,
  layerControl = 'top-right',
  geojson,
  csv,
  json,
  directus,
}: MapProps) {
  const t = useTranslation();
  const [lng, lat, zoom] = center.split(',').map(Number);
  const [activeBaseLayer, setActiveBaseLayer] = useState<number>(0);
  const [layersData, setLayersData] = useState<Record<string, FeatureCollection>>({});
  const [hoveredFeature, setHoveredFeature] = useState<any>(null);
  const [overlayLayerVisibility, setOverlayLayerVisibility] = useState<Record<string, boolean>>({});
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<MapRef>(null);
  const rawSourceCache = useRef<globalThis.Map<string, FeatureCollection>>(new globalThis.Map());
  const layerControlRef = useRef<LayerControlIControl | null>(null);
  const [parsedStyleLayers, setParsedStyleLayers] = useState<{
    baseLayers: BaseLayerConfig[];
    overlayLayers: OverlayLayerConfig[];
  }>({ baseLayers: [], overlayLayers: [] });
  const [mergedMapStyle, setMergedMapStyle] = useState<any>(null);
  const [layerExpansions, setLayerExpansions] = useState<Record<string, {
    popupTemplate?: string;
    fitToContent?: boolean;
  }>>({});
  const [layerSearchQueries, setLayerSearchQueries] = useState<Record<string, SearchQuery>>({});

  // Parse mapStyle JSON to extract layers and apply overrides
  useEffect(() => {
    if (!mapStyle) {
      setParsedStyleLayers({ baseLayers: [], overlayLayers: [] });
      setMergedMapStyle(null);
      setLayerExpansions({});
      return;
    }

    const parseStyle = async () => {
      try {
        let styleObj: any;
        
        if (typeof mapStyle === 'string') {
          // Fetch from URL
          const response = await fetch(mapStyle);
          styleObj = await response.json();
        } else {
          styleObj = { ...mapStyle };
        }

        const baseLayers: BaseLayerConfig[] = [];
        const overlayLayers: OverlayLayerConfig[] = [];
        const expansions: Record<string, any> = {};

        // Apply styleOverrides to layers
        if (styleOverrides && styleObj.layers) {
          styleObj.layers = styleObj.layers.map((layer: any) => {
            const override = styleOverrides[layer.id];
            if (!override) return layer;

            // Merge paint and layout properties
            const mergedLayer = { ...layer };
            if (override.paint) {
              mergedLayer.paint = { ...layer.paint, ...override.paint };
            }
            if (override.layout) {
              mergedLayer.layout = { ...layer.layout, ...override.layout };
            }
            if (override.visible !== undefined) {
              mergedLayer.layout = {
                ...mergedLayer.layout,
                visibility: override.visible ? 'visible' : 'none'
              };
            }

            // Store expanded properties separately
            if (override.popupTemplate || override.fitToContent !== undefined) {
              expansions[layer.id] = {
                popupTemplate: override.popupTemplate,
                fitToContent: override.fitToContent
              };
            }

            return mergedLayer;
          });
        }

        setLayerExpansions(expansions);

        // Extract raster sources as base layers
        if (styleObj.sources) {
          Object.entries(styleObj.sources).forEach(([sourceId, source]: [string, any]) => {
            if (source.type === 'raster') {
              // Find the layer that uses this source to get metadata
              const layer = styleObj.layers?.find((l: any) => l.source === sourceId);
              const name = layer?.metadata?.label || sourceId;
              
              baseLayers.push({
                name,
                url: source.tiles?.[0] || '',
                attribution: source.attribution
              });
            }
          });
        }

        // Extract vector layers
        if (styleObj.layers) {
          styleObj.layers.forEach((layer: any) => {
            if (layer.type !== 'raster' && layer.source) {
              const source = styleObj.sources[layer.source];
              if (source && source.type === 'vector') {
                const expansion = expansions[layer.id] || {};
                overlayLayers.push({
                  name: layer.metadata?.label || layer.id,
                  source: {
                    type: 'vector',
                    url: source.url || source.tiles?.[0]
                  },
                  style: layer,
                  visible: layer.layout?.visibility !== 'none',
                  popupTemplate: expansion.popupTemplate,
                  fitToContent: expansion.fitToContent
                });
              }
            }
          });
        }

        setParsedStyleLayers({ baseLayers, overlayLayers });
        setMergedMapStyle(styleObj);
      } catch (error) {
        console.error('Failed to parse mapStyle:', error);
        setParsedStyleLayers({ baseLayers: [], overlayLayers: [] });
        setMergedMapStyle(null);
        setLayerExpansions({});
      }
    };

    parseStyle();
  }, [mapStyle, styleOverrides]);

  // Resolve baseLayers - support both BaseLayerConfig[] and BasemapKey[], or mixed arrays
  const resolvedBaseLayers = useMemo(() => {
    // If using mapStyle, use parsed base layers from style JSON
    if (mapStyle && parsedStyleLayers.baseLayers.length > 0) {
      return parsedStyleLayers.baseLayers;
    }
    
    if (!baseLayers || baseLayers.length === 0) return DEFAULT_BASE_LAYERS;
    
    // Handle mixed arrays: resolve each element individually
    return baseLayers.map(layer => {
      if (typeof layer === 'string') {
        // It's a basemap key - resolve it
        return getBasemap(layer);
      }
      // It's already a BaseLayerConfig object
      return layer as BaseLayerConfig;
    }).filter((config): config is BaseLayerConfig => config !== undefined);
  }, [baseLayers, mapStyle, parsedStyleLayers.baseLayers]);

  // Determine implicit source configuration from shorthand props
  const implicitSource = useMemo(() => {
    if (geojson) {
      if (typeof geojson === 'string') {
        return { type: 'geojson', url: geojson } as const;
      } else if ('path' in geojson) {
        return { type: 'geojson', url: geojson.path } as const;
      } else {
        return { type: 'geojson', data: geojson } as const;
      }
    }
    if (csv) {
      if (typeof csv === 'string') {
        return { type: 'csv', url: csv } as const;
      } else {
        return { type: 'csv', url: csv.path, lng: csv.lng, lat: csv.lat } as const;
      }
    }
    if (json) return { type: 'json', data: Array.isArray(json) ? json : undefined, url: typeof json === 'string' ? json : undefined } as const;
    if (directus) {
      const config = directusShorthandToConfig({
        table: directus.table,
        queryString: directus.queryString,
        url: directus.url,
        token: directus.token
      });
      
      // Add geoField if it's a map component using directus
      if (config && directus.geoField) {
        config.geoField = directus.geoField;
      }
      
      return config;
    }
    return null;
  }, [geojson, csv, json, directus]);

  // Combine explicit overlayLayers with implicit source
  const allOverlayLayers = useMemo(() => {
    let layers = [...overlayLayers];

    // If using mapStyle, add parsed vector layers from style JSON
    if (mapStyle && parsedStyleLayers.overlayLayers.length > 0) {
      layers = [...parsedStyleLayers.overlayLayers, ...layers];
    }
    
    if (implicitSource) {
      let layerName = t('map.defaultLayerName');
      const layerConfig: any = {
        name: layerName,
        source: implicitSource,
        fitToContent: true, // default to true
        visible: true,
        filter: undefined // will be set below if provided
      };
      
      // Add style, popup, name, and fitToContent from shorthand config if provided
      if (geojson && typeof geojson === 'object' && 'path' in geojson) {
        if (geojson.name) layerConfig.name = geojson.name;
        if (geojson.style) layerConfig.style = geojson.style;
        if (geojson.popup) layerConfig.popupTemplate = geojson.popup;
        if (geojson.fitToContent !== undefined) layerConfig.fitToContent = geojson.fitToContent;
        if (geojson.filter) {
          // Convert filter object to predicate function if needed
          layerConfig.filter = typeof geojson.filter === 'function' 
            ? geojson.filter 
            : filterObjectToPredicate(geojson.filter);
        }
      }
      if (csv && typeof csv === 'object' && 'path' in csv) {
        if (csv.name) layerConfig.name = csv.name;
        if (csv.style) layerConfig.style = csv.style;
        if (csv.popup) layerConfig.popupTemplate = csv.popup;
        if (csv.fitToContent !== undefined) layerConfig.fitToContent = csv.fitToContent;
        if (csv.filter) {
          // Convert filter object to predicate function if needed
          layerConfig.filter = typeof csv.filter === 'function' 
            ? csv.filter 
            : filterObjectToPredicate(csv.filter);
        }
      }
      if (directus) {
        if (directus.name) layerConfig.name = directus.name;
        if (directus.style) layerConfig.style = directus.style;
        if (directus.popup) layerConfig.popupTemplate = directus.popup;
        if (directus.fitToContent !== undefined) layerConfig.fitToContent = directus.fitToContent;
      }
      
      layers.push(layerConfig);
    }
    return layers;
  }, [overlayLayers, implicitSource, geojson, csv, mapStyle, parsedStyleLayers.overlayLayers]);

  // Initialize and update visibility when layers change
  useEffect(() => {
    setOverlayLayerVisibility(prev => {
      const newVisibility: Record<string, boolean> = { ...prev };
      let hasChanges = false;

      allOverlayLayers.forEach(layer => {
        const layerId = `layer-${layer.name.replace(/\s+/g, '-')}`;

        if (newVisibility[layerId] === undefined) {
          newVisibility[layerId] = layer.visible !== false;
          hasChanges = true;
        }
      });

      return hasChanges ? newVisibility : prev;
    });
  }, [allOverlayLayers]);

  // Handle overlay layer visibility toggle
  //
  // Wrapped in useCallback (both here and below) so its identity stays
  // stable across renders — it's one of two functions passed into the
  // "add LayerControl as an IControl" effect's dependency array. Left as a
  // plain function, it got a new reference on *every* render (including
  // the one triggered by clicking a basemap radio, since that sets
  // activeBaseLayer state on this very component), which spuriously
  // refired that effect on every click. Each refire tore down the old
  // IControl and created a fresh one — and since the cleanup removed
  // whatever layerControlRef.current happened to point to *at cleanup
  // time* rather than the specific instance being torn down, the freshly
  // created (correct) control was the one actually getting removed a tick
  // later, leaving the stale first control (still showing the original
  // basemap selected) as the only one left on the map.
  const handleOverlayLayerToggle = useCallback((layerId: string) => {
    setOverlayLayerVisibility(prev => ({
      ...prev,
      [layerId]: !prev[layerId]
    }));
  }, []);

  // Handle search for overlay layers — see handleOverlayLayerToggle above.
  const handleLayerSearch = useCallback((layerId: string, query: SearchQuery) => {
    setLayerSearchQueries(prev => ({
      ...prev,
      [layerId]: query
    }));
  }, []);

  // Load data for all fetchable overlay layers (vector-tile, xyz and wms
  // sources are rendered natively/via RasterLayerLibre and never reach
  // fetchData). Raw fetched+converted GeoJSON is cached per unique source
  // (rawSourceCache, keyed by JSON.stringify(source)) so N layer entries
  // sharing the same source — differing only in filter/style — fetch once;
  // each layer's own filter is applied on top of the cached raw data.
  // Loading no longer depends on `visible`: visibility only controls
  // display (see the render below), not whether data is ever fetched —
  // otherwise a layer started as visible:false could never be loaded even
  // after the user later checks it on, since this effect only re-runs when
  // allOverlayLayers itself changes, not on a visibility toggle.
  useEffect(() => {
    const loadAllLayers = async () => {
      const fetchableLayers = allOverlayLayers.filter(isFetchableLayer);
      if (fetchableLayers.length === 0) return;

      const seen = new Set<string>();
      for (const layer of fetchableLayers) {
        const layerKey = JSON.stringify(layer.source);
        if (rawSourceCache.current.has(layerKey) || seen.has(layerKey)) continue;
        seen.add(layerKey);

        try {
          const data = await fetchData(layer.source);

          // Extract custom column names from CSV source if provided
          const customLng = layer.source.type === 'csv' ? layer.source.lng : undefined;
          const customLat = layer.source.type === 'csv' ? layer.source.lat : undefined;

          // Extract geoField from Directus source if provided
          const geoField = layer.source.type === 'directus' ? layer.source.geoField : undefined;

          const geoJson = dataToGeoJson(data, customLng, customLat, geoField);
          rawSourceCache.current.set(layerKey, geoJson);
        } catch (err) {
          console.error(`Failed to load layer "${layer.name}":`, err);
          // Continue loading other layers even if one fails
        }
      }

      // Project cached raw data into each layer's own (filtered) view —
      // cheap client-side work, no network, safe to redo whenever
      // allOverlayLayers changes (e.g. a filter edit).
      const newLayersData: Record<string, FeatureCollection> = {};
      for (const layer of fetchableLayers) {
        const raw = rawSourceCache.current.get(JSON.stringify(layer.source));
        if (!raw) continue; // fetch failed for this source

        newLayersData[layer.name] = layer.filter && typeof layer.filter === 'function'
          ? { ...raw, features: raw.features.filter(layer.filter) }
          : raw;
      }

      if (Object.keys(newLayersData).length > 0) {
        setLayersData(prev => ({ ...prev, ...newLayersData }));
      }
    };

    if (allOverlayLayers.length > 0 && typeof window !== 'undefined') {
      loadAllLayers();
    }
  }, [allOverlayLayers]);

  // Handle fitToContent separately when map is loaded and data is ready
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded || Object.keys(layersData).length === 0) return;

    // Find first layer with fitToContent
    const layerToFit = allOverlayLayers.find(layer =>
      layer.fitToContent && layersData[layer.name] && layersData[layer.name].features.length > 0
    );

    if (!layerToFit) return;

    const geoJson = layersData[layerToFit.name];
    
    // Small delay to ensure map is fully ready
    setTimeout(() => {
      const coordinates = geoJson.features.flatMap(f => {
        const geom = f.geometry;
        if (geom.type === 'Point') {
          return [geom.coordinates];
        } else if (geom.type === 'LineString') {
          return geom.coordinates;
        } else if (geom.type === 'Polygon') {
          return geom.coordinates[0];
        } else if (geom.type === 'MultiPoint') {
          return geom.coordinates;
        } else if (geom.type === 'MultiLineString') {
          return geom.coordinates.flat();
        } else if (geom.type === 'MultiPolygon') {
          return geom.coordinates.map(p => p[0]).flat();
        }
        return [];
      });
      
      if (coordinates.length > 0) {
        const lons = coordinates.map(c => c[0]);
        const lats = coordinates.map(c => c[1]);
        const bounds: [[number, number], [number, number]] = [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)]
        ];
        map.fitBounds(bounds, { padding: 50, duration: 1000 });
      }
    }, 100);
  }, [mapLoaded, layersData, allOverlayLayers]);

  // Add LayerControl as a proper IControl
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded || !layerControl) return;

    // Show layer control if we have base layers or overlay layers
    const hasLayers = resolvedBaseLayers.length > 0 || allOverlayLayers.length > 0;
    if (!hasLayers) return;

    const position = typeof layerControl === 'string' ? layerControl : 'top-right';

    // Create and add control
    const control = new LayerControlIControl({
      baseLayers: resolvedBaseLayers,
      activeBaseLayer,
      onBaseLayerChange: setActiveBaseLayer,
      overlayLayers: allOverlayLayers.map(layer => ({
        ...layer,
        id: `layer-${layer.name.replace(/\s+/g, '-')}`
      })),
      overlayLayerVisibility,
      onOverlayLayerToggle: handleOverlayLayerToggle,
      onLayerSearch: handleLayerSearch,
      layerSearchQueries
    });

    layerControlRef.current = control;
    map.addControl(control, position);

    return () => {
      // Remove this specific control instance, not whatever
      // layerControlRef.current happens to point to when the timeout
      // fires — if this effect ever refires before the timeout runs, the
      // ref will already point at the *new* control, and reading it here
      // would remove that one instead of this (correct) cleanup target.
      setTimeout(() => {
        map.removeControl(control);
      }, 0);
    };
  }, [mapLoaded, layerControl, resolvedBaseLayers, allOverlayLayers.length, handleLayerSearch]);

  // Update layer control props when they change
  useEffect(() => {
    if (layerControlRef.current) {
      layerControlRef.current.updateProps({
        baseLayers: resolvedBaseLayers,
        activeBaseLayer,
        onBaseLayerChange: setActiveBaseLayer,
        overlayLayers: allOverlayLayers.map(layer => ({
          ...layer,
          id: `layer-${layer.name.replace(/\s+/g, '-')}`
        })),
        overlayLayerVisibility,
        onOverlayLayerToggle: handleOverlayLayerToggle,
        onLayerSearch: handleLayerSearch,
        layerSearchQueries
      });
    }
  }, [resolvedBaseLayers, activeBaseLayer, allOverlayLayers, overlayLayerVisibility, handleLayerSearch, layerSearchQueries]);

  // Control visibility of layers from style JSON
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded || !mapStyle) return;

    // Update visibility for vector layers from parsed style
    parsedStyleLayers.overlayLayers.forEach(layer => {
      const layerId = `layer-${layer.name.replace(/\s+/g, '-')}`;
      const isVisible = overlayLayerVisibility[layerId] !== false;

      // The original layer ID from the style JSON
      const styleLayerId = layer.style?.id;
      if (styleLayerId && map.getLayer(styleLayerId)) {
        map.setLayoutProperty(
          styleLayerId,
          'visibility',
          isVisible ? 'visible' : 'none'
        );
      }
    });
  }, [overlayLayerVisibility, mapLoaded, mapStyle, parsedStyleLayers.overlayLayers]);

  // Handle fitToContent for layers with expansions
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded || !mapStyle || Object.keys(layerExpansions).length === 0) return;

    // Find first layer with fitToContent: true
    const layerToFit = Object.entries(layerExpansions).find(([_, expansion]) => expansion.fitToContent);
    if (!layerToFit) return;

    const [layerId] = layerToFit;
    
    // Wait for the layer to be fully loaded
    const timeout = setTimeout(() => {
      try {
        // Query rendered features for the layer
        const features = map.queryRenderedFeatures(undefined, { layers: [layerId] });
        
        if (features && features.length > 0) {
          const coordinates = features.flatMap(f => {
            const geom = f.geometry;
            if (geom.type === 'Point') {
              return [geom.coordinates];
            } else if (geom.type === 'LineString') {
              return geom.coordinates;
            } else if (geom.type === 'Polygon') {
              return geom.coordinates[0];
            } else if (geom.type === 'MultiPoint') {
              return geom.coordinates;
            } else if (geom.type === 'MultiLineString') {
              return geom.coordinates.flat();
            } else if (geom.type === 'MultiPolygon') {
              return geom.coordinates.map(p => p[0]).flat();
            }
            return [];
          });
          
          if (coordinates.length > 0) {
            const lons = coordinates.map(c => c[0]);
            const lats = coordinates.map(c => c[1]);
            const bounds: [[number, number], [number, number]] = [
              [Math.min(...lons), Math.min(...lats)],
              [Math.max(...lons), Math.max(...lats)]
            ];
            map.fitBounds(bounds, { padding: 50, duration: 1000 });
          }
        }
      } catch (error) {
        console.error('Failed to fit bounds for layer:', layerId, error);
      }
    }, 1000);

    return () => clearTimeout(timeout);
  }, [mapLoaded, mapStyle, layerExpansions]);

  return (
    <div style={{ height, position: 'relative', width: '100%' }}>
      <MapLibreMap
        ref={mapRef}
        initialViewState={{
          longitude: lng,
          latitude: lat,
          zoom: zoom
        }}
        mapStyle={mergedMapStyle || mapStyle as any}
        style={{ width: '100%', height: '100%' }}
        onLoad={() => setMapLoaded(true)}
        onClick={(e: any) => {
          // Check if any vector layer with popup was clicked
          if (e.features && e.features.length > 0) {
            const clickedLayerId = e.features[0].layer?.id;
            
            // Check for popup in allOverlayLayers (includes parsed style layers)
            const layerConfig = allOverlayLayers.find(l => {
              const layerId = `layer-${l.name.replace(/\s+/g, '-')}`;
              return layerId === clickedLayerId;
            });
            
            // Also check if the clicked layer has popup expansion from styleOverrides
            const expansion = layerExpansions[clickedLayerId];
            const popupTemplate = layerConfig?.popupTemplate || expansion?.popupTemplate;
            
            if (popupTemplate) {
              setHoveredFeature({
                feature: e.features[0],
                lngLat: e.lngLat,
                template: popupTemplate
              });
            }
          }
        }}
        interactiveLayerIds={[
          ...allOverlayLayers.map(l => `layer-${l.name.replace(/\s+/g, '-')}`),
          ...Object.keys(layerExpansions) // Add layer IDs that have expansions
        ]}
      >
        {/* Base Layers (only if no full mapStyle is provided) - render ALL but control visibility */}
        {!mapStyle && resolvedBaseLayers.map((layer, index) => (
          <RasterLayerLibre
            key={`basemap-${index}`}
            id={`base-layer-${index}`}
            url={expandXyzSubdomains(layer.url)}
            attribution={layer.attribution}
            tileSize={layer.tileSize}
            visible={index === activeBaseLayer}
          />
        ))}

        {/* Overlay Layers from prop - render AFTER base layer so they appear on top */}
        {allOverlayLayers.map((layer) => {
          const layerId = `layer-${layer.name.replace(/\s+/g, '-')}`;
          const isVisible = overlayLayerVisibility[layerId] !== false;

          // Raster overlays (XYZ/WMS) render natively via MapLibre tiles —
          // they never go through fetchData/dataToGeoJson/layersData.
          if (layer.source.type === 'xyz' || layer.source.type === 'wms') {
            const urls = layer.source.type === 'xyz'
              ? expandXyzSubdomains(layer.source.url)
              : [buildWmsUrl(layer.source)];
            return (
              <RasterLayerLibre
                key={layerId}
                id={layerId}
                url={urls}
                tileSize={layer.source.tileSize}
                attribution={layer.source.attribution}
                visible={isVisible}
              />
            );
          }

          const geoJson = layersData[layer.name];
          const sourceId = `source-${layer.name}`;

          if (!geoJson) return null;

          // Apply search filter if present
          const searchQuery = layerSearchQueries[layerId];
          let filteredGeoJson = geoJson;
          
          if (searchQuery && searchQuery.filters && searchQuery.filters.length > 0) {
            // Try MapLibre filter first, fall back to client-side filtering
            try {
              const mapLibreFilter = searchQueryToMapLibreFilter(searchQuery);
              if (mapLibreFilter) {
                // Use MapLibre filtering for performance
                filteredGeoJson = geoJson;
              } else {
                // Fall back to client-side filtering
                const predicate = searchQueryToPredicate(searchQuery);
                filteredGeoJson = {
                  ...geoJson,
                  features: geoJson.features.filter(predicate)
                };
              }
            } catch (error) {
              console.warn('Error applying search filter, falling back to client-side filtering:', error);
              const predicate = searchQueryToPredicate(searchQuery);
              filteredGeoJson = {
                ...geoJson,
                features: geoJson.features.filter(predicate)
              };
            }
          }
          
          const defaultStyle: CircleLayerSpecification = {
            id: layerId,
            type: 'circle',
            source: sourceId,
            paint: {
              'circle-radius': 6,
              'circle-color': '#3b82f6',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
            }
          };
          
          // Merge custom style with default, ensuring id and source are preserved
          // Remove source-layer if present (only for vector tiles, not for GeoJSON sources)
          const customStyle = layer.style ? { ...layer.style } : {};
          delete customStyle['source-layer'];
          
          const layerStyle = layer.style 
            ? { ...defaultStyle, ...customStyle, id: layerId, source: sourceId }
            : defaultStyle;
          
          // Apply MapLibre filter if using server-side filtering
          const searchQuery2 = layerSearchQueries[layerId];
          const mapLibreFilter = searchQuery2 && searchQuery2.filters.length > 0 
            ? searchQueryToMapLibreFilter(searchQuery2) 
            : undefined;
          
          if (mapLibreFilter) {
            layerStyle.filter = mapLibreFilter;
          }
          
          return (
            <Source key={sourceId} id={sourceId} type="geojson" data={filteredGeoJson}>
              <Layer 
                {...layerStyle}
                layout={{
                  ...layerStyle.layout,
                  visibility: isVisible ? 'visible' : 'none'
                }}
              />
            </Source>
          );
        })}

        {/* Controls */}
        {geolocateControl && <GeolocateControl position={geolocateControl} />}
        {fullscreenControl && <FullscreenControl position={fullscreenControl} />}
        {navigationControl && <NavigationControl position={navigationControl} />}
        {scaleControl && <ScaleControl position={scaleControl} />}

        {/* LayerControl is now added via IControl in useEffect */}

        {/* Popup */}
        {hoveredFeature && (
          <Popup
            longitude={hoveredFeature.lngLat.lng}
            latitude={hoveredFeature.lngLat.lat}
            onClose={() => setHoveredFeature(null)}
            closeOnClick={false}
          >
            <div dangerouslySetInnerHTML={{ 
              __html: parseStringTemplate(
                hoveredFeature.template, 
                hoveredFeature.feature.properties
              ) 
            }} />
          </Popup>
        )}

      </MapLibreMap>
    </div>
  );
}
