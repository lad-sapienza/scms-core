/**
 * Model of the nested search (AND/OR groups): pure functions, no React.
 *
 * A search is a tree: a `Group` (AND | OR) holds `Cond`itions and further
 * groups. The tree converts to a Directus/bdus5 filter object
 * (`_and`/`_or`/`_icontains`/…), and serialises to a compact JSON string
 * suitable for a URL query parameter.
 */

export type NestedFieldType = 'text' | 'select' | 'number' | 'date';

export interface NestedField {
  label: string;
  /** Default: `text`. Decides the built-in operators and how values are converted. */
  type?: NestedFieldType;
  /** Predefined values (a `<select>` is shown instead of a text input). */
  values?: string[];
  /**
   * Operators offered for this field, replacing the type's defaults. Any
   * name works if `buildFilter` handles it; built-in names are listed in
   * `DEFAULT_NESTED_OPS`. Labels for custom names: `opLabels`.
   */
  ops?: string[];
  /** Labels for operator names that have no built-in label. */
  opLabels?: Record<string, string>;
  /** Operators that take a second value (built-in: `between`). */
  twoValueOps?: string[];
  /** Applied to the typed value(s) before they enter the filter (e.g. text normalisation). */
  transformValue?: (value: string, cond: NestedCond) => string;
  /** Replaces the built-in filter for this field; return `null` for "incomplete, skip". */
  buildFilter?: (cond: NestedCond) => Record<string, unknown> | null;
}

export type NestedFields = Record<string, NestedField>;

export interface NestedCond { k: 'c'; f: string; o: string; v: string; v2: string }
export interface NestedGroup { k: 'g'; op: 'AND' | 'OR'; items: (NestedCond | NestedGroup)[] }
export type NestedNode = NestedCond | NestedGroup;
export type NestedPath = number[];

export const DEFAULT_NESTED_OPS: Record<NestedFieldType, string[]> = {
  text: ['contains', 'starts', 'eq', 'empty', 'nempty'],
  select: ['eq', 'neq', 'empty', 'nempty'],
  number: ['eq', 'ge', 'le', 'between', 'empty', 'nempty'],
  date: ['eq', 'ge', 'le', 'between', 'empty', 'nempty'],
};

/** Built-in operators that map to exactly one `{field, operator, value}` triplet, as `SearchUI` produces. */
const SIMPLE_OPS: Record<string, string> = {
  contains: '_icontains',
  starts: '_starts_with',
  eq: '_eq',
  neq: '_neq',
  ge: '_gte',
  le: '_lte',
};

export const nestedNeedsValue = (op: string) => op !== 'empty' && op !== 'nempty';

export const fieldOps = (f: NestedField): string[] => f.ops ?? DEFAULT_NESTED_OPS[f.type ?? 'text'];
export const fieldTakesTwo = (f: NestedField, op: string): boolean =>
  f.twoValueOps ? f.twoValueOps.includes(op) : op === 'between';

export const nestedCond = (f = '', o = '', v = '', v2 = ''): NestedCond => ({ k: 'c', f, o, v, v2 });
export const nestedGroup = (op: 'AND' | 'OR' = 'AND', items: NestedNode[] = []): NestedGroup => ({ k: 'g', op, items });

/** A fresh condition on the first field with its first operator. */
export function blankCond(fields: NestedFields): NestedCond {
  const f = Object.keys(fields)[0] ?? '';
  return nestedCond(f, f ? fieldOps(fields[f])[0] ?? '' : '');
}

// ---- tree editing (immutable) ----------------------------------------

/** Replaces the node at `path` with `fn(node)`; `null` removes it (never the root). */
export function replaceAt(root: NestedGroup, path: NestedPath, fn: (n: NestedNode) => NestedNode | null): NestedGroup {
  if (path.length === 0) {
    const r = fn(root);
    return r && r.k === 'g' ? r : root;
  }
  const [i, ...rest] = path;
  const target = root.items[i];
  if (!target) return root;
  let next: NestedNode | null;
  if (rest.length === 0) next = fn(target);
  else if (target.k === 'g') next = replaceAt(target, rest, fn);
  else return root;
  const items = next === null ? root.items.filter((_, j) => j !== i) : root.items.map((n, j) => (j === i ? next! : n));
  return { ...root, items };
}

export const addCondAt = (root: NestedGroup, path: NestedPath, c: NestedCond) =>
  replaceAt(root, path, (n) => (n.k === 'g' ? { ...n, items: [...n.items, c] } : n));

export const addGroupAt = (root: NestedGroup, path: NestedPath, g: NestedGroup) =>
  replaceAt(root, path, (n) => (n.k === 'g' ? { ...n, items: [...n.items, g] } : n));

export const removeAt = (root: NestedGroup, path: NestedPath) =>
  path.length === 0 ? root : replaceAt(root, path, () => null);

export const setGroupOp = (root: NestedGroup, path: NestedPath, op: 'AND' | 'OR') =>
  replaceAt(root, path, (n) => (n.k === 'g' ? { ...n, op } : n));

export const patchCondAt = (root: NestedGroup, path: NestedPath, patch: Partial<Omit<NestedCond, 'k'>>) =>
  replaceAt(root, path, (n) => (n.k === 'c' ? { ...n, ...patch } : n));

// ---- conversion to filters -------------------------------------------

const toNumber = (s: string): number | null => (s.trim() === '' || isNaN(Number(s)) ? null : Number(s));

interface Triplet { field: string; operator: string; value: string | number }

