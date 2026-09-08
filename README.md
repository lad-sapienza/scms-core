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

## Development

```bash
npm install
npm run test        # vitest
npm run typecheck    # tsc --noEmit
```

## License

BSD-0-Clause
