#!/usr/bin/env node
// add-content.mjs — Add a new content file to an existing s:CMS collection.
// Usage: npx scms-add-content
//    or: npm run add-content (from a consuming site's package.json)

import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

// This file ships inside the @lad-sapienza/scms-core package (bin/), so its
// own location says nothing about the consuming site's layout. ROOT_DIR must
// be the invoking project's root, i.e. wherever the CLI was run from.
const ROOT_DIR     = process.cwd();
const CONFIG_FILE  = join(ROOT_DIR, 'src', 'content.config.ts');
const CONTENT_BASE = join(ROOT_DIR, 'src', 'content');

// ─── Color helpers ────────────────────────────────────────────────────────────
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m';
const B = '\x1b[1m',  X = '\x1b[0m';
const ok    = (...a) => console.log(`${G}✔${X}  ${a.join(' ')}`);
const warn  = (...a) => console.log(`${Y}⚠${X}  ${a.join(' ')}`);
const error = (...a) => { console.error(`${R}✖${X}  ${a.join(' ')}`); process.exit(1); };

if (!existsSync(CONFIG_FILE)) error(`Cannot find ${CONFIG_FILE}`);

// ─── Readline helper ──────────────────────────────────────────────────────────
// Uses the readline interface as an async iterator rather than repeated
// rl.question() calls: with piped/pasted (non-TTY) input, multiple lines can
// arrive in a single chunk, and question()'s one-shot 'line' listener isn't
// registered in time to catch answers past the first — they're silently
// dropped and the prompt hangs forever with no error. Iterating the interface
// consumes lines through its internal queue instead, so it doesn't race.
const rl  = createInterface({ input: process.stdin, output: process.stdout });
rl.on('SIGINT', () => { console.log(''); process.exit(0); });
const rlIterator = rl[Symbol.asyncIterator]();
const ask = async (prompt) => {
  process.stdout.write(prompt);
  const { value, done } = await rlIterator.next();
  if (done) { console.log(''); process.exit(0); }
  return value;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse top-level collection keys from export const collections = { ... }.
 * Searches only from the `// Export all collections` marker onward (the real
 * export always follows it) — a plain whole-file regex would also match
 * doc-comment examples mentioning the same text earlier in the file.
 */
function parseCollections(src) {
  const markerIdx = src.indexOf('// Export all collections');
  const searchFrom = markerIdx === -1 ? src : src.slice(markerIdx);
  const m = searchFrom.match(/export const collections\s*=\s*\{([^}]+)\}/s);
  if (!m) return [];
  // Keys may be quoted (e.g. 'my-collection': ...) when the name isn't a
  // valid bare identifier — see toObjectKey() in add-collection.mjs.
  return [...m[1].matchAll(/(?:['"]([\w-]+)['"]|(\w+))\s*:/g)].map(x => x[1] ?? x[2]);
}

/** Count .md / .mdx files recursively in a directory */
function countMdFiles(dir) {
  try {
    return readdirSync(dir, { recursive: true })
      .filter(f => f.endsWith('.md') || f.endsWith('.mdx'))
      .length;
  } catch { return 0; }
}

/** Return true if any .mdx file exists under dir */
function hasMdx(dir) {
  try {
    return readdirSync(dir, { recursive: true }).some(f => f.endsWith('.mdx'));
  } catch { return false; }
}

/** True if any .md/.mdx file sits directly in dir (not in a sub-folder) */
function hasRootContentFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .some(d => d.isFile() && /\.mdx?$/.test(d.name));
  } catch { return false; }
}

/**
 * Locale-code sub-directories directly inside a collection dir — e.g.
 * `en`, `it`, `pt-BR`. Their presence is how a site opts a collection in to
 * per-language content: there is no config flag (s:CMS's i18n layer is
 * structural — it keys off these folders existing). The pattern is a
 * 2-letter base with an optional region/script suffix (`pt-BR`, `zh-Hans`),
 * and — to keep ordinary topic folders (`api`, `guides`) from being taken
 * for languages — this returns nothing unless *every* sub-folder matches.
 * Sorted, for a stable prompt order.
 */
function detectLocaleDirs(dir) {
  let subdirs;
  try {
    subdirs = readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch { return []; }
  if (subdirs.length === 0) return [];
  const locales = subdirs.filter(n => /^[a-z]{2}(?:[-_][a-z0-9]{2,4})?$/i.test(n));
  return locales.length === subdirs.length ? locales.sort() : [];
}

/** Extract z.object field lines for a named collection from config.ts */
function parseSchemaFields(src, colName) {
  const pat = new RegExp(
    `defineCollection\\(\\{.*?base\\s*:\\s*['"]\\./src/content/${colName}['"].*?z\\.object\\(\\{(.*?)\\}\\)`,
    's'
  );
  const m = src.match(pat);
  if (!m) return [];

  const fields = [];
  for (let line of m[1].split('\n')) {
    line = line.trim().replace(/,$/, '');
    if (!line || line.startsWith('//')) continue;
    const fm = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (!fm) continue;
    const [, name, ztype] = fm;
    const optional = ztype.includes('.optional()');
    let kind;
    if      (ztype.includes('z.array'))                                   kind = 'array';
    else if (ztype.includes('z.number'))                                  kind = 'number';
    else if (ztype.includes('z.boolean'))                                 kind = 'boolean';
    else if (ztype.includes('z.coerce.date') || ztype.includes('z.date')) kind = 'date';
    else                                                                  kind = 'string';
    fields.push({ name, kind, optional });
  }
  return fields;
}

/** Escape a value for a YAML double-quoted scalar (backslash first, then quotes) */
function yamlQuote(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Format a single frontmatter line for a given value and Zod kind */
function toYamlLine(name, value, kind) {
  if (kind === 'boolean') {
    const b = ['true', 'yes', '1'].includes(value.toLowerCase());
    return `${name}: ${b ? 'true' : 'false'}`;
  }
  if (kind === 'number') return `${name}: ${value}`;
  if (kind === 'array') {
    const items = value.split(',').map(s => s.trim()).filter(Boolean);
    return `${name}: [${items.map(yamlQuote).join(', ')}]`;
  }
  if (kind === 'date') return `${name}: ${value}`;
  return `${name}: ${yamlQuote(value)}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const cfgSrc = readFileSync(CONFIG_FILE, 'utf8');
  const allCollections = parseCollections(cfgSrc);

  // Keep only collections that have a content directory with actual files
  const collections = allCollections.filter(col => {
    const dir = join(CONTENT_BASE, col);
    return existsSync(dir) && statSync(dir).isDirectory();
  });

  console.log('');
  console.log(`${B}Available collections:${X}`);
  if (collections.length === 0) {
    console.log("  (none found — run 'npm run add-collection' first)");
    rl.close();
    process.exit(1);
  }
  collections.forEach((col, i) => {
    const count = countMdFiles(join(CONTENT_BASE, col));
    console.log(`  ${i + 1}) ${col}  (${count} file(s))`);
  });
  console.log('');

  // ─── Prompt: collection ───────────────────────────────────────────────────
  let collection;
  while (true) {
    const raw = (await ask(`${B}Collection${X} [name or number]: `)).trim();
    if (!raw) { warn('Please enter a name or number.'); continue; }
    if (/^\d+$/.test(raw)) {
      const idx = parseInt(raw, 10) - 1;
      if (idx >= 0 && idx < collections.length) { collection = collections[idx]; break; }
      warn('Number out of range.');
    } else {
      if (collections.includes(raw)) { collection = raw; break; }
      warn(`'${raw}' is not an available collection.`);
    }
  }
  ok(`Collection: ${collection}`);

  const colDir = join(CONTENT_BASE, collection);

  // ─── Prompt: language folder (multilingual collections only) ─────────────
  // A collection counts as multilingual purely by its layout: content split
  // into locale-named sub-folders (src/content/<col>/<locale>/…) with nothing
  // loose at the collection root. When that's the case, ask which locale
  // folder(s) the new file belongs in — one, a comma-separated subset, or
  // `all`. Collections that aren't organised this way skip the step entirely
  // and behave exactly as before.
  const localeDirs = hasRootContentFiles(colDir) ? [] : detectLocaleDirs(colDir);
  let targetLocales = ['']; // '' → straight into the collection root (single-language)
  if (localeDirs.length > 0) {
    console.log('');
    console.log(`  This collection is organised by language folder: ${B}${localeDirs.join(', ')}${X}`);
    console.log('  Enter one language, a comma-separated list, or "all".');
    console.log('');
    while (true) {
      const raw = (await ask(`${B}Language${X} [${[...localeDirs, 'all'].join(' / ')}]: `)).trim().toLowerCase();
      if (!raw) { warn('Please choose a language (or "all").'); continue; }
      if (raw === 'all') { targetLocales = [...localeDirs]; break; }
      const picked  = raw.split(',').map(s => s.trim()).filter(Boolean);
      const unknown = picked.filter(p => !localeDirs.includes(p));
      if (unknown.length) { warn(`Not an available language: ${unknown.join(', ')}`); continue; }
      targetLocales = [...new Set(picked)];
      break;
    }
    ok(`Language: ${targetLocales.join(', ')}`);
  }

  // ─── Prompt: file format ─────────────────────────────────────────────────
  const defaultExt = targetLocales.some(loc => hasMdx(join(colDir, loc))) ? 'mdx' : 'md';
  console.log('');
  const extRaw = (await ask(`${B}File format${X} [md/mdx] (default: ${defaultExt}): `)).trim() || defaultExt;
  const ext    = (extRaw === 'md' || extRaw === 'mdx') ? extRaw : defaultExt;

  // ─── Prompt: slug ─────────────────────────────────────────────────────────
  console.log('');
  console.log('  Slug becomes the URL path and file name.');
  console.log('  Use lowercase letters, numbers, and hyphens. Subfolders allowed (e.g. guides/my-topic).');
  console.log('');
  let slug;
  while (true) {
    const raw = (await ask(`${B}Slug${X}: `)).trim().replace(/^\//, '').replace(/\/$/, '');
    if (!raw) { warn('Slug cannot be empty.'); continue; }
    if (!/^[a-z0-9/_-]+$/.test(raw)) {
      warn('Slug must contain only lowercase letters, numbers, hyphens, underscores, and forward slashes.');
      continue;
    }
    const clash = targetLocales.find(loc => existsSync(join(colDir, loc, raw, `index.${ext}`)));
    if (clash !== undefined) {
      warn(`File already exists: ${relative(ROOT_DIR, join(colDir, clash, raw, `index.${ext}`))}`);
      continue;
    }
    slug = raw;
    break;
  }

  // ─── Collect frontmatter values ───────────────────────────────────────────
  const today  = new Date().toISOString().slice(0, 10);
  const fields = parseSchemaFields(cfgSrc, collection);

  let gitAuthor = '';
  try {
    gitAuthor = execSync('git config user.name', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* git not available or no config */ }

  console.log('');
  console.log(`${B}Frontmatter fields${X} (press Enter to use the default value shown in brackets):`);
  console.log('');

  const fmLines  = [];
  let titleValue = slug; // used as the markdown H1 heading fallback

  for (const { name, kind, optional } of fields) {
    let defaultVal = '';
    if      (kind === 'date')                defaultVal = today;
    else if (name === 'draft')               defaultVal = 'true';
    else if (name === 'author' && gitAuthor) defaultVal = gitAuthor;

    let prompt = `  ${name}`;
    if (optional)        prompt += '  (optional)';
    if (kind === 'array') prompt += ' [comma-separated]';
    if (defaultVal)       prompt += ` [${defaultVal}]`;
    prompt += ': ';

    let value = (await ask(prompt)).trim();
    if (!value && defaultVal) value = defaultVal;

    if (!value) {
      if (optional) continue; // skip optional empty fields
      fmLines.push(`${name}: ""`);
      continue;
    }

    if (name === 'title') titleValue = value;
    fmLines.push(toYamlLine(name, value, kind));
  }

  rl.close();

  // ─── Write file(s) ────────────────────────────────────────────────────────
  const content = [
    '---',
    ...fmLines,
    '---',
    '',
    `# ${titleValue}`,
    '',
    '<!-- Write your content here -->',
    '',
  ].join('\n');

  // One copy per chosen language folder (just one entry, '', for a
  // single-language collection). Each copy is an identical starting point —
  // the per-locale translations are written afterwards, by hand.
  const created = [];
  for (const loc of targetLocales) {
    const targetDir  = join(colDir, loc, slug);
    const targetPath = join(targetDir, `index.${ext}`);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(targetPath, content, 'utf8');
    created.push(relative(ROOT_DIR, targetPath));
  }

  console.log('');
  for (const p of created) ok(`Created: ${p}`);

  // ─── Summary ──────────────────────────────────────────────────────────────
  const multilingual = targetLocales.some(Boolean);
  console.log('');
  console.log(`${G}${B}Done!${X}`);
  console.log('');
  console.log(`  ${B}Next steps:${X}`);
  if (multilingual) {
    console.log(`    1. Open the new file${created.length > 1 ? 's' : ''} and write ${created.length > 1 ? 'each translation' : 'your content'}:`);
    for (const p of created) console.log(`         ${B}${p}${X}`);
  } else {
    console.log(`    1. Open ${B}${created[0]}${X} and write your content`);
  }
  console.log(`    2. Set ${B}draft: false${X} when the content is ready to publish`);
  if (multilingual) {
    console.log(`    3. Run ${B}npm run dev${X} and visit the new page (e.g. ${B}/${targetLocales[0]}/${collection}/${slug}${X}, depending on your locale routing)`);
  } else {
    console.log(`    3. Run ${B}npm run dev${X} and visit ${B}/${collection}/${slug}${X}`);
  }
  console.log('');
}

main().catch(err => error(String(err)));
