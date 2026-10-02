import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { optimizeImages, resolveConfig, MANIFEST_NAME } from '../bin/lib/optimize-images.mjs';

const CLI = path.resolve(__dirname, '..', 'bin', 'optimize-images.mjs');

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scms-img-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Lossy-friendly photo-like image: smooth noise, big enough to compress well as WebP. */
async function photo(w = 800, h = 400) {
  const raw = await sharp({ create: { width: w, height: h, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 25 } } })
    .blur(2)
    .png()
    .toBuffer();
  return raw;
}
async function jpg(w?: number, h?: number) {
  return sharp(await photo(w, h)).jpeg({ quality: 95 }).toBuffer();
}
async function png(w?: number, h?: number) {
  return sharp({ create: { width: w ?? 200, height: h ?? 100, channels: 3, background: '#336699' } }).png().toBuffer();
}
/** A JPG already squeezed so hard that its WebP is heavier. */
async function tinyJpg() {
  const base = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 25 } } })
    .blur(3)
    .png()
    .toBuffer();
  return sharp(base).jpeg({ quality: 40, mozjpeg: true }).toBuffer();
}

function put(rel: string, data: string | Buffer) {
  const f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
}
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

/** Hash of every file in the tree, to prove that a run changed nothing. */
function snapshot() {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(root, p)] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
    }
  };
  walk(root);
  return out;
}

const config = (extra: Record<string, unknown> = {}, i18n: Record<string, unknown> | null = { defaultLocale: 'it', locales: ['it', 'en'] }) =>
  resolveConfig(root, { images: { maxSize: 500, ...extra }, ...(i18n ? { i18n } : {}) });

