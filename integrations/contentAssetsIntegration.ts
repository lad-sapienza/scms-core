/**
 * contentAssetsIntegration
 *
 * Astro integration that serves static assets (images, PDFs, etc.) co-located
 * in the content directory (usr/content/ by default) without requiring a
 * manual copy step.
 *
 * - Dev server: a Vite middleware intercepts requests for static file extensions
 *   and serves them directly from the content directory, mapping URL paths 1:1
 *   (e.g. /blog/post/image.jpg → usr/content/blog/post/image.jpg).
 *
 * - Production build: assets are copied from the content directory into dist/
 *   with the same relative path structure, so they are available at the
 *   expected URLs.
 *
 * This replaces the scripts/copy-content-images.js pre-build script for
 * content-colocated assets.
 */

import type { AstroIntegration } from 'astro';
import { resolve, join, relative, extname, dirname } from 'node:path';
import { existsSync, statSync, mkdirSync, copyFileSync, readdirSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface ContentAssetsOptions {
  /** Path to the content directory, relative to the project root. Defaults to 'usr/content'. */
  contentDir?: string;
}

/** File extensions treated as static assets. */
const STATIC_EXTENSIONS = /\.(jpe?g|png|gif|svg|webp|pdf|avif|mp4|mp3|woff2?|ttf|ico)$/i;

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  avif: 'image/avif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  ico: 'image/x-icon',
};

function collectAssets(dir: string, results: string[] = []): string[] {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      collectAssets(fullPath, results);
    } else if (STATIC_EXTENSIONS.test(item.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

export function contentAssetsIntegration(options: ContentAssetsOptions = {}): AstroIntegration {
  const contentDirSegment = options.contentDir ?? join('usr', 'content');
  // Resolved from Astro's own config root in astro:config:setup below, rather
  // than assumed from process.cwd() — more portable if the process is ever
  // invoked from somewhere other than the project root.
  let projectRoot = process.cwd();

  return {
    name: 'content-assets',
    hooks: {
      'astro:config:setup': ({ config }) => {
        projectRoot = fileURLToPath(config.root);
      },

      /**
       * Dev server: add a Connect middleware that serves static assets directly
       * from the content directory without requiring them to be copied to
       * usr/public/.
       */
      'astro:server:setup': ({ server, logger }) => {
        const contentDir = resolve(projectRoot, contentDirSegment);

        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0];
          if (!url || !STATIC_EXTENSIONS.test(url)) return next();

          // Security: prevent path traversal
          const filePath = resolve(join(contentDir, url));
          if (!filePath.startsWith(contentDir + '/')) return next();

          if (!existsSync(filePath) || statSync(filePath).isDirectory()) return next();

          const mime = MIME_TYPES[extname(filePath).slice(1).toLowerCase()] ?? 'application/octet-stream';
          res.setHeader('Content-Type', mime);
          createReadStream(filePath).pipe(res as NodeJS.WritableStream);
        });

        logger.info(`Serving content assets directly from ${contentDirSegment}/`);
      },

      /**
       * Production build: copy all static assets from the content directory
       * into the dist/ output directory, preserving the relative path structure.
       */
      'astro:build:done': ({ dir, logger }) => {
        const contentDir = resolve(projectRoot, contentDirSegment);
        const distDir = fileURLToPath(dir);

        if (!existsSync(contentDir)) {
          logger.warn(`${contentDirSegment}/ not found – skipping content asset copy`);
          return;
        }

        const assets = collectAssets(contentDir);
        let count = 0;

        for (const assetPath of assets) {
          const relPath = relative(contentDir, assetPath);
          const destPath = join(distDir, relPath);
          mkdirSync(dirname(destPath), { recursive: true });
          copyFileSync(assetPath, destPath);
          count++;
        }

        if (count > 0) {
          logger.info(`Copied ${count} content asset(s) to dist/`);
        }
      },
    },
  };
}
