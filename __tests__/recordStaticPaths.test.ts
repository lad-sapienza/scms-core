import { describe, it, expect } from 'vitest';
import { recordStaticPaths } from '../components/Record/staticPaths';

const entries = [
  { id: '98', data: { id: 98, site_name: 'Acquedotto di Butrinto', slug: 'acquedotto-butrinto' } },
  { id: '241', data: { id: 241, site_name: 'Allamani', slug: 'allamani' } },
];

describe('recordStaticPaths', () => {
  it('builds one path per entry, keyed by the entry id, with the full record as a prop', () => {
    const paths = recordStaticPaths(entries);
    expect(paths).toEqual([
      { params: { id: '98' }, props: { record: entries[0].data } },
      { params: { id: '241' }, props: { record: entries[1].data } },
    ]);
  });

  it('supports a custom param name', () => {
    const paths = recordStaticPaths(entries, { param: 'invno' });
    expect(paths[0].params).toEqual({ invno: '98' });
  });

  it('supports keying by a data field instead of the entry id', () => {
    const paths = recordStaticPaths(entries, { idField: 'slug' });
    expect(paths.map((p) => p.params.id)).toEqual(['acquedotto-butrinto', 'allamani']);
  });

  it('returns an empty array for an empty collection', () => {
    expect(recordStaticPaths([])).toEqual([]);
  });
});
