/**
 * galleryIntegration
 *
 * Registers the virtual module `virtual:scms/galleries`, which holds the
 * import.meta.glob() calls the Gallery component needs to auto-load images.
 *
 * Vite requires import.meta.glob patterns to be static string literals in the
 * file that calls them — a plain relative pattern shipped inside a
 * node_modules/ package would resolve against the package's own folder, never
 * the consumer project's. Because this module's source is generated here
 * (not shipped verbatim as part of the component), the literal lives in code
 * Vite parses fresh in the consumer's own build, satisfying that requirement.
 * Verified empirically (2026-08-22): a generated virtual module's glob still
 * goes through Astro's image pipeline (hashed src + width/height), not just
 * raw strings — see project memory for the prototype that confirmed this.
 */
import type { AstroIntegration } from 'astro';

export const GALLERY_VIRTUAL_MODULE_ID = 'virtual:scms/galleries';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + GALLERY_VIRTUAL_MODULE_ID;

const IMAGE_EXTENSIONS = '{jpg,jpeg,png,gif,webp,avif,JPG,JPEG,PNG,GIF,WEBP,AVIF}';

export interface GalleryIntegrationOptions {
  /** Path to page files, relative to the project root. Defaults to 'usr/pages'. */
  pagesDir?: string;
  /** Path to content collections, relative to the project root. Defaults to 'usr/content'. */
  contentDir?: string;
  /** Path to shared galleries, relative to the project root. Defaults to 'usr/galleries'. */
  galleriesDir?: string;
}

/** Normalize a directory segment into a Vite root-relative glob prefix, e.g. 'usr/pages' -> '/usr/pages'. */
function toRootGlobPrefix(dir: string): string {
  return '/' + dir.replace(/^\/+|\/+$/g, '');
}

export function buildGalleryVirtualModuleSource(options: GalleryIntegrationOptions = {}): string {
  const pages = toRootGlobPrefix(options.pagesDir ?? 'usr/pages');
  const content = toRootGlobPrefix(options.contentDir ?? 'usr/content');
  const galleries = toRootGlobPrefix(options.galleriesDir ?? 'usr/galleries');

  return `
export const pagesImages = import.meta.glob('${pages}/**/gallery/*.${IMAGE_EXTENSIONS}', { eager: true });
export const contentImages = import.meta.glob('${content}/**/gallery/*.${IMAGE_EXTENSIONS}', { eager: true });
export const sharedImages = import.meta.glob('${galleries}/*/*.${IMAGE_EXTENSIONS}', { eager: true });
export const pagesCaptions = import.meta.glob('${pages}/**/gallery/captions.json', { eager: true });
export const contentCaptions = import.meta.glob('${content}/**/gallery/captions.json', { eager: true });
export const sharedCaptions = import.meta.glob('${galleries}/*/captions.json', { eager: true });
`;
}

export function galleryIntegration(options: GalleryIntegrationOptions = {}): AstroIntegration {
  const virtualModuleSource = buildGalleryVirtualModuleSource(options);

  return {
    name: 'scms-gallery',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: 'scms-gallery-virtual-module',
                resolveId(id: string) {
                  if (id === GALLERY_VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_MODULE_ID;
                },
                load(id: string) {
                  if (id === RESOLVED_VIRTUAL_MODULE_ID) return virtualModuleSource;
                },
              },
            ],
          },
        });
      },
    },
  };
}
