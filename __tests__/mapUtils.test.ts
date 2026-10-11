import { describe, it, expect } from 'vitest';
import {
  getGeoFields,
  dataToGeoJson,
  markersToGeoJson,
  expandXyzSubdomains,
  buildWmsUrl,
  parseStringTemplate,
  filterObjectToPredicate,
  searchQueryToMapLibreFilter,
  searchQueryToPredicate,
} from '../components/Map/utils';

describe('getGeoFields', () => {
  it('detects common lat/lng column names case-insensitively', () => {
    expect(getGeoFields({ Latitude: 1, Longitude: 2 })).toEqual({ latField: 'Latitude', lngField: 'Longitude' });
    expect(getGeoFields({ y: 1, x: 2 })).toEqual({ latField: 'y', lngField: 'x' });
  });

  it('returns null when a coordinate column is missing', () => {
    expect(getGeoFields({ lat: 1, name: 'a' })).toBeNull();
  });
});

describe('dataToGeoJson', () => {
  it('returns an empty collection for empty data', () => {
    expect(dataToGeoJson([])).toEqual({ type: 'FeatureCollection', features: [] });
  });

  it('builds points from auto-detected lat/lng, as [lng, lat]', () => {
    const fc = dataToGeoJson([{ lat: '41.9', lng: '12.5', name: 'Roma' }]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [12.5, 41.9] });
    expect(fc.features[0].properties).toMatchObject({ name: 'Roma' });
  });

  it('honours custom lng/lat field names', () => {
    const fc = dataToGeoJson([{ E: 12.5, N: 41.9 }], 'E', 'N');
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [12.5, 41.9] });
  });

  it('skips rows with non-numeric coordinates', () => {
    const fc = dataToGeoJson([
      { lat: 'x', lng: 'y' },
      { lat: 1, lng: 2 },
    ]);
    expect(fc.features).toHaveLength(1);
  });

  it('returns no features when lat/lng cannot be detected', () => {
    expect(dataToGeoJson([{ foo: 1 }]).features).toEqual([]);
  });

  it('parses a geometry from geoField, accepting JSON strings', () => {
    const geom = { type: 'Point', coordinates: [1, 2] };
    const fc = dataToGeoJson([{ id: 7, geometry: JSON.stringify(geom), name: 'a' }], undefined, undefined, 'geometry');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual(geom);
  });

  it('passes through rows that already carry a _geometry', () => {
    const geom = { type: 'Point', coordinates: [1, 2] };
    const fc = dataToGeoJson([{ _geometry: geom, name: 'a' }]);
    expect(fc.features[0].geometry).toEqual(geom);
  });
});

describe('markersToGeoJson', () => {
  it('accepts a single marker', () => {
    const fc = markersToGeoJson({ lng: 12.5, lat: 41.9, label: 'Roma' });
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [12.5, 41.9] });
    expect(fc.features[0].properties).toEqual({ label: 'Roma' });
  });

  it('accepts an array and defaults the label to an empty string', () => {
    const fc = markersToGeoJson([{ lng: 1, lat: 2 }, { lng: 3, lat: 4, label: 'B' }]);
    expect(fc.features.map(f => f.properties)).toEqual([{ label: '' }, { label: 'B' }]);
  });

  it('coerces numeric strings and drops invalid coordinates', () => {
    const fc = markersToGeoJson([
      { lng: '12.5' as any, lat: '41.9' as any },
      { lng: NaN, lat: 1 },
      { lng: undefined as any, lat: 1 },
    ]);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [12.5, 41.9] });
  });

  it('keeps 0 as a valid coordinate', () => {
    expect(markersToGeoJson({ lng: 0, lat: 0 }).features).toHaveLength(1);
  });
});

describe('expandXyzSubdomains', () => {
  it('expands {s} into a/b/c', () => {
    expect(expandXyzSubdomains('https://{s}.tile.test/{z}/{x}/{y}.png')).toEqual([
      'https://a.tile.test/{z}/{x}/{y}.png',
      'https://b.tile.test/{z}/{x}/{y}.png',
      'https://c.tile.test/{z}/{x}/{y}.png',
    ]);
  });

  it('wraps a url without {s} unchanged', () => {
    expect(expandXyzSubdomains('https://t.test/{z}/{x}/{y}.png')).toEqual(['https://t.test/{z}/{x}/{y}.png']);
  });
});