describe('optimizeImages: conversion', () => {
  it('converts JPG and PNG to WebP, deletes the originals and scales down to maxSize', async () => {
    put('src/content/blog/post/index.md', '---\nimg: cover.jpg\n---\n![](diagram.png)\n');
    put('src/content/blog/post/cover.jpg', await jpg(1000, 500));
    put('src/content/blog/post/diagram.png', await png());

    const r = await optimizeImages(config());

    expect(r.converted.map((c: any) => c.rel).sort()).toEqual(['blog/post/cover.jpg', 'blog/post/diagram.png']);
    expect(exists('src/content/blog/post/cover.jpg')).toBe(false);
    expect(exists('src/content/blog/post/diagram.png')).toBe(false);
    const meta = await sharp(path.join(root, 'src/content/blog/post/cover.webp')).metadata();
    expect(meta.format).toBe('webp');
    expect(Math.max(meta.width!, meta.height!)).toBe(500);
    // images are never enlarged
    const small = await sharp(path.join(root, 'src/content/blog/post/diagram.webp')).metadata();
    expect([small.width, small.height]).toEqual([200, 100]);
    expect(r.after).toBeLessThan(r.before);
  });

  it('rewrites relative references, frontmatter, %20 and mixed case', async () => {
    put('src/content/blog/post/index.md', '---\nimg: Header.JPG\n---\n![alt](Cover%20Photo.JPG)\n![x](./sub/Other.jpg)\n[remote](https://example.com/a.jpg)\n');
    put('src/content/blog/post/Cover Photo.JPG', await jpg());
    put('src/content/blog/post/sub/other.jpg', await jpg());
    put('src/content/blog/post/header.jpg', await jpg());

    await optimizeImages(config());

    const md = read('src/content/blog/post/index.md');
    expect(md).toContain('img: Header.webp');
    expect(md).toContain('![alt](Cover%20Photo.webp)');
    expect(md).toContain('./sub/Other.webp');
    expect(md).toContain('https://example.com/a.jpg'); // external URLs untouched
  });

  it('rewrites absolute references, rooted at the content directory', async () => {
    put('src/content/docs/page.mdx', '![](/didattica/cover.jpg)\n');
    put('src/content/didattica/cover.jpg', await jpg());

    await optimizeImages(config());

    expect(read('src/content/docs/page.mdx')).toBe('![](/didattica/cover.webp)\n');
  });

  it('lets pages of a non-default language reuse the images of the default-language twin', async () => {
    put('src/content/blog/it/post/index.md', '![](a.jpg)\n');
    put('src/content/blog/en/post/index.md', '![](a.jpg)\n');
    put('src/content/blog/it/post/a.jpg', await jpg());

    await optimizeImages(config());

    expect(read('src/content/blog/en/post/index.md')).toBe('![](a.webp)\n');
    expect(read('src/content/blog/it/post/index.md')).toBe('![](a.webp)\n');
  });

  it('uses the configured languages, not fixed it/en codes', async () => {
    put('src/content/blog/fr/post/index.md', '![](a.jpg)\n');
    put('src/content/blog/de/post/index.md', '![](a.jpg)\n');
    put('src/content/blog/de/post/a.jpg', await jpg());

    // default 'de', alternative 'fr'
    await optimizeImages(config({}, { defaultLocale: 'de', locales: ['de', 'fr'] }));

    expect(read('src/content/blog/fr/post/index.md')).toBe('![](a.webp)\n');
  });

  it('without i18n configured, no folder is treated as a twin', async () => {
    put('src/content/blog/en/post/index.md', '![](a.jpg)\n');
    put('src/content/blog/it/post/a.jpg', await jpg());

    await optimizeImages(config({}, null));

    expect(read('src/content/blog/en/post/index.md')).toBe('![](a.jpg)\n');
  });

  it('PNG: lossless by default, even when heavy, as long as the original is below the size threshold', async () => {
    put('src/content/p/index.md', '![](noisy.png)\n![](flat.png)\n');
    put('src/content/p/noisy.png', await sharp(await photo(300, 300)).png().toBuffer());
    put('src/content/p/flat.png', await png());

    await optimizeImages(config());

    for (const name of ['noisy', 'flat']) {
      // VP8L = lossless
      expect(fs.readFileSync(path.join(root, `src/content/p/${name}.webp`)).toString('ascii', 12, 16)).toBe('VP8L');
    }
  });

  it('PNG: falls back to lossy when the lossless WebP is still heavy and the original is large', async () => {
    put('src/content/p/index.md', '![](noisy.png)\n');
    put('src/content/p/noisy.png', await sharp(await photo(300, 300)).png().toBuffer());

    // thresholds lowered so the fixture counts as "heavy" and "large"
    await optimizeImages(config({ pngLossyRatio: 0, pngLossyMinSize: 0 }));

    // VP8 = lossy
    expect(fs.readFileSync(path.join(root, 'src/content/p/noisy.webp')).toString('ascii', 12, 16)).toBe('VP8 ');
  });
});

describe('optimizeImages: name conflicts', () => {
  it('keeps only the image cited by a page in the same folder (or its twin) when jpg + png share a name', async () => {
    put('src/content/p/it/x/index.md', '![](bdus.png)\n');
    put('src/content/p/en/x/index.md', '![](bdus.png)\n');
    put('src/content/p/it/x/bdus.png', await png());
    put('src/content/p/it/x/bdus.jpg', await jpg());

    const r = await optimizeImages(config());

    expect(r.dropped).toEqual(['p/it/x/bdus.jpg']);
    expect(exists('src/content/p/it/x/bdus.jpg')).toBe(false);
    expect(exists('src/content/p/it/x/bdus.webp')).toBe(true);
    expect(read('src/content/p/en/x/index.md')).toBe('![](bdus.webp)\n');
  });

  it('skips and reports an ambiguous conflict, touching neither file', async () => {
    put('src/content/p/index.md', '![](bdus.png) ![](bdus.jpg)\n');
    put('src/content/p/bdus.png', await png());
    put('src/content/p/bdus.jpg', await jpg());

    const r = await optimizeImages(config());

    expect(r.converted).toHaveLength(0);
    expect(r.skipped.map((s: any) => s.rel).sort()).toEqual(['p/bdus.jpg', 'p/bdus.png']);
    expect(exists('src/content/p/bdus.png') && exists('src/content/p/bdus.jpg')).toBe(true);
  });
});

