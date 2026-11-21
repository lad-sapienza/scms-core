import { useState, type KeyboardEvent } from 'react';
import { Search, X, Plus, Trash2 } from 'lucide-react';
// Direct imports (not the i18n barrel, which pulls in an .astro file) so the component stays unit-testable.
import { useTranslation } from '../../i18n/useTranslation';
import type { Translator } from '../../i18n/translator';
import {
  addCondAt,
  addGroupAt,
  blankCond,
  fieldOps,
  fieldTakesTwo,
  nestedGroup,
  nestedNeedsValue,
  nestedToFilter,
  nestedToFlat,
  parseNested,
  patchCondAt,
  removeAt,
  serializeNested,
  setGroupOp,
  type NestedCond,
  type NestedField,
  type NestedFields,
  type NestedGroup,
  type NestedPath,
} from './nestedModel';

export interface NestedSearchResult {
  /** Directus/bdus5 filter object (`_and`/`_or`/…), or `null` if the search is empty. */
  filter: Record<string, unknown> | null;
  /** The same search in `SearchUI`'s flat shape; `undefined` if the tree is not flat or not expressible that way. */
  flat?: { connector: '_and' | '_or'; filters: { field: string; operator: string; value: string | number }[] };
  /** The tree itself. */
  group: NestedGroup;
  /** Compact JSON of the tree, for a URL query parameter; pass it back as `initialQuery`. */
  serialized: string;
}

export interface SearchUINestedProps {
  /** Searchable fields: key = field name in the data source (it ends up in the filter). */
  fields: Record<string, NestedField>;
  /** Called on submit (button or Enter). */
  onSearch: (result: NestedSearchResult) => void;
  /** Called on every edit, e.g. to keep a shareable URL up to date. */
  onChange?: (result: NestedSearchResult) => void;
  /** A serialised search (see `NestedSearchResult.serialized`) or a group. Invalid input gives an empty search. */
  initialQuery?: string | NestedGroup | null;
  isLoading?: boolean;
  /** Submit when Enter is pressed in a text input (default `true`). */
  submitOnEnter?: boolean;
  /** Show the plain-language summary line (default `true`). */
  showSummary?: boolean;
}

function compute(group: NestedGroup, fields: NestedFields): NestedSearchResult {
  return {
    filter: nestedToFilter(group, fields),
    flat: nestedToFlat(group, fields),
    group,
    serialized: serializeNested(group),
  };
}

function opLabel(t: Translator, def: NestedField, op: string): string {
  if (def.opLabels?.[op]) return def.opLabels[op];
  return t(`search.nested.ops.${op}`);
}

/** Plain-language sentence for a search, e.g. `Name contains «x» AND (Kind is «a» OR Kind is «b»)`. */
export function describeNested(g: NestedGroup, fields: NestedFields, t: Translator): string {
  const join = ` ${g.op === 'AND' ? t('search.nested.and') : t('search.nested.or')} `;
  const parts = g.items.map((i) => {
    if (i.k === 'g') return `(${describeNested(i, fields, t)})`;
    const def = fields[i.f];
    if (!def) return '…';
    let val = '';
    if (nestedNeedsValue(i.o)) {
      val = i.v === '' ? '…' : i.v;
      if (fieldTakesTwo(def, i.o) && i.v2) val += ` ${t('search.nested.to')} ${i.v2}`;
    }
    return `${def.label} ${opLabel(t, def, i.o)}${val ? ` «${val}»` : ''}`;
  });
  return parts.length ? parts.join(join) : '—';
}

/**
 * Advanced search with nested AND/OR groups. Unlike `SearchUIAdvanced` (one
 * flat list), a group can contain further groups. Emits a Directus/bdus5
 * filter object, so it feeds `bdus`/`directus` sources directly. Not wired
 * to `Map`'s `searchInFields` (which is flat by design).
 */
