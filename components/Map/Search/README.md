# SearchUINested

Advanced search with **nested AND/OR groups**: a group holds conditions and
further groups — *name contains "amphora" AND (material is ceramic OR material
is glass)*. Emits a Directus/bdus5 filter object (`_and`, `_or`, `_icontains`, …).

It complements `SearchUI`/`SearchUISimple`/`SearchUIAdvanced` (one flat list,
used by `Map`'s `searchInFields`) and does not change them. The nested output
is **not** consumed by `Map`: the map's search is flat by design. Use this for
searches that go to a `bdus`/`directus` source.

```tsx
import { SearchUINested } from '@lad-sapienza/scms-core/components/Search';
// also from '@lad-sapienza/scms-core'
```

Live examples, one per prop: the *Nested Search* page of the s:CMS docs site.

## Usage

```tsx
const fields = {
  name:     { label: 'Name' },                         // text (default)
  material: { label: 'Material', type: 'select', values: ['ceramic', 'bronze'] },
  height:   { label: 'Height (cm)', type: 'number' },
};

<SearchUINested
  fields={fields}
  onSearch={({ filter, flat, serialized }) => { /* ... */ }}
/>
```

### With a Directus collection

```tsx
<DataTb source={{ type: 'directus', config: { url, token }, collection: 'finds', filter }} />
```

### With a bdus5 table

```tsx
<DataTb source={{ type: 'bdus', tb: 'finds', config: { baseUrl, apiKey }, filter }} />
```

`filter` is `null` for an empty search: omit it then. (The `directus={{…}}` /
`bdus={{…}}` shorthands take a query string, not a filter object.)

## Props

| Prop | Type | Description |
|---|---|---|
| `fields` | `Record<string, NestedField>` | **Required.** Key = field name in the data source |
| `onSearch` | `(r: NestedSearchResult) => void` | **Required.** On submit (button or Enter) |
| `onChange` | `(r: NestedSearchResult) => void` | On every edit |
| `initialQuery` | `string \| NestedGroup \| null` | A serialised search or a group; invalid → empty search, never throws |
| `isLoading` | `boolean` | Disables controls, spinner on submit (default `false`) |
| `submitOnEnter` | `boolean` | Enter in a text input submits (default `true`) |
| `showSummary` | `boolean` | Plain-language summary line (default `true`) |

### `NestedField`

| Prop | Type | Description |
|---|---|---|
| `label` | `string` | Shown in the field menu |
| `type` | `'text' \| 'select' \| 'number' \| 'date'` | Default `text` |
| `values` | `string[]` | Predefined values → a menu instead of a text input |
| `ops` | `string[]` | Operators offered, replacing the type's defaults |
| `opLabels` | `Record<string, string>` | Labels for operator names without a built-in one |
| `twoValueOps` | `string[]` | Operators with a second value (default: `between`) |
| `transformValue` | `(value, cond) => string` | Rewrites typed values before they enter the filter (e.g. text normalisation) |
| `buildFilter` | `(cond) => object \| null` | Replaces the filter for this field (e.g. a date range over two columns); `null` = incomplete |

Built-in operators: `contains` (`_icontains`), `starts` (`_starts_with`), `eq`,
`neq`, `ge` (`_gte`), `le` (`_lte`), `between`, `empty`, `nempty`. Defaults:
text → contains, starts, eq, empty, nempty; select → eq, neq, empty, nempty;
number/date → eq, ge, le, between, empty, nempty. *Empty* on text/select matches
`null` and `''`; on number/date only `null`.

### `NestedSearchResult`

| Field | Description |
|---|---|
| `filter` | Directus/bdus5 filter, or `null` if empty. Incomplete conditions and empty groups are dropped; a single child is not wrapped |
| `flat` | `{ connector, filters }` as `SearchUI` produces — only for trees with no nested groups and only simple operators (no `between`, `empty`, custom ops, `buildFilter`); otherwise `undefined` |
| `group` | The tree |
| `serialized` | Compact JSON for a URL parameter, e.g. `["A",["name","contains","x"],["O",["material","eq","ceramic"]]]` |

## Restoring a search from the URL

```tsx
const q = new URLSearchParams(location.search).get('q');
<SearchUINested fields={fields} initialQuery={q}
  onChange={({ serialized }) => history.replaceState(null, '', `?q=${encodeURIComponent(serialized)}`)}
  onSearch={({ filter }) => run(filter)} />
```

The component never reads or writes `location`. Parsing validates: unknown
field, an operator the field does not offer, depth > 8 or > 200 nodes → empty
search.

## Translations

Keys `search.nested.*` in `BUILTIN_DICTIONARY` (English); add your own to a
site dictionary to translate. Operator labels: `search.nested.ops.<name>`
(or `opLabels` per field).

## Helpers

`nestedToFilter`, `nestedToFlat`, `serializeNested`, `parseNested`,
`describeNested`, `nestedGroup`, `nestedCond` are exported for use outside the
component (e.g. building the filter server-side from a `?q=` parameter).
