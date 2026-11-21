import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  nestedCond as cond,
  nestedGroup as group,
  nestedToFilter,
  nestedToFlat,
  serializeNested,
  parseNested,
  addCondAt,
  addGroupAt,
  removeAt,
  setGroupOp,
  patchCondAt,
  type NestedFields,
} from '../components/Map/Search/nestedModel';
import { SearchUINested, describeNested } from '../components/Map/Search/SearchUINested';
import { createTranslator } from '../components/i18n/translator';
import { BUILTIN_DICTIONARY } from '../components/i18n/builtinDictionary';

// Invented data only.
const fields: NestedFields = {
  title: { label: 'Title', type: 'text', transformValue: (v) => v.toLowerCase() },
  kind: { label: 'Kind', type: 'select', values: ['jar', 'coin', 'lamp'] },
  height: { label: 'Height', type: 'number' },
  period: {
    label: 'Period',
    type: 'date',
    ops: ['overlap', 'within'],
    opLabels: { overlap: 'overlaps', within: 'contains year' },
    twoValueOps: ['overlap'],
    buildFilter: (c) => {
      const n = Number(c.v);
      if (c.v.trim() === '' || isNaN(n)) return null;
      const hi = c.v2.trim() === '' ? n : Number(c.v2);
      return c.o === 'within'
        ? { _and: [{ from: { _lte: n } }, { to: { _gte: n } }] }
        : { _and: [{ from: { _lte: hi } }, { to: { _gte: n } }] };
    },
  },
};

describe('nestedToFilter', () => {
  it('builds nested AND/OR and drops empty branches', () => {
    const g = group('AND', [
      cond('title', 'contains', 'Amphora'),
      group('OR', [cond('kind', 'eq', 'jar'), cond('kind', 'eq', 'coin')]),
      cond('title', 'contains', ''),
      group('OR', [cond('height', 'ge', '')]),
    ]);
    expect(nestedToFilter(g, fields)).toEqual({
      _and: [
        { title: { _icontains: 'amphora' } },
        { _or: [{ kind: { _eq: 'jar' } }, { kind: { _eq: 'coin' } }] },
      ],
    });
  });

  it('does not wrap a single child and returns null when empty', () => {
    expect(nestedToFilter(group('OR', [cond('kind', 'eq', 'lamp')]), fields)).toEqual({ kind: { _eq: 'lamp' } });
    expect(nestedToFilter(group('AND', [cond('title', 'contains', '')]), fields)).toBeNull();
    expect(nestedToFilter(group(), fields)).toBeNull();
  });

  it('empty / not empty: text checks null and "", numbers only null', () => {
    expect(nestedToFilter(group('AND', [cond('title', 'empty')]), fields)).toEqual({
      _or: [{ title: { _null: true } }, { title: { _eq: '' } }],
    });
    expect(nestedToFilter(group('AND', [cond('height', 'empty')]), fields)).toEqual({ height: { _null: true } });
    expect(nestedToFilter(group('AND', [cond('height', 'nempty')]), fields)).toEqual({ height: { _nnull: true } });
  });

  it('numbers become numbers; between handles one or two bounds', () => {
    expect(nestedToFilter(group('AND', [cond('height', 'between', '10', '20')]), fields)).toEqual({
      height: { _gte: 10, _lte: 20 },
    });
    expect(nestedToFilter(group('AND', [cond('height', 'between', '10')]), fields)).toEqual({ height: { _gte: 10 } });
    expect(nestedToFilter(group('AND', [cond('height', 'eq', 'abc')]), fields)).toBeNull();
  });

  it('uses buildFilter for custom fields and skips operators the field does not offer', () => {
    expect(nestedToFilter(group('AND', [cond('period', 'overlap', '100', '200')]), fields)).toEqual({
      _and: [{ from: { _lte: 200 } }, { to: { _gte: 100 } }],
    });
    expect(nestedToFilter(group('AND', [cond('kind', 'contains', 'x')]), fields)).toBeNull();
    expect(nestedToFilter(group('AND', [cond('nope', 'eq', 'x')]), fields)).toBeNull();
  });
});

describe('nestedToFlat', () => {
  it('matches the SearchUI shape for flat trees', () => {
    const g = group('OR', [cond('title', 'contains', 'Lamp'), cond('height', 'ge', '5'), cond('kind', 'eq', '')]);
    expect(nestedToFlat(g, fields)).toEqual({
      connector: '_or',
      filters: [
        { field: 'title', operator: '_icontains', value: 'lamp' },
        { field: 'height', operator: '_gte', value: 5 },
      ],
    });
  });

  it('is undefined for nested groups and inexpressible operators, empty for no conditions', () => {
    expect(nestedToFlat(group('AND', [group('OR', [cond('kind', 'eq', 'jar')])]), fields)).toBeUndefined();
    expect(nestedToFlat(group('AND', [cond('height', 'between', '1', '2')]), fields)).toBeUndefined();
    expect(nestedToFlat(group('AND', [cond('title', 'empty')]), fields)).toBeUndefined();
    expect(nestedToFlat(group('AND', [cond('period', 'within', '5')]), fields)).toBeUndefined();
    expect(nestedToFlat(group('AND', [cond('title', 'contains', '')]), fields)).toEqual({ connector: '_or', filters: [] });
  });
});