/** The single `{field, operator, value}` a condition stands for, or `null` if incomplete or not expressible as one. */
function simpleTriplet(c: NestedCond, def: NestedField): Triplet | null {
  const operator = SIMPLE_OPS[c.o];
  if (!operator) return null;
  const type = def.type ?? 'text';
  let raw = c.v.trim();
  if (def.transformValue) raw = def.transformValue(raw, c).trim();
  if (!raw) return null;
  if (type === 'number') {
    const n = toNumber(raw);
    return n === null ? null : { field: c.f, operator, value: n };
  }
  return { field: c.f, operator, value: raw };
}

/** One condition → filter object (`null` when incomplete). */
export function condToFilter(c: NestedCond, fields: NestedFields): Record<string, unknown> | null {
  const def = fields[c.f];
  if (!def || !fieldOps(def).includes(c.o)) return null;
  if (def.buildFilter) return def.buildFilter(c);
  const a = c.f;
  const type = def.type ?? 'text';
  const textual = type === 'text' || type === 'select';
  if (c.o === 'empty') return textual ? { _or: [{ [a]: { _null: true } }, { [a]: { _eq: '' } }] } : { [a]: { _null: true } };
  if (c.o === 'nempty') return textual ? { _and: [{ [a]: { _nnull: true } }, { [a]: { _neq: '' } }] } : { [a]: { _nnull: true } };
  if (c.o === 'between') {
    const lo = type === 'number' ? toNumber(c.v) : c.v.trim() || null;
    const hi = type === 'number' ? toNumber(c.v2) : c.v2.trim() || null;
    if (lo === null && hi === null) return null;
    if (hi === null) return { [a]: { _gte: lo } };
    if (lo === null) return { [a]: { _lte: hi } };
    return { [a]: { _gte: lo, _lte: hi } };
  }
  const t = simpleTriplet(c, def);
  return t ? { [a]: { [t.operator]: t.value } } : null;
}

/** Group → filter object. Empty branches vanish; a single child is not wrapped. `null` if nothing is left. */
export function nestedToFilter(g: NestedGroup, fields: NestedFields): Record<string, unknown> | null {
  const parts = g.items
    .map((i) => (i.k === 'c' ? condToFilter(i, fields) : nestedToFilter(i, fields)))
    .filter((x): x is Record<string, unknown> => x !== null);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return { [g.op === 'AND' ? '_and' : '_or']: parts };
}

/**
 * The same search in the flat shape `SearchUI` produces (`{connector, filters}`),
 * or `undefined` when the tree is not flat or uses something a triplet cannot
 * express (`between`, `empty`/`nempty`, custom operators, `buildFilter`).
 */
export function nestedToFlat(
  g: NestedGroup,
  fields: NestedFields,
): { connector: '_and' | '_or'; filters: Triplet[] } | undefined {
  const filters: Triplet[] = [];
  for (const item of g.items) {
    if (item.k === 'g') return undefined;
    const def = fields[item.f];
    if (!def || !fieldOps(def).includes(item.o)) continue;
    if (def.buildFilter || !SIMPLE_OPS[item.o]) {
      // Incomplete conditions are dropped everywhere; a complete one we cannot express makes the tree non-flat.
      if (condToFilter(item, fields) !== null) return undefined;
      continue;
    }
    const t = simpleTriplet(item, def);
    if (t) filters.push(t);
  }
  return { connector: filters.length ? (g.op === 'AND' ? '_and' : '_or') : '_or', filters };
}

// ---- URL-friendly serialisation --------------------------------------

type Wire = [string, ...unknown[]];

const MAX_DEPTH = 8;
const MAX_NODES = 200;

function toWire(g: NestedGroup): Wire {
  return [
    g.op === 'AND' ? 'A' : 'O',
    ...g.items.map((i) => (i.k === 'g' ? toWire(i) : [i.f, i.o, i.v, ...(i.v2 ? [i.v2] : [])])),
  ] as Wire;
}

/** Compact JSON, e.g. `["A",["name","contains","x"],["O",["kind","eq","a"]]]`. */
export const serializeNested = (g: NestedGroup): string => JSON.stringify(toWire(g));

function fromWire(w: unknown, fields: NestedFields, depth: number, budget: { n: number }): NestedGroup {
  if (depth > MAX_DEPTH || !Array.isArray(w) || (w[0] !== 'A' && w[0] !== 'O')) throw new Error('bad');
  const items = w.slice(1).map((i: unknown): NestedNode => {
    if (++budget.n > MAX_NODES) throw new Error('bad');
    if (Array.isArray(i) && (i[0] === 'A' || i[0] === 'O')) return fromWire(i, fields, depth + 1, budget);
    if (!Array.isArray(i) || typeof i[0] !== 'string' || !Object.prototype.hasOwnProperty.call(fields, i[0])) throw new Error('bad');
    if (typeof i[1] !== 'string' || !fieldOps(fields[i[0]]).includes(i[1])) throw new Error('bad');
    return nestedCond(i[0], i[1], String(i[2] ?? ''), String(i[3] ?? ''));
  });
  return nestedGroup(w[0] === 'A' ? 'AND' : 'OR', items);
}

/**
 * Reads a serialised search (or a `NestedGroup`). Anything invalid — broken
 * JSON, unknown field, an operator the field does not offer, too deep or too
 * large — gives an empty AND group; never throws.
 */
export function parseNested(input: string | NestedGroup | null | undefined, fields: NestedFields): NestedGroup {
  try {
    if (!input) return nestedGroup();
    const raw = typeof input === 'string' ? JSON.parse(input) : toWire(input);
    return fromWire(raw, fields, 0, { n: 0 });
  } catch {
    return nestedGroup();
  }
}