describe('optimizeImages: images that do not get lighter', () => {
  it('leaves them alone, remembers the outcome, and does not re-encode them next time', async () => {
    put('src/content/p/index.md', '![](tight.jpg)\n');
    put('src/content/p/tight.jpg', await tinyJpg());

    const first = await optimizeImages(config());
    expect(first.converted).toHaveLength(0);
    expect((first.skipped[0] as any).reason).toMatch(/not smaller/);
    expect(exists('src/content/p/tight.jpg')).toBe(true);
    expect(exists(MANIFEST_NAME)).toBe(true);

    const second = await optimizeImages(config());
    expect(second.skipped).toHaveLength(0);
    expect(second.keptCount).toBe(1);
  });

  it('--check accepts a remembered image, but not once the file has changed or the settings did', async () => {
    put('src/content/p/tight.jpg', await tinyJpg());
    await optimizeImages(config());
    expect((await optimizeImages(config(), { check: true })).problems).toBe(0);

    // different settings invalidate the verdict
    expect((await optimizeImages(config({ quality: 60 }), { check: true })).problems).toBe(1);

    // different file under the same name
    put('src/content/p/tight.jpg', await jpg());
    expect((await optimizeImages(config(), { check: true })).problems).toBe(1);
  });
});

describe('optimizeImages: idempotency and dry run', () => {
  it('a second run changes nothing', async () => {
    put('src/content/p/index.md', '![](a.jpg)\n![](b.png)\n![](tight.jpg)\n');
    put('src/content/p/a.jpg', await jpg());
    put('src/content/p/b.png', await png());
    put('src/content/p/tight.jpg', await tinyJpg());
    await optimizeImages(config());

    const before = snapshot();
    const again = await optimizeImages(config());

    expect(again.converted).toHaveLength(0);
    expect(again.rewritten).toBe(0);
    expect(snapshot()).toEqual(before);
  });

  it('--dry-run reports the savings and touches nothing', async () => {
    put('src/content/p/index.md', '![](a.jpg)\n');
    put('src/content/p/a.jpg', await jpg());
    put('src/content/p/tight.jpg', await tinyJpg());
    const before = snapshot();

    const r = await optimizeImages(config(), { dryRun: true });

    expect(r.converted).toHaveLength(1);
    expect(r.rewritten).toBe(1);
    expect(r.after).toBeLessThan(r.before);
    expect(snapshot()).toEqual(before); // no files, no manifest
  });

  it('--only limits the work to the given files', async () => {
    put('src/content/p/index.md', '![](a.jpg) ![](b.jpg)\n');
    put('src/content/p/a.jpg', await jpg());
    put('src/content/p/b.jpg', await jpg());

    await optimizeImages(config(), { only: [path.join(root, 'src/content/p/a.jpg')] });

    expect(exists('src/content/p/a.webp')).toBe(true);
    expect(exists('src/content/p/b.jpg')).toBe(true);
    expect(read('src/content/p/index.md')).toBe('![](a.webp) ![](b.jpg)\n');
  });

  it('skips excluded folders', async () => {
    put('src/content/keep/a.jpg', await jpg());
    put('src/content/blog/gallery/b.jpg', await jpg());

    const r = await optimizeImages(config({ exclude: ['keep', 'gallery'] }));

    expect(r.converted).toHaveLength(0);
    expect(exists('src/content/keep/a.jpg') && exists('src/content/blog/gallery/b.jpg')).toBe(true);
  });
});

