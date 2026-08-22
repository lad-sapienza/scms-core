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

  // ─── Prompt: file format ─────────────────────────────────────────────────
  const colDir     = join(CONTENT_BASE, collection);
  const defaultExt = hasMdx(colDir) ? 'mdx' : 'md';
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
    if (existsSync(join(colDir, raw, `index.${ext}`))) {
      warn(`File already exists: src/content/${collection}/${raw}/index.${ext}`);
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

  // ─── Write file ───────────────────────────────────────────────────────────
  const targetDir  = join(colDir, slug);
  const targetPath = join(targetDir, `index.${ext}`);
  mkdirSync(targetDir, { recursive: true });

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

  writeFileSync(targetPath, content, 'utf8');

  console.log('');
  ok(`Created: ${relative(ROOT_DIR, targetPath)}`);

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  console.log(`${G}${B}Done!${X}`);
  console.log('');
  console.log(`  ${B}Next steps:${X}`);
  console.log(`    1. Open ${B}src/content/${collection}/${slug}/index.${ext}${X} and write your content`);
  console.log(`    2. Set ${B}draft: false${X} when the content is ready to publish`);
  console.log(`    3. Run ${B}npm run dev${X} and visit ${B}/${collection}/${slug}${X}`);
  console.log('');
}

main().catch(err => error(String(err)));