export function SearchUINested({
  fields,
  onSearch,
  onChange,
  initialQuery,
  isLoading = false,
  submitOnEnter = true,
  showSummary = true,
}: SearchUINestedProps) {
  const t = useTranslation();
  const [root, setRoot] = useState<NestedGroup>(() => {
    const parsed = parseNested(initialQuery, fields);
    return parsed.items.length ? parsed : nestedGroup('AND', [blankCond(fields)]);
  });

  const fieldKeys = Object.keys(fields);
  if (fieldKeys.length === 0) {
    return <div className="text-danger small">{t('map.search.noFieldsConfigured')}</div>;
  }

  const apply = (next: NestedGroup) => {
    setRoot(next);
    onChange?.(compute(next, fields));
  };
  const submit = () => onSearch(compute(root, fields));
  const onEnter = (e: KeyboardEvent) => {
    if (submitOnEnter && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const renderCond = (c: NestedCond, path: NestedPath) => {
    const def = fields[c.f] ?? fields[fieldKeys[0]];
    const ops = fieldOps(def);
    const type = def.type ?? 'text';
    const set = (patch: Partial<Omit<NestedCond, 'k'>>) => apply(patchCondAt(root, path, patch));
    const inputType = type === 'number' ? 'number' : 'text';
    return (
      <div className="d-flex flex-wrap gap-2 align-items-center mb-2" key={path.join('.')} data-nested-cond>
        <select
          className="form-select form-select-sm w-auto"
          aria-label={t('search.nested.field')}
          value={c.f}
          disabled={isLoading}
          onChange={(e) => set({ f: e.target.value, o: fieldOps(fields[e.target.value])[0] ?? '', v: '', v2: '' })}
        >
          {fieldKeys.map((k) => (
            <option key={k} value={k}>{fields[k].label}</option>
          ))}
        </select>
        <select
          className="form-select form-select-sm w-auto"
          aria-label={t('search.nested.operator')}
          value={c.o}
          disabled={isLoading}
          onChange={(e) => set({ o: e.target.value })}
        >
          {ops.map((o) => (
            <option key={o} value={o}>{opLabel(t, def, o)}</option>
          ))}
        </select>
        {nestedNeedsValue(c.o) && (def.values?.length ? (
          <select
            className="form-select form-select-sm w-auto"
            aria-label={t('search.nested.value')}
            value={c.v}
            disabled={isLoading}
            onChange={(e) => set({ v: e.target.value })}
          >
            <option value="" />
            {def.values.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              className="form-control form-control-sm w-auto"
              type={inputType}
              step={type === 'number' ? 'any' : undefined}
              aria-label={t('search.nested.value')}
              value={c.v}
              disabled={isLoading}
              onChange={(e) => set({ v: e.target.value })}
              onKeyDown={onEnter}
            />
            {fieldTakesTwo(def, c.o) && (
              <input
                className="form-control form-control-sm w-auto"
                type={inputType}
                step={type === 'number' ? 'any' : undefined}
                aria-label={t('search.nested.valueTo')}
                placeholder={t('search.nested.to')}
                value={c.v2}
                disabled={isLoading}
                onChange={(e) => set({ v2: e.target.value })}
                onKeyDown={onEnter}
              />
            )}
          </>
        ))}
        <button
          type="button"
          className="btn btn-outline-danger btn-sm"
          aria-label={t('search.nested.remove')}
          title={t('search.nested.remove')}
          disabled={isLoading}
          onClick={() => apply(removeAt(root, path))}
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  };

  const renderGroup = (g: NestedGroup, path: NestedPath, isRoot = false) => (
    <div
      className={isRoot ? 'search-ui-nested-group' : 'search-ui-nested-group border rounded p-2 mb-2 ms-3'}
      key={path.join('.') || 'root'}
      data-nested-group
    >
      <div className="d-flex align-items-center gap-2 mb-2">
        <div className="btn-group btn-group-sm" role="group" aria-label={t('search.nested.groupOperator')}>
          <button
            type="button"
            className={`btn ${g.op === 'AND' ? 'btn-primary' : 'btn-outline-primary'}`}
            aria-pressed={g.op === 'AND'}
            disabled={isLoading}
            onClick={() => apply(setGroupOp(root, path, 'AND'))}
          >
            {t('search.nested.all')}
          </button>
          <button
            type="button"
            className={`btn ${g.op === 'OR' ? 'btn-primary' : 'btn-outline-primary'}`}
            aria-pressed={g.op === 'OR'}
            disabled={isLoading}
            onClick={() => apply(setGroupOp(root, path, 'OR'))}
          >
            {t('search.nested.any')}
          </button>
        </div>
        <span className="small">{t('search.nested.conditionsOf')}</span>
        {!isRoot && (
          <button
            type="button"
            className="btn btn-outline-danger btn-sm ms-auto"
            aria-label={t('search.nested.removeGroup')}
            title={t('search.nested.removeGroup')}
            disabled={isLoading}
            onClick={() => apply(removeAt(root, path))}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {g.items.map((it, i) => (it.k === 'c' ? renderCond(it, [...path, i]) : renderGroup(it, [...path, i])))}
      <div className="d-flex gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={isLoading}
          onClick={() => apply(addCondAt(root, path, blankCond(fields)))}
        >
          <Plus size={14} /> {t('search.nested.addCondition')}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={isLoading}
          onClick={() =>
            apply(addGroupAt(root, path, nestedGroup(g.op === 'AND' ? 'OR' : 'AND', [blankCond(fields)])))
          }
        >
          <Plus size={14} /> {t('search.nested.addGroup')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="search-ui-nested">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {renderGroup(root, [], true)}
        {showSummary && (
          <p className="small text-body-secondary mt-3 mb-2" data-nested-summary>
            <em>{t('search.nested.summary')}</em> {describeNested(root, fields, t)}
          </p>
        )}
        <div className="d-flex gap-2 mt-2">
          <button type="submit" className="btn btn-primary btn-sm" disabled={isLoading}>
            {isLoading ? (
              <span className="spinner-border spinner-border-sm" role="status">
                <span className="visually-hidden">{t('map.search.loading')}</span>
              </span>
            ) : (
              <Search size={16} />
            )}{' '}
            {t('map.search.submit')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={isLoading}
            onClick={() => {
              const fresh = nestedGroup('AND', [blankCond(fields)]);
              apply(fresh);
              onSearch(compute(nestedGroup(), fields));
            }}
          >
            <X size={16} /> {t('map.search.clear')}
          </button>
        </div>
      </form>
    </div>
  );
}
