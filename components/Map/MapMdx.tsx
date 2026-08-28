/**
 * MDX-safe wrapper for Map component
 */

import { useMemo } from 'react';
import { Map as MapCore } from './Map';
import type { MapProps } from './types';

export function Map(props: MapProps) {
  // Add props validation
  if (!props) {
    console.warn('Map component received undefined props');
    return null;
  }

  // Memoize center prop
  const stableCenter = useMemo(() => props?.center, [props?.center]);
  
  // Memoize array/object props to prevent unnecessary re-renders in MDX
  const stableBaseLayers = useMemo(() => props?.baseLayers, [JSON.stringify(props?.baseLayers || [])]);
  const stableOverlayLayers = useMemo(() => props?.overlayLayers, [JSON.stringify(props?.overlayLayers || [])]);
  const stableGeojson = useMemo(() => props?.geojson, [JSON.stringify(props?.geojson || null)]);
  const stableCsv = useMemo(() => props?.csv, [JSON.stringify(props?.csv || null)]);
  const stableJson = useMemo(() => props?.json, [JSON.stringify(props?.json || null)]);
  // `directus` feeds the same `implicitSource` → `allOverlayLayers` memo chain
  // as `geojson`/`csv`/`json`; without stabilising it here an inline
  // `directus={{ table: '…' }}` object from MDX gets a new identity on every
  // render and drives the same render loop the others are memoised against.
  const stableDirectus = useMemo(() => props?.directus, [JSON.stringify(props?.directus || null)]);

  return (
    <MapCore
      {...props}
      center={stableCenter}
      baseLayers={stableBaseLayers}
      overlayLayers={stableOverlayLayers}
      geojson={stableGeojson}
      csv={stableCsv}
      json={stableJson}
      directus={stableDirectus}
    />
  );
}
