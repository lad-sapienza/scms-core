import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  bdusListAll,
  bdusRecord,
  normalizeBdusRecord,
  bdusQueryFull,
  bdusToFeatureCollection,
  bdusFileUrl,
} from '../utils/bdus-client';
import type { BdusServerConfig } from '../utils/bdus-config';

const config: BdusServerConfig = { baseUrl: 'https://bdus.lad-sapienza.it/fortnet', apiKey: 'read-only-key' };

function jsonResponse(body: any, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bdusListAll', () => {
  it('sends per_page/page/filter/fields/sort_field in the bdus5 request shape and returns flat rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'success', total: 1, data: [{ id: 98, site_name: 'Acquedotto di Butrinto' }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const rows = await bdusListAll(config, 'sites', {
      filter: { typology: { _icontains: 'fort' } },
      fields: ['id', 'site_name'],
      sortField: 'site_name',
      sortDir: 'desc',
    });

    expect(rows).toEqual([{ id: 98, site_name: 'Acquedotto di Butrinto' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://bdus.lad-sapienza.it/fortnet/api/records/sites');
    expect(init.headers.Authorization).toBe('Bearer read-only-key');
    expect(JSON.parse(init.body)).toEqual({
      per_page: 200,
      page: 1,
      filter: { typology: { _icontains: 'fort' } },
      fields: ['id', 'site_name'],
      sort_field: 'site_name',
      sort_dir: 'desc',
    });
  });

  it('paginates until every row is collected', async () => {
    const page1 = { status: 'success', total: 3, data: [{ id: 1 }, { id: 2 }] };
    const page2 = { status: 'success', total: 3, data: [{ id: 3 }] };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(page1)).mockResolvedValueOnce(jsonResponse(page2));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await bdusListAll(config, 'sites');
    expect(rows).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('applies limit after fetching', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: 'success', total: 2, data: [{ id: 1 }, { id: 2 }] }))
    );
    const rows = await bdusListAll(config, 'sites', { limit: 1 });
    expect(rows).toEqual([{ id: 1 }]);
  });

  it('throws on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)));
    await expect(bdusListAll(config, 'sites')).rejects.toThrow(/HTTP 500/);
  });

  it('throws on a bdus5 status:"error" payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: 'error', code: 'not_enough_privilege' }))
    );
    await expect(bdusListAll(config, 'sites')).rejects.toThrow(/not_enough_privilege/);
  });

  it('retries a 429 with backoff instead of failing the build', async () => {
    const tooMany = {
      ok: false,
      status: 429,
      headers: { get: () => null },
      json: async () => ({ status: 'error', code: 'too_many_requests' }),
      text: async () => '{"status":"error","code":"too_many_requests"}',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tooMany)
      .mockResolvedValueOnce(jsonResponse({ status: 'success', total: 1, data: [{ id: 1 }] }));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await bdusListAll(config, 'sites');
    expect(rows).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 10000);
});

describe('bdusRecord', () => {
  it('GETs the full-record endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'success', core: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await bdusRecord(config, 'sites', 98);
    expect(fetchMock.mock.calls[0][0]).toBe('https://bdus.lad-sapienza.it/fortnet/api/record/sites/98');
  });
});

describe('normalizeBdusRecord', () => {
  const raw = {
    metadata: { rec_id: 98 },
    core: {
      id: { name: 'id', val: 98 },
      site_name: { name: 'site_name', val: 'Acquedotto di Butrinto' },
      typology: { name: 'typology', val: 'infrastructure' },
      ancient_name: { name: 'ancient_name', val: null },
    },
    geodata: {
      91: { geometry: { name: 'geometry', val: 'POINT(20 39)' }, geojson: { type: 'Point', coordinates: [20, 39] } },
    },
    files: [{ id: 1 }],
    plugins: { samples: [] },
    bibliography: [{ id: 1, title: 'Ugolini 1937' }],
  };

  it('flattens core.<field>.val to top-level keys', () => {
    const flat = normalizeBdusRecord(raw);
    expect(flat.id).toBe(98);
    expect(flat.site_name).toBe('Acquedotto di Butrinto');
    expect(flat.typology).toBe('infrastructure');
    expect(flat.ancient_name).toBeNull();
  });

  it('exposes the first geodata entry geojson as _geometry, and keeps the rest under _-prefixed keys', () => {
    const flat = normalizeBdusRecord(raw);
    expect(flat._geometry).toEqual({ type: 'Point', coordinates: [20, 39] });
    expect(flat._files).toEqual([{ id: 1 }]);
    expect(flat._plugins).toEqual({ samples: [] });
    expect(flat._bibliography).toEqual([{ id: 1, title: 'Ugolini 1937' }]);
  });

  it('sets _geometry to null when there is no geodata', () => {
    const flat = normalizeBdusRecord({ metadata: { rec_id: 1 }, core: { id: { val: 1 } } });
    expect(flat._geometry).toBeNull();
  });
});

describe('bdusQueryFull / bdusToFeatureCollection', () => {
  it('rejects mode: "realtime" — always fetches full detail per row, never page-view-safe', async () => {
    await expect(bdusQueryFull(config, 'sites', { mode: 'realtime' })).rejects.toThrow(/never safe to run on a page view/);
  });


  it('fetches full detail for every matching row and builds a FeatureCollection from _geometry', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: any) => {
      if (url.endsWith('/api/records/sites')) {
        return Promise.resolve(jsonResponse({ status: 'success', total: 2, data: [{ id: 1 }, { id: 2 }] }));
      }
      if (url.endsWith('/api/record/sites/1')) {
        return Promise.resolve(
          jsonResponse({
            status: 'success',
            core: { id: { val: 1 }, site_name: { val: 'A' } },
            geodata: { 1: { geojson: { type: 'Point', coordinates: [1, 1] } } },
          })
        );
      }
      if (url.endsWith('/api/record/sites/2')) {
        // No geodata -> should be skipped from the FeatureCollection.
        return Promise.resolve(jsonResponse({ status: 'success', core: { id: { val: 2 }, site_name: { val: 'B' } } }));
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const records = await bdusQueryFull(config, 'sites');
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.site_name)).toEqual(['A', 'B']);

    const fc = await bdusToFeatureCollection(config, 'sites');
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0]).toMatchObject({ id: 1, geometry: { type: 'Point', coordinates: [1, 1] } });
    expect(fc.features[0].properties).toEqual({ id: 1, site_name: 'A' });
  });
});

describe('bdusFileUrl', () => {
  it('builds the public file URL', () => {
    expect(bdusFileUrl('fortnet', 42, 'jpg')).toBe('https://bdus.lad-sapienza.it/projects/fortnet/files/42.jpg');
  });

  it('accepts a custom files host', () => {
    expect(bdusFileUrl('fortnet', 42, 'jpg', 'https://files.example.org/')).toBe(
      'https://files.example.org/projects/fortnet/files/42.jpg'
    );
  });
});
