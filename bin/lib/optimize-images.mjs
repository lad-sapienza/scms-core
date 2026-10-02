// optimize-images engine — shared by bin/optimize-images.mjs and the tests.
//
// Converts the JPG/PNG images found under the content directory to WebP (max
// `maxSize` px on the long side), deletes the originals and rewrites every
// reference to them in the .md/.mdx files. Pure Node + sharp: no side effects
// besides the file system, no console output (the CLI prints the report).
//
// See the "Image optimization" section of the package README for the rules.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const DEFAULTS = {
  /** Folder (relative to the project root) scanned for images and .md/.mdx files. */
  contentDir: 'src/content',
  /** Folder (relative to the project root) scanned for code files referencing images. */
  srcDir: 'src',
  /** Max size, in px, of the long side. Images are only ever scaled down. */
  maxSize: 2000,
  /** WebP quality for JPGs. */
  quality: 82,
  /** PNG: fall back to lossy when the lossless WebP is larger than this fraction of the original... */
  pngLossyRatio: 0.5,
  /** ...and the original is larger than this many KB. */
  pngLossyMinSize: 500,
  /** Quality of the lossy PNG fallback. */
  pngLossyQuality: 85,
  /** Folders (relative to contentDir, or plain folder names) left untouched. */
  exclude: [],
};

export const MANIFEST_NAME = '.scms-optimize-images.json';

