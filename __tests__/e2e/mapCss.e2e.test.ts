/**
 * End-to-end regression for the "MapLibre CSS emitted but never linked" bug —
 * see `scmsMapCssIntegration` in scms.ts.
 *
 * Packs this package, installs it into a throwaway Astro site (real
 * `npm install`, so network + ~10s), builds it, and inspects the HTML.
 * Opt-in because of that cost:  SCMS_E2E=1 npx vitest run __tests__/e2e
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const installed = (pkg: string): string =>
  JSON.parse(readFileSync(join(root, 'node_modules', pkg, 'package.json'), 'utf8')).version;

function write(dir: string, rel: string, content: string) {
  const file = join(dir, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, content);
}

/** Stylesheet hrefs linked from a built page, plus inline <style> blocks containing maplibre rules. */
function inspect(site: string, page: string) {
  const html = readFileSync(join(site, 'dist', page, 'index.html'), 'utf8');
  const hrefs = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const inlined = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].some((m) => m[1].includes('.maplibregl-popup'));
  const linksMapLibre = hrefs.some((h) =>
    readFileSync(join(site, 'dist', h), 'utf8').includes('.maplibregl-popup')
  );
  return { linksMapLibre: linksMapLibre || inlined };
}

function buildSite(mapCss: boolean, tarball: string): string {
  const site = mkdtempSync(join(tmpdir(), 'scms-e2e-'));
  write(site, 'package.json', JSON.stringify({
    name: 'site', type: 'module', private: true,
    dependencies: {
      '@lad-sapienza/scms-core': `file:${tarball}`,
      astro: installed('astro'),
      react: installed('react'),
      'react-dom': installed('react-dom'),
      'maplibre-gl': installed('maplibre-gl'),
      '@types/react': installed('@types/react'),
      '@types/react-dom': installed('@types/react-dom'),
    },
  }));
  write(site, 'astro.config.mjs', `import { defineConfig } from 'astro/config';
import { scms } from '@lad-sapienza/scms-core/scms';
export default defineConfig({ integrations: [scms({ mapCss: ${mapCss} })] });
`);
  write(site, 'src/content.config.ts', `import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'zod';
export const collections = { articles: defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/articles' }),
  schema: z.object({ textid: z.string() }),
}) };
`);
  for (const [name, directive] of [['m-load', 'client:load'], ['m-only', 'client:only="react"']]) {
    write(site, `src/content/articles/${name}.mdx`, `---
textid: "${name}"
---
import { Map } from '@lad-sapienza/scms-core/components/Map';

<Map ${directive} markers={{ lng: 68.42, lat: 33.55 }} />
`);
  }
  write(site, 'src/content/articles/plain.mdx', `---\ntextid: "plain"\n---\nno map\n`);
  write(site, 'src/layouts/Base.astro', `<html><head><title>t</title></head><body><slot /></body></html>`);
  // `Content` handed to a child component — the trigger for the bug.
  write(site, 'src/components/ArticlePage.astro', `---
import Base from '../layouts/Base.astro';
const { Content } = Astro.props;
---
<Base><Content /></Base>
`);
  write(site, 'src/pages/[textid].astro', `---
import { getCollection, render } from 'astro:content';
import ArticlePage from '../components/ArticlePage.astro';
export async function getStaticPaths() {
  return (await getCollection('articles')).map((entry) => ({ params: { textid: entry.data.textid }, props: { entry } }));
}
const { Content } = await render(Astro.props.entry);
---
<ArticlePage Content={Content} />
`);

  const opts = { cwd: site, stdio: 'pipe' as const };
  execFileSync('npm', ['install', '--no-audit', '--no-fund', '--prefer-offline'], opts);
  execFileSync('npx', ['astro', 'build'], opts);
  return site;
}

describe.skipIf(!process.env.SCMS_E2E)('MapLibre CSS in production builds', () => {
  let packDir: string;
  let tarball: string;
  const sites: string[] = [];

  beforeAll(() => {
    packDir = mkdtempSync(join(tmpdir(), 'scms-pack-'));
    execFileSync('npm', ['pack', '--pack-destination', packDir], { cwd: root, stdio: 'pipe' });
    tarball = join(packDir, readdirSync(packDir).find((f) => f.endsWith('.tgz'))!);
  }, 120_000);

  afterAll(() => {
    for (const dir of [packDir, ...sites]) if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('links the stylesheet from MDX pages whose Content is passed as a prop (default)', () => {
    const site = buildSite(true, tarball);
    sites.push(site);
    expect(inspect(site, 'm-load').linksMapLibre).toBe(true);
    expect(inspect(site, 'm-only').linksMapLibre).toBe(true);
  }, 300_000);

  it('reproduces the original bug with mapCss: false (guards the fixture itself)', () => {
    const site = buildSite(false, tarball);
    sites.push(site);
    expect(inspect(site, 'm-load').linksMapLibre).toBe(false);
    expect(inspect(site, 'm-only').linksMapLibre).toBe(false);
  }, 300_000);
});