describe('serialize / parse', () => {
  it('round-trips', () => {
    const g = group('OR', [cond('title', 'contains', 'x'), group('AND', [cond('period', 'overlap', '1', '9')])]);
    expect(parseNested(serializeNested(g), fields)).toEqual(g);
    expect(parseNested(g, fields)).toEqual(g);
  });

  it('never throws; invalid input gives an empty group', () => {
    const empty = group();
    expect(parseNested('{not json', fields)).toEqual(empty);
    expect(parseNested(null, fields)).toEqual(empty);
    expect(parseNested('["A",["unknown","eq","1"]]', fields)).toEqual(empty);
    expect(parseNested('["A",["kind","contains","1"]]', fields)).toEqual(empty);
    expect(parseNested('["A",["__proto__","eq","1"]]', fields)).toEqual(empty);
    expect(parseNested('["X"]', fields)).toEqual(empty);
    expect(parseNested('42', fields)).toEqual(empty);
  });

  it('rejects absurdly deep or large trees', () => {
    let deep: unknown = ['A', ['kind', 'eq', 'jar']];
    for (let i = 0; i < 20; i++) deep = ['A', deep];
    expect(parseNested(JSON.stringify(deep), fields)).toEqual(group());
    const big = ['A', ...Array.from({ length: 500 }, () => ['kind', 'eq', 'jar'])];
    expect(parseNested(JSON.stringify(big), fields)).toEqual(group());
  });
});

describe('tree editing', () => {
  const base = group('AND', [cond('title', 'contains', 'a'), group('OR', [cond('kind', 'eq', 'jar')])]);

  it('adds, patches, toggles and removes without mutating', () => {
    const snapshot = JSON.stringify(base);
    const a = addCondAt(base, [1], cond('height', 'eq', '3'));
    expect((a.items[1] as any).items).toHaveLength(2);
    const b = addGroupAt(a, [], group('AND', []));
    expect(b.items).toHaveLength(3);
    expect(setGroupOp(base, [1], 'AND').items[1]).toMatchObject({ op: 'AND' });
    expect(patchCondAt(base, [0], { v: 'zz' }).items[0]).toMatchObject({ v: 'zz' });
    expect(removeAt(base, [1, 0]).items[1]).toMatchObject({ items: [] });
    expect(removeAt(base, [0]).items).toHaveLength(1);
    expect(removeAt(base, [])).toBe(base);
    expect(removeAt(base, [9])).toBe(base);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});

describe('SearchUINested (static render)', () => {
  const noop = () => {};
  const html = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(SearchUINested, { fields, onSearch: noop, ...props }));

  it('renders a blank condition with field, operator and value controls', () => {
    const out = html();
    expect(out).toContain('data-nested-group');
    expect(out).toContain('aria-label="Field"');
    expect(out).toContain('aria-label="Operator"');
    expect(out).toContain('aria-label="Value"');
    expect(out).toContain('>Title</option>');
    expect(out).toContain('Add condition');
    expect(out).toContain('Add group');
  });

  it('shows AND/OR as pressed toggle buttons', () => {
    const out = html({ initialQuery: '["O",["title","contains","x"]]' });
    expect(out).toMatch(/aria-pressed="true"[^>]*>Any</);
    expect(out).toMatch(/aria-pressed="false"[^>]*>All</);
  });

  it('restores an initial query, including nested groups and a value select', () => {
    const out = html({ initialQuery: '["A",["title","contains","amphora"],["O",["kind","eq","coin"]]]' });
    expect(out).toContain('value="amphora"');
    expect(out.match(/data-nested-group/g)).toHaveLength(2);
    expect(out.match(/data-nested-cond/g)).toHaveLength(2);
    expect(out).toContain('<option value="coin" selected');
  });

  it('falls back to one blank condition on broken input', () => {
    const out = html({ initialQuery: '{broken' });
    expect(out.match(/data-nested-cond/g)).toHaveLength(1);
  });

  it('shows the second input only for two-value operators and hides summary on request', () => {
    expect(html({ initialQuery: '["A",["height","between","1","2"]]' })).toContain('aria-label="Upper value"');
    expect(html({ initialQuery: '["A",["height","eq","1"]]' })).not.toContain('Upper value');
    expect(html({ showSummary: false })).not.toContain('data-nested-summary');
  });

  it('reports a missing field list instead of crashing', () => {
    expect(html({ fields: {} })).toContain('No searchable fields');
  });
});

describe('describeNested', () => {
  const t = createTranslator({ locale: 'en', defaultLocale: 'en' }, BUILTIN_DICTIONARY);
  it('writes a readable sentence', () => {
    const g = group('AND', [cond('title', 'contains', 'x'), group('OR', [cond('kind', 'eq', 'jar'), cond('height', 'between', '1', '2')])]);
    expect(describeNested(g, fields, t)).toBe('Title contains «x» AND (Kind is «jar» OR Height is between «1 to 2»)');
    expect(describeNested(group(), fields, t)).toBe('—');
    expect(describeNested(group('AND', [cond('period', 'overlap', '1')]), fields, t)).toBe('Period overlaps «1»');
  });
});