const IMAGE_RE = /\.(jpe?g|png)$/i;
const TEXT_RE = /\.mdx?$/i;
const CODE_RE = /\.(astro|jsx|tsx|mjs|ts|js)$/i;
// A reference token inside a markdown/frontmatter line (no whitespace, quotes or brackets)
const MD_REF_RE = /[^\s"'()<>[\]=]+\.(?:jpe?g|png)(?![\w.])/gi;
// Same for code, where the token can also be delimited by template-literal / JSX / object punctuation
const CODE_REF_RE = /[^\s"'`()<>[\]={},;]+\.(?:jpe?g|png)(?![\w.])/gi;

const posix = (p) => p.split(path.sep).join('/');
const kb = (bytes) => (bytes / 1024).toFixed(0);

/** Merges `userConfig.images` / `userConfig.i18n` (either may be undefined) over the defaults. */
export function resolveConfig(root, userConfig = {}) {
  const images = { ...DEFAULTS, ...(userConfig.images ?? {}) };
  const i18n = userConfig.i18n ?? {};
  const locales = Array.isArray(i18n.locales) ? i18n.locales : [];
  const defaultLocale = i18n.defaultLocale ?? locales[0];
  return {
    root,
    contentRoot: path.resolve(root, images.contentDir),
    srcRoot: path.resolve(root, images.srcDir),
    maxSize: images.maxSize,
    quality: images.quality,
    pngLossyRatio: images.pngLossyRatio,
    pngLossyMinSize: images.pngLossyMinSize,
    pngLossyQuality: images.pngLossyQuality,
    exclude: (images.exclude ?? []).map((e) => posix(e).replace(/^\.?\/+|\/+$/g, '')),
    locales,
    defaultLocale,
  };
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => {
      if (e.name === 'node_modules' || e.name.startsWith('.')) return [];
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
}

function isExcluded(c, rel) {
  const segments = rel.split('/');
  return c.exclude.some((e) => rel === e || rel.startsWith(`${e}/`) || (!e.includes('/') && segments.slice(0, -1).includes(e)));
}

// ─── Locale twins ────────────────────────────────────────────────────────────

/**
 * Alternative locations of a path: pages in a non-default locale have no assets
 * of their own and reuse the files of their default-locale twin, so the first
 * locale segment of a non-default language is swapped for the default one.
 * `relPath` is relative to the content root, posix-style.
 */
function defaultLocaleTwin(c, relPath) {
  if (!c.defaultLocale) return null;
  const segments = relPath.split('/');
  const i = segments.findIndex((s) => s !== c.defaultLocale && c.locales.includes(s));
  if (i === -1) return null;
  segments[i] = c.defaultLocale;
  return segments.join('/');
}

/** The folder itself plus its twins in the other languages (used to find which images a page cites). */
function twinDirs(c, dir) {
  const rel = posix(path.relative(c.contentRoot, dir));
  const segments = rel.split('/');
  const out = [dir];
  const i = c.defaultLocale ? segments.indexOf(c.defaultLocale) : -1;
  if (i !== -1) {
    for (const l of c.locales.filter((l) => l !== c.defaultLocale)) {
      const s = [...segments];
      s[i] = l;
      out.push(path.join(c.contentRoot, ...s));
    }
  }
  return out;
}

// ─── Manifest (images known not to benefit) ──────────────────────────────────

const sha1 = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');

function settingsHash(c) {
  const s = [c.maxSize, c.quality, c.pngLossyRatio, c.pngLossyMinSize, c.pngLossyQuality].join('|');
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
}

function loadManifest(c) {
  const file = path.join(c.root, MANIFEST_NAME);
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    return m && m.settings === settingsHash(c) && m.kept ? m.kept : {};
  } catch {
    return {};
  }
}

function saveManifest(c, kept) {
  const file = path.join(c.root, MANIFEST_NAME);
  const keys = Object.keys(kept).sort();
  if (!keys.length) {
    fs.rmSync(file, { force: true });
    return;
  }
  const sorted = Object.fromEntries(keys.map((k) => [k, kept[k]]));
  fs.writeFileSync(file, `${JSON.stringify({ settings: settingsHash(c), kept: sorted }, null, 2)}\n`);
}

// ─── sharp ───────────────────────────────────────────────────────────────────

// Inputs are always passed to sharp as buffers, never as paths: libvips caches by file path
// and would serve stale metadata for a file rewritten earlier in the same process.
function pipeline(input, c) {
  return sharp(Buffer.isBuffer(input) ? input : fs.readFileSync(input), { failOn: 'error' })
    .rotate()
    .resize({ width: c.maxSize, height: c.maxSize, fit: 'inside', withoutEnlargement: true });
}

/** Encodes a JPG/PNG to WebP. Same lossless/lossy logic as the original ImageMagick script. */
async function encode(src, c) {
  if (!/\.png$/i.test(src)) return pipeline(src, c).webp({ quality: c.quality }).toBuffer();
  // PNGs are mostly screenshots and graphics: lossless first, lossy if that is still heavy
  const original = fs.statSync(src).size;
  let out = await pipeline(src, c).webp({ lossless: true, effort: 6 }).toBuffer();
  if (out.length > original * c.pngLossyRatio && original > c.pngLossyMinSize * 1024) {
    out = await pipeline(src, c).webp({ quality: c.pngLossyQuality, alphaQuality: 100 }).toBuffer();
  }
  return out;
}

/** True for a lossless WebP (VP8L chunk), false for lossy (VP8 chunk). */
function webpIsLossless(buf) {
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', offset, offset + 4);
    if (fourcc === 'VP8L') return true;
    if (fourcc === 'VP8 ') return false;
    const size = buf.readUInt32LE(offset + 4);
    offset += 8 + size + (size & 1);
  }
  return false;
}

async function resizeWebp(file, c) {
  const buf = fs.readFileSync(file);
  const opts = webpIsLossless(buf) ? { lossless: true, effort: 6 } : { quality: c.quality, alphaQuality: 100 };
  return { before: buf.length, out: await pipeline(buf, c).webp(opts).toBuffer() };
}

async function pixelSize(file) {
  const m = await sharp(fs.readFileSync(file), { failOn: 'error' }).metadata();
  return { max: Math.max(m.width ?? 0, m.height ?? 0), animated: (m.pages ?? 1) > 1 };
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * @param {ReturnType<typeof resolveConfig>} c
 * @param {{ dryRun?: boolean, check?: boolean, only?: string[] | null }} [mode]
 *   `check`: touch nothing and convert nothing, just list what is left to do.
 *   `only`: restrict the images that get converted/checked to these files.
 */
export async function optimizeImages(c, { dryRun = false, check = false, only = null } = {}) {
  const readOnly = dryRun || check;
  const rel = (f) => posix(path.relative(c.contentRoot, f));
  const onlySet = only ? new Set(only.map((f) => path.resolve(f).toLowerCase())) : null;
  const inScope = (f) => !onlySet || onlySet.has(f.toLowerCase());

  const report = {
    converted: [], // { rel, before, after }
    skipped: [], // { rel, reason }
    dropped: [], // unused duplicates (rel)
    resized: [], // oversized WebPs scaled down: { rel, before, after }
    pending: [], // --check: JPG/PNG still to convert (rel)
    oversized: [], // --check: WebP larger than maxSize (rel)
    unreferenced: [],
    codeRefs: [], // { file, line, ref, kind, replacement }
    keptCount: 0, // already known not to benefit, left alone
    rewritten: 0,
    before: 0,
    after: 0,
    problems: 0,
  };

  const all = walk(c.contentRoot).filter((f) => !isExcluded(c, rel(f)));
  const textFiles = all.filter((f) => TEXT_RE.test(f));
  const allImages = all.filter((f) => IMAGE_RE.test(f));
  const webps = all.filter((f) => /\.webp$/i.test(f));

  const kept = loadManifest(c);
  const keptKey = (f) => rel(f);
  const isKept = (f) => {
    const e = kept[keptKey(f)];
    return Boolean(e) && e.sha1 === sha1(f);
  };
  const markKept = (f, reason) => {
    kept[keptKey(f)] = { sha1: sha1(f), reason };
  };

  const converted = new Map(); // old absolute path -> new absolute path

  if (check) {
    for (const f of allImages) {
      if (!inScope(f)) continue;
      if (isKept(f)) report.keptCount++;
      else report.pending.push(rel(f));
    }
    for (const f of webps) {
      if (!inScope(f) || isKept(f)) continue;
      const { max, animated } = await pixelSize(f).catch(() => ({ max: 0, animated: true }));
      if (!animated && max > c.maxSize) report.oversized.push(rel(f));
    }
    for (const f of allImages.filter((f) => inScope(f) && !isKept(f))) converted.set(f, f.replace(IMAGE_RE, '.webp'));
  } else {
    // Same name, different extension in one folder (e.g. bdus.jpg + bdus.png): they would both
    // become bdus.webp. Keep only the one a sibling .md/.mdx (or its locale twin) points to.
    let images = allImages;
    const byTarget = new Map();
    for (const f of images) {
      const k = f.replace(IMAGE_RE, '');
      byTarget.set(k, [...(byTarget.get(k) ?? []), f]);
    }
    for (const group of [...byTarget.values()].filter((g) => g.length > 1)) {
      const dirs = twinDirs(c, path.dirname(group[0]));
      const text = dirs
        .flatMap((d) => textFiles.filter((t) => path.dirname(t) === d))
        .map((t) => fs.readFileSync(t, 'utf8'))
        .join('\n');
      const used = group.filter((g) => text.includes(path.basename(g)));
      if (used.length !== 1) continue; // ambiguous: reported as skipped below
      for (const unused of group.filter((g) => g !== used[0])) {
        if (!inScope(unused)) continue;
        report.dropped.push(rel(unused));
        if (!readOnly) fs.rmSync(unused);
      }
      images = images.filter((i) => !group.includes(i) || i === used[0]);
    }

    for (const src of images) {
      if (!inScope(src)) continue;
      const dest = src.replace(IMAGE_RE, '.webp');
      const name = rel(src);

      if (isKept(src)) {
        report.keptCount++;
        continue;
      }
      if (fs.existsSync(dest) || images.some((o) => o !== src && o.replace(IMAGE_RE, '.webp') === dest)) {
        report.skipped.push({ rel: name, reason: 'target .webp already exists or name clashes with another image' });
        continue;
      }

      const origSize = fs.statSync(src).size;
      let out;
      try {
        const { animated } = await pixelSize(src);
        if (animated) {
          report.skipped.push({ rel: name, reason: 'animated image, left as is' });
          continue;
        }
        out = await encode(src, c);
      } catch (err) {
        report.skipped.push({ rel: name, reason: `conversion failed (${err.message.split('\n')[0]})` });
        continue;
      }
      if (out.length >= origSize) {
        report.skipped.push({ rel: name, reason: `WebP is not smaller (${kb(origSize)} -> ${kb(out.length)} KB), kept as is` });
        if (!readOnly) markKept(src, 'webp-not-smaller');
        continue;
      }

      report.before += origSize;
      report.after += out.length;
      converted.set(src, dest);
      report.converted.push({ rel: name, before: origSize, after: out.length });
      if (!readOnly) {
        const tmp = `${dest}.tmp`;
        fs.writeFileSync(tmp, out);
        fs.renameSync(tmp, dest);
        fs.rmSync(src);
      }
    }

    // WebPs that were already there but exceed the max size are scaled down in place
    // (same mode as the source: lossless stays lossless, lossy is re-encoded at `quality`).
    for (const f of webps) {
      if (!inScope(f)) continue;
      if (isKept(f)) {
        report.keptCount++;
        continue;
      }
      try {
        const { max, animated } = await pixelSize(f);
        if (animated || max <= c.maxSize) continue;
        const { before, out } = await resizeWebp(f, c);
        if (out.length >= before) {
          report.skipped.push({ rel: rel(f), reason: 'oversized WebP, but scaling it down does not make it smaller, kept as is' });
          if (!readOnly) markKept(f, 'resize-not-smaller');
          continue;
        }
        report.resized.push({ rel: rel(f), before, after: out.length });
        if (!readOnly) fs.writeFileSync(f, out);
      } catch (err) {
        report.skipped.push({ rel: rel(f), reason: `could not inspect WebP (${err.message.split('\n')[0]})` });
      }
    }

    if (!readOnly) {
      // prune entries whose file is gone (or no longer the one that was evaluated)
      for (const k of Object.keys(kept)) {
        const abs = path.join(c.contentRoot, ...k.split('/'));
        if (!fs.existsSync(abs) || sha1(abs) !== kept[k].sha1) delete kept[k];
      }
      saveManifest(c, kept);
    }

    // Rewrite references in .md/.mdx
    const lookup = new Map([...converted].map(([o, n]) => [o.toLowerCase(), n]));
    for (const file of textFiles) {
      const dir = path.dirname(file);
      const text = fs.readFileSync(file, 'utf8');
      const next = text.replace(MD_REF_RE, (ref) => {
        if (/^(https?:)?\/\//i.test(ref)) return ref;
        let decoded = ref;
        try {
          decoded = decodeURIComponent(ref);
        } catch {
          /* keep raw */
        }
        // Relative to the file, or absolute from the content root (see contentAssetsIntegration)
        const target = decoded.startsWith('/') ? path.join(c.contentRoot, decoded) : path.resolve(dir, decoded);
        // Pages in a non-default language have no assets of their own: they reuse the twin's files
        const twinRel = defaultLocaleTwin(c, rel(target));
        const twin = twinRel ? path.join(c.contentRoot, ...twinRel.split('/')) : null;
        const hit = lookup.get(target.toLowerCase()) ?? (twin ? lookup.get(twin.toLowerCase()) : undefined);
        return hit ? ref.replace(IMAGE_RE, '.webp') : ref;
      });
      if (next !== text) {
        report.rewritten++;
        if (!readOnly) fs.writeFileSync(file, next);
      }
    }
  }

  // ─── References from code (reported, never rewritten) ──────────────────────
  const codeFiles = walk(c.srcRoot).filter((f) => CODE_RE.test(f) && !f.startsWith(c.contentRoot + path.sep));
  const existing = new Set(all.map((f) => f.toLowerCase()));
  const convertedLower = new Map([...converted].map(([o, n]) => [o.toLowerCase(), n]));
  const kind = check || dryRun ? 'to-convert' : 'converted';

  for (const file of codeFiles) {
    const dir = path.dirname(file);
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [ref] of line.matchAll(CODE_REF_RE)) {
        if (/^(https?:)?\/\//i.test(ref)) continue;
        let decoded = ref;
        try {
          decoded = decodeURIComponent(ref);
        } catch {
          /* keep raw */
        }
        const candidates = decoded.startsWith('@content/')
          ? [path.join(c.contentRoot, decoded.slice(9))]
          : decoded.startsWith('@user/')
            ? [path.join(c.srcRoot, decoded.slice(6))]
            : decoded.startsWith('/')
              ? [path.join(c.contentRoot, decoded)]
              : [path.resolve(dir, decoded), path.join(c.contentRoot, decoded)];
        let found = null;
        for (const cand of candidates) {
          const lower = cand.toLowerCase();
          if (convertedLower.has(lower)) {
            found = kind;
            break;
          }
          // a JPG/PNG that no longer exists although its .webp does: left over from an earlier conversion
          if (!existing.has(lower) && existing.has(lower.replace(IMAGE_RE, '.webp'))) {
            found = 'stale';
            break;
          }
        }
        if (found) {
          report.codeRefs.push({ file: posix(path.relative(c.root, file)), line: i + 1, ref, kind: found, replacement: ref.replace(IMAGE_RE, '.webp') });
        }
      }
    });
  }

  // Sanity check: every converted file must be referenced or live in a gallery/ folder
  if (!readOnly) {
    const corpus = [...textFiles, ...codeFiles].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    report.unreferenced = [...converted.values()]
      .filter((d) => !rel(d).split('/').includes('gallery'))
      .filter((d) => !corpus.includes(path.basename(d)))
      .map(rel);
  }

  report.problems = check ? report.pending.length + report.oversized.length + report.codeRefs.length : report.codeRefs.length;
  return report;
}
