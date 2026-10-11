/**
 * scms
 *
 * Bundles every integration sCMS's components need, plus the Vite config
 * (React/@tanstack dedupe, optimizeDeps) they depend on, into one function.
 *
 * Why the dedupe/optimizeDeps live here rather than in the consumer's own
 * astro.config.mjs: confirmed empirically (2026-08-22, npm-packaging
 * prototype — see project memory) that without an explicit Vite `dedupe`
 * entry, React and @tanstack/react-table can resolve to two different
 * physical module copies in the same render tree, crashing with "Invalid
 * hook call" in dev mode specifically (a production build can look fine and
 * still be broken in dev). Registering it from the integration itself means
 * every consumer gets the fix automatically, instead of needing to
 * hand-configure Vite themselves.
 *
 * This file has no path-alias dependency, by design — it's consumed
 * directly as the `@lad-sapienza/scms-core` npm package (`import { scms }
 * from '@lad-sapienza/scms-core'`), not via a path alias into a sibling
 * folder. Any `@user`/`@components`/etc. aliases a consuming site defines
 * for its own content are that site's own astro.config.mjs concern.
 */
import type { AstroIntegration } from 'astro';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers';
import { contentAssetsIntegration } from './integrations/contentAssetsIntegration';
import { galleryIntegration } from './integrations/galleryIntegration';

export interface ScmsOptions {
  /** Path to the content directory, relative to the project root. Defaults to 'src/content'. */
  contentDir?: string;
  /** Path to page files, relative to the project root. Defaults to 'src/pages'. */
  pagesDir?: string;
  /** Path to shared galleries, relative to the project root. Defaults to 'src/galleries'. */
  galleriesDir?: string;
  /**
   * Link MapLibre's stylesheet (`maplibre-gl/dist/maplibre-gl.css`, ~83 KB /
   * ~11 KB gzipped) from every page — see `scmsMapCssIntegration`. Defaults to
   * `true`. Set `false` for sites that never render `<Map>`, or that import the
   * stylesheet themselves.
   */
  mapCss?: boolean;
}

/** react, react-dom, and any library that calls hooks internally (@tanstack/react-table) — see file doc comment. */
const HOOK_LIBRARIES = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'scheduler', '@tanstack/react-table'];

/**
 * Must match the `localStorage` key `ThemeToggle.tsx` reads/writes — see
 * that file's doc comment. Sets `data-bs-theme` on `<html>` before first
 * paint so the page never flashes the wrong theme while React hydrates.
 *
 * `ThemeToggle` stores "system" as the *absence* of a key (only "light" or
 * "dark" are ever written) — so anything other than exactly those two
 * strings (missing key, or a stale/foreign value) falls back to
 * `prefers-color-scheme`, matching "system" being the default preference.
 */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('scms-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-bs-theme',t);}catch(e){}})();`;

function scmsViteConfigIntegration(): AstroIntegration {
  return {
    name: 'scms-vite-config',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            resolve: {
              dedupe: HOOK_LIBRARIES,
            },
            optimizeDeps: {
              // papaparse is CommonJS-only (no `module`/`exports` field). Its
              // importer (CsvSource.tsx) lives in node_modules once this is a
              // published package, so Vite's dev-time dependency scanner no
              // longer discovers it on its own and pre-bundles the CJS→ESM
              // interop — without this entry the browser is served the raw CJS
              // file and crashes with "does not provide an export named
              // 'default'". Must stay explicit.
              //
              // maplibre-gl used to need the same treatment because v5 shipped a
              // UMD `dist/maplibre-gl.js`; v6 is real ESM (`dist/maplibre-gl.mjs`,
              // `"exports"` map, no UMD), so Vite handles it with no interop
              // shim and no explicit entry here. Map.tsx's `?worker&url` worker
              // chunk is a separate, self-contained module and does not go
              // through this pre-bundle.
              include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'papaparse'],
            },
            ssr: {
              // MapLibre GL JS v6's worker is wired up in Map.tsx via a
              // `maplibre-gl/dist/...?worker&url` import (see that file). Vite's
              // worker plugin can only resolve that specifier when maplibre-gl
              // is bundled for SSR rather than externalised to a raw Node
              // `import`. MapLibre's own Astro guidance calls for this.
              //
              // This is about the worker only. It has no bearing on whether the
              // stylesheet reaches the page — that is a separate problem, with
              // the same symptom under every client directive (`client:load`
              // and `client:only` alike); see `scmsMapCssIntegration`.
              noExternal: ['maplibre-gl'],
            },
          },
        });
      },
    },
  };
}

/** Injects the anti-FOUC theme-init script into every page's `<head>` — see `THEME_INIT_SCRIPT` above. */
function scmsThemeInitIntegration(): AstroIntegration {
  return {
    name: 'scms-theme-init',
    hooks: {
      'astro:config:setup': ({ injectScript }) => {
        injectScript('head-inline', THEME_INIT_SCRIPT);
      },
    },
  };
}

/**
 * Links MapLibre's stylesheet from every page.
 *
 * `Map.tsx` imports `maplibre-gl/dist/maplibre-gl.css` itself, which is enough
 * when `<Map>` is imported straight into a page or layout. It is NOT enough
 * for a `<Map>` imported from an MDX content-collection entry whose
 * `render()`ed `Content` is handed down as a prop to another component (e.g.
 * `<ArticlePage Content={Content} />`, which then renders `<Content />` inside
 * a layout): Astro still emits the stylesheet but never links it from the
 * page's HTML, so the layer control, zoom buttons and popups render unstyled
 * in production builds. `astro dev` is unaffected (Vite injects CSS at
 * runtime), which is why it only shows up after `astro build`. Reproduced on
 * Astro 7.2.4 with `client:load` and `client:only="react"`.
 *
 * Importing the stylesheet from `page-ssr` puts it in every page's own module
 * graph, so it is linked regardless of how the MDX is rendered. Costs: one
 * cached, render-blocking ~11 KB (gzipped) request on pages that have no map —
 * hence the `mapCss` opt-out — and, for a `<Map client:only>` imported
 * directly into a page, a second identical-content file (Astro emits the
 * island's copy separately), which is redundant but harmless.
 */
function scmsMapCssIntegration(): AstroIntegration {
  return {
    name: 'scms-map-css',
    hooks: {
      'astro:config:setup': ({ injectScript }) => {
        injectScript('page-ssr', "import 'maplibre-gl/dist/maplibre-gl.css';");
      },
    },
  };
}

export function scms(options: ScmsOptions = {}): AstroIntegration[] {
  const { contentDir, pagesDir, galleriesDir, mapCss = true } = options;

  return [
    contentAssetsIntegration({ contentDir }),
    galleryIntegration({ pagesDir, contentDir, galleriesDir }),
    expressiveCode({
      themes: ['github-dark'],
      plugins: [pluginLineNumbers()],
      defaultProps: { showLineNumbers: true },
    }),
    mdx(),
    react(),
    sitemap(),
    scmsViteConfigIntegration(),
    scmsThemeInitIntegration(),
    ...(mapCss ? [scmsMapCssIntegration()] : []),
  ];
}
