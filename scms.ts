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
  /** Path to the content directory, relative to the project root. Defaults to 'usr/content'. */
  contentDir?: string;
  /** Path to page files, relative to the project root. Defaults to 'usr/pages'. */
  pagesDir?: string;
  /** Path to shared galleries, relative to the project root. Defaults to 'usr/galleries'. */
  galleriesDir?: string;
}

/** react, react-dom, and any library that calls hooks internally (@tanstack/react-table) — see file doc comment. */
const HOOK_LIBRARIES = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'scheduler', '@tanstack/react-table'];

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
              include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
            },
          },
        });
      },
    },
  };
}

export function scms(options: ScmsOptions = {}): AstroIntegration[] {
  const { contentDir, pagesDir, galleriesDir } = options;

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
  ];
}