describe('optimizeImages: oversized WebP', () => {
  it('is flagged by --check and scaled down in place by a normal run', async () => {
    put('src/content/p/big.webp', await sharp(await photo(1000, 500)).webp({ quality: 80 }).toBuffer());
    const before = snapshot();

    const check = await optimizeImages(config(), { check: true });
    expect(check.oversized).toEqual(['p/big.webp']);
    expect(check.problems).toBe(1);
    expect(snapshot()).toEqual(before);

    const run = await optimizeImages(config());
    expect(run.resized.map((x: any) => x.rel)).toEqual(['p/big.webp']);
    const meta = await sharp(path.join(root, 'src/content/p/big.webp')).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(500);

    expect((await optimizeImages(config(), { check: true })).problems).toBe(0);
  });
});

describe('optimizeImages: references from code', () => {
  const page = 'src/pages/index.astro';

  it('reports them (without rewriting) when the image was converted', async () => {
    put('src/content/didattica/cover.jpg', await jpg());
    const astro = '---\n---\n<img src="/didattica/cover.jpg" />\n';
    put(page, astro);

    const r = await optimizeImages(config());

    expect(r.codeRefs).toEqual([{ file: page, line: 3, ref: '/didattica/cover.jpg', kind: 'converted', replacement: '/didattica/cover.webp' }]);
    expect(r.problems).toBe(1);
    expect(read(page)).toBe(astro);
  });

  it('keeps reporting a stale reference on later runs, after the original is gone', async () => {
    put('src/content/didattica/cover.jpg', await jpg());
    put(page, 'const c = `/didattica/cover.jpg`;\n');
    await optimizeImages(config());

    const again = await optimizeImages(config());

    expect(again.codeRefs.map((c: any) => c.kind)).toEqual(['stale']);
    expect(again.problems).toBe(1);
  });

  it('is part of --check, and goes away once the code points at the WebP', async () => {
    put('src/content/didattica/cover.jpg', await jpg());
    put(page, "import cover from '@content/didattica/cover.jpg';\n");

    const check = await optimizeImages(config(), { check: true });
    expect(check.codeRefs.map((c: any) => c.kind)).toEqual(['to-convert']);

    await optimizeImages(config());
    put(page, "import cover from '@content/didattica/cover.webp';\n");
    expect((await optimizeImages(config(), { check: true })).problems).toBe(0);
  });

  it('ignores references to images that are not under the content directory', async () => {
    put(page, '<img src="/images/logo.png" />\n');
    put('public/images/logo.png', await png());

    expect((await optimizeImages(config())).codeRefs).toEqual([]);
  });
});

describe('scms-optimize-images CLI', () => {
  const run = (...args: string[]) => spawnSync('node', [CLI, ...args], { cwd: root, encoding: 'utf8' });

  it('--check exits 1 while images are left to convert, 0 afterwards; settings come from user.config.mjs', async () => {
    put('src/user.config.mjs', "export const userConfig = { i18n: { defaultLocale: 'it', locales: ['it', 'en'] }, images: { maxSize: 500 } };\n");
    put('src/content/blog/it/p/index.md', '![](a.jpg)\n');
    put('src/content/blog/en/p/index.md', '![](a.jpg)\n');
    put('src/content/blog/it/p/a.jpg', await jpg(1000, 500));

    const failing = run('--check');
    expect(failing.status).toBe(1);
    expect(failing.stdout).toContain('blog/it/p/a.jpg');
    expect(exists('src/content/blog/it/p/a.jpg')).toBe(true); // --check never modifies

    const fix = run();
    expect(fix.status).toBe(0);
    expect(read('src/content/blog/en/p/index.md')).toBe('![](a.webp)\n');
    const meta = await sharp(path.join(root, 'src/content/blog/it/p/a.webp')).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(500);

    expect(run('--check').status).toBe(0);
  });

  it('exits 1 after converting when code references need a manual fix', async () => {
    put('src/content/x/a.jpg', await jpg());
    put('src/pages/index.astro', '<img src="/x/a.jpg" />\n');

    const r = run();

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/pages/index.astro:1');
    expect(r.stderr).toContain('/x/a.webp');
  });

  it('rejects unknown options', () => {
    expect(run('--nope').status).toBe(2);
  });
});
