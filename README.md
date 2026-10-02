# @lad-sapienza/scms-core

Framework components and Astro integrations for [s:CMS](https://github.com/lad-sapienza/sCMS) — the static-site CMS built by [LAD @Sapienza](https://lad.saras.uniroma1.it/).

This package supplies the `core/` framework layer that used to live inside the sCMS template repo itself. A site built with sCMS depends on this package from `node_modules` instead of vendoring/syncing it via git, so updates are ordinary `npm update`s.

## Install

```bash
npm install @lad-sapienza/scms-core
```

Peer dependencies (install alongside): `astro`, `react`, `react-dom`, `maplibre-gl` (v6+), `@types/react`, `@types/react-dom`.

## Usage

Register the integration in `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
// Import from the `/scms` subpath, not the bare `@lad-sapienza/scms-core`
// specifier — the bare specifier resolves to index.ts, which re-exports
// .astro components (Gallery, TableOfContents). Astro can't compile .astro
// files yet at config-load time, before its own Vite plugin is registered,
// so a bare import here breaks with a Vite parse error.
import { scms } from '@lad-sapienza/scms-core/scms';

export default defineConfig({
  integrations: [
    ...scms({
      // all optional, default to the paths below
      contentDir: 'src/content',
      pagesDir: 'src/pages',
      galleriesDir: 'src/galleries',
    }),
  ],
});
```

`scms()` bundles content-asset serving, the Gallery virtual module, Expressive Code, MDX, React, and sitemap integrations into one call, and self-registers the Vite config the components need — `dedupe`/`optimizeDeps` for React and `@tanstack/react-table` (avoids duplicate-module "Invalid hook call" errors) and `ssr.noExternal` for `maplibre-gl` (so the `Map` component's MapLibre v6 worker import resolves in the SSR pass). No extra Vite config required in the consumer.

Import components from the package root in any `.mdx` file:

```mdx
import { DataTb, Map, Gallery } from '@lad-sapienza/scms-core';
```

| Component | Description |
|---|---|
| `DataTb` | Sortable, filterable, paginated data table |
| `MapComponent` (`Map`) | Interactive map with MapLibre GL JS |
| `Gallery` | Responsive image gallery with lightbox |
| `TableOfContents` | Auto-generated TOC from headings |
| `RedirectPage` | Static client-side redirect stub (meta-refresh + JS fallback) for static hosts |
| `ZoteroGeoViewer` | Zotero library visualised on a map |
| `RecordProvider`, `Field`, `Image`, `RecordFetcher`, `useRecordFetcher` | Build single-record detail pages against Directus |
| `SearchUI`, `SearchUISimple`, `SearchUIAdvanced` | Field/operator/value search UI (used by `Map`'s `searchInFields`) |

A few components are reachable only via subpath import, not the root barrel — this mirrors the internal layout, no bundler config or `exports` map restricts it:

```js
import SEO from '@lad-sapienza/scms-core/components/SEO/SEO.astro';
import BSNavbar from '@lad-sapienza/scms-core/components/BSNavbar';
import { directusLoader } from '@lad-sapienza/scms-core/integrations/directusLoader';
```

See each component folder's own `README.md` (`components/DataTb`, `components/Gallery`, `components/Map`, `components/RedirectPage`, `components/ZoteroGeoViewer`, `components/`) for detailed API docs and examples.

## Creating a new site

```bash
npx --package=@lad-sapienza/scms-core scms-create my-site
cd my-site
npm run dev
```

Prompts for a title, description, author, and site URL, then scaffolds a minimal, ready-to-run Astro + s:CMS project (`src/content.config.ts`, `src/pages/index.astro`, `astro.config.mjs`, etc.) and runs `npm install`.

## Scaffolding CLI

This package also ships the interactive scaffolding tools s:CMS sites use to add content, as `bin` commands — run from the consuming site's project root:

```bash
npx scms-add-collection   # scaffold a new Astro content collection under src/
npx scms-add-content      # add a new content file to an existing collection
```

A consuming site typically wires these up as `npm run add-collection` / `npm run add-content` in its own `package.json` (this is what `scms-create` sets up automatically).

Both commands are multilingual-aware. `scms-add-collection` optionally takes a list of locale codes and scaffolds one sample per `src/content/<name>/<locale>/` folder; `scms-add-content` detects those language folders (every sub-folder is a locale code, nothing loose at the collection root) and asks which language the new file belongs in — a single locale, a comma-separated subset, or `all`.

## Image optimization

`scms-optimize-images` is a maintenance command (also a `bin`, run from the site's project root) that keeps the images in your content light: it converts every JPG/JPEG/PNG under the content folder to WebP, scales them down to a maximum size, deletes the originals and rewrites every reference to them in your `.md`/`.mdx` files. It uses [sharp](https://sharp.pixelplumbing.com/), so nothing else needs to be installed on the machine.

```bash
npx scms-optimize-images              # convert, delete the originals, rewrite references
npx scms-optimize-images --dry-run    # print the estimated savings, touch nothing
npx scms-optimize-images --check      # touch nothing; exit 1 if something is left to do
npx scms-optimize-images --only a.jpg b.png   # limit the work to these files
```

Wire it up in the site's `package.json`:

```json
{
  "scripts": {
    "images": "scms-optimize-images",
    "prebuild": "scms-optimize-images --check"
  }
}
```

`--check` never changes anything — the build must not modify or delete source files. It exits with a non-zero code (and lists the offenders) if it finds a JPG/PNG that could be converted, a WebP larger than the maximum size, or a stale reference from code (see below), so a forgotten image fails the build or the CI instead of being published at 5 MB. Fix it locally with `npm run images`, review the diff, commit.

### What it does

- **Resize**: the long side is limited to `maxSize` (2000 px); images are only ever scaled down. EXIF orientation is applied and metadata stripped.
- **JPG → lossy WebP** at quality 82. **PNG → lossless WebP**; if the result is still larger than 50% of the original *and* the original is over 500 KB, it falls back to lossy WebP (quality 85, alpha quality 100).
- **Not lighter, not converted**: when the WebP would not be smaller than the original, the original is left as it is. The verdict is stored (file hash + settings) in `.scms-optimize-images.json` at the project root — **commit it** — so such images are neither re-encoded on every run nor reported again by `--check`. Replace the file, or change a setting, and it is evaluated again.
- **References** in `.md`/`.mdx` files (frontmatter such as `img:`, `![](…)`, relative and absolute paths) are rewritten. Absolute paths are rooted at the content folder, as in `contentAssetsIntegration`. `%20` is decoded and names are compared case-insensitively.
- **Languages**: pages in a non-default language usually have no assets of their own and reuse those of the default-language twin (`blog/en/post/index.md` citing `a.jpg` that lives in `blog/it/post/`). Such references are resolved by swapping the language folder for the default one — using the languages declared in `userConfig.i18n` (below), not fixed codes.
- **Name conflicts**: `bdus.jpg` + `bdus.png` would both become `bdus.webp`. The one cited by a `.md`/`.mdx` in the same folder (or its twin in another language) is kept, the other is deleted; if that does not single one out, both are skipped and reported.
- **WebP already larger than `maxSize`** are scaled down in place (lossless stays lossless, lossy is re-encoded at `quality`), and reported by `--check`.
- **Idempotent**: a second run changes nothing (and takes a fraction of a second).
- The report lists converted files, skipped ones (with the reason), deleted duplicates and converted WebP that nothing cites (images in `gallery/` folders are not expected to be cited).

### References in code

Only `.md`/`.mdx` files are rewritten. Images can also be referenced from `.astro`, `.jsx`, `.tsx`, `.ts`, `.js` and `.mjs` files under `src/` (`<img src="/didattica/cover.jpg">`, `import x from '@content/…'`): those are **never rewritten** — every one that points at an image that is, or was, converted is reported with file and line, and the command exits with an error:

```
src/pages/[locale]/didattica/index.astro:22  /didattica/cover.jpg is now broken: the image was converted → use /didattica/cover.webp
```

The report keeps coming back (also from `--check`) until the code is fixed, so a broken link cannot slip through silently. Paths are resolved from the content folder (`/…`), from the file (`./…`, `../…`) and through the `@content/` and `@user/` aliases.

### Configuration

All optional; defaults shown. In `src/user.config.mjs`:

```js
export const userConfig = {
  // Languages of the site. Pages in a language other than defaultLocale may reuse
  // the images of the defaultLocale twin. Omit for a monolingual site.
  i18n: {
    defaultLocale: 'it',
    locales: ['it', 'en'],
  },

  images: {
    contentDir: 'src/content',  // scanned for images and .md/.mdx files
    srcDir: 'src',              // scanned for references from code
    maxSize: 2000,              // px, long side
    quality: 82,                // WebP quality for JPGs (and for re-encoded lossy WebP)
    pngLossyRatio: 0.5,         // PNG: go lossy if lossless WebP > this fraction of the original...
    pngLossyMinSize: 500,       // ...and the original is larger than this many KB
    pngLossyQuality: 85,        // quality of that lossy fallback
    exclude: [],                // folders left alone: paths relative to contentDir, or plain folder names
  },
};
```

Keep `i18n` in sync with the site's own locale list (e.g. `LOCALES`/`DEFAULT_LOCALE` in `src/utils/i18n.ts`). Images outside the content folder (e.g. `public/`) are never touched.

### Optional: pre-commit hook

Nothing is installed automatically. If you want images checked at commit time, add `.git/hooks/pre-commit` (or the equivalent in husky/lefthook) and make it executable. It only looks at the images staged in the commit:

```sh
#!/bin/sh
# Block the commit if a staged image is not optimized
git diff --cached --name-only --diff-filter=AM -z -- '*.jpg' '*.jpeg' '*.png' '*.JPG' '*.JPEG' '*.PNG' '*.webp' \
  | xargs -0 npx scms-optimize-images --check --only || {
    echo "Run 'npm run images', review the changes and stage them." >&2
    exit 1
  }
```

An empty list is fine: `--only` with no files does nothing and exits 0. To convert instead of just blocking, run `npx scms-optimize-images --only <files>` and then `git add` the converted `.webp` files and the rewritten `.md`/`.mdx` — the command never stages anything itself.

## Development

```bash
npm install
npm run test        # vitest
npm run typecheck    # tsc --noEmit
```

## License

BSD-0-Clause