describe('buildWmsUrl', () => {
  it('builds a GetMap template with the bbox placeholder and defaults', () => {
    const url = buildWmsUrl({ type: 'wms', url: 'https://wms.test/ows', layers: 'topp:states' });
    expect(url.startsWith('https://wms.test/ows?')).toBe(true);
    const params = new URL(url.replace('{bbox-epsg-3857}', '0,0,1,1')).searchParams;
    expect(params.get('service')).toBe('WMS');
    expect(params.get('request')).toBe('GetMap');
    expect(params.get('layers')).toBe('topp:states');
    expect(params.get('format')).toBe('image/png');
    expect(params.get('transparent')).toBe('true');
    expect(params.get('crs')).toBe('EPSG:3857');
    expect(url.endsWith('&bbox={bbox-epsg-3857}')).toBe(true);
  });

  it('appends with & when the endpoint already has a query string', () => {
    const url = buildWmsUrl({ type: 'wms', url: 'https://wms.test/ows?map=a.map', layers: 'x' });
    expect(url).toContain('https://wms.test/ows?map=a.map&service=WMS');
  });
});

describe('parseStringTemplate', () => {
  it('substitutes values and leaves the template markup alone', () => {
    expect(parseStringTemplate('<b>${name}</b>: ${n}', { name: 'Roma', n: 3 })).toBe('<b>Roma</b>: 3');
  });

  it('HTML-escapes interpolated values (popup content may be untrusted data)', () => {
    expect(parseStringTemplate('${x}', { x: '<img src=x onerror="a()">' })).toBe(
      '&lt;img src=x onerror=&quot;a()&quot;&gt;'
    );
  });

  it('renders missing fields as empty', () => {
    expect(parseStringTemplate('[${nope}]', {})).toBe('[]');
  });
});

describe('filterObjectToPredicate', () => {
  const row = (properties: Record<string, any>) => ({ type: 'Feature', geometry: null, properties } as any);

  it('applies _eq loosely (CSV strings vs booleans/numbers)', () => {
    const p = filterObjectToPredicate({ Middle_Bronze: { _eq: 'true' } });
    expect(p(row({ Middle_Bronze: 'true' }))).toBe(true);
    expect(p(row({ Middle_Bronze: 'false' }))).toBe(false);
  });

  it('works on plain rows as well as features', () => {
    const p = filterObjectToPredicate({ n: { _gt: 5 } });
    expect(p({ n: 6 })).toBe(true);
    expect(p({ n: 5 })).toBe(false);
  });

  it('ANDs multiple operators and fields', () => {
    const p = filterObjectToPredicate({ n: { _gte: 1, _lt: 10 }, kind: { _in: ['a', 'b'] } });
    expect(p({ n: 5, kind: 'a' })).toBe(true);
    expect(p({ n: 10, kind: 'a' })).toBe(false);
    expect(p({ n: 5, kind: 'c' })).toBe(false);
  });

  it('handles _contains, _ncontains, _null and _nnull', () => {
    expect(filterObjectToPredicate({ s: { _contains: 'ro' } })({ s: 'Roma' })).toBe(false); // case-sensitive
    expect(filterObjectToPredicate({ s: { _contains: 'Ro' } })({ s: 'Roma' })).toBe(true);
    expect(filterObjectToPredicate({ s: { _ncontains: 'Ro' } })({ s: 'Roma' })).toBe(false);
    expect(filterObjectToPredicate({ s: { _null: true } })({ s: null })).toBe(true);
    expect(filterObjectToPredicate({ s: { _nnull: true } })({ s: null })).toBe(false);
  });
});

describe('searchQueryToMapLibreFilter', () => {
  it('returns null for an empty query', () => {
    expect(searchQueryToMapLibreFilter({ connector: '_and', filters: [] })).toBeNull();
  });

  it('returns a bare expression for a single filter', () => {
    expect(
      searchQueryToMapLibreFilter({ connector: '_and', filters: [{ field: 'a', operator: '_eq', value: 1 }] })
    ).toEqual(['==', ['get', 'a'], 1]);
  });

  it('combines filters with all/any by connector', () => {
    const filters = [
      { field: 'a', operator: '_eq', value: 1 },
      { field: 'b', operator: '_gt', value: 2 },
    ];
    expect((searchQueryToMapLibreFilter({ connector: '_and', filters }) as any[])[0]).toBe('all');
    expect((searchQueryToMapLibreFilter({ connector: '_or', filters }) as any[])[0]).toBe('any');
  });
});

describe('searchQueryToPredicate', () => {
  it('matches everything for an empty query', () => {
    expect(searchQueryToPredicate({ connector: '_and', filters: [] })({ a: 1 })).toBe(true);
  });

  it('ORs filters when the connector is _or', () => {
    const p = searchQueryToPredicate({
      connector: '_or',
      filters: [
        { field: 'a', operator: '_eq', value: 1 },
        { field: 'b', operator: '_eq', value: 2 },
      ],
    });
    expect(p({ a: 9, b: 2 })).toBe(true);
    expect(p({ a: 9, b: 9 })).toBe(false);
  });
});
