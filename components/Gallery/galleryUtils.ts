/**
 * Utility functions for Gallery component
 */
import { z } from 'zod';
import * as manifest from 'virtual:scms/galleries';
import type { GalleryImage } from './types';

/**
 * Extract filename without extension from filepath
 */
export function getFileName(filepath: string): string {
  const parts = filepath.split('/');
  const filename = parts[parts.length - 1];
  return filename.replace(/\.[^/.]+$/, '');
}

/**
 * Format filename into readable caption
 * e.g., "my-image-file" -> "My Image File"
 */
export function formatFilename(filename: string): string {
  return filename
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extract base filename without resolution suffix for fuzzy matching
 * Examples:
 * - "children-593313_1280.jpg" → "children-593313"
 * - "coffee-2306471_1920.jpg" → "coffee-2306471"
 */
function getBaseFilename(filename: string): string {
  // Remove extension first
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  // Remove resolution suffix (e.g., _1280, _1920, _640x480)
  return withoutExt.replace(/[_-]\d+(?:x\d+)?$/, '');
}

/**
 * Build a caption lookup with multiple keys for fuzzy matching (exact
 * filename, filename without extension, filename without a resolution
 * suffix), keyed by the *source* filename as written in captions.json.
 */
function buildCaptionLookup(captions: Record<string, string>): Map<string, string> {
  const lookup = new Map<string, string>();
  Object.entries(captions).forEach(([key, value]) => {
    lookup.set(getBaseFilename(key), value);
    lookup.set(key, value);
    lookup.set(key.replace(/\.[^.]+$/, ''), value);
  });
  return lookup;
}

/**
 * Look up a caption for a source filename (exact → no ext → fuzzy base match).
 *
 * Must be matched against the *original* source filename (from the
 * import.meta.glob key), not the Astro-processed `src` — Astro renames
 * output files to `name.HASH.ext`, which would never match a captions.json
 * key written against the original filename.
 */
function lookupCaption(sourceFilename: string, lookup: Map<string, string>): string | undefined {
  const noExt = sourceFilename.replace(/\.[^.]+$/, '');
  const base = getBaseFilename(sourceFilename);
  return lookup.get(sourceFilename) ?? lookup.get(noExt) ?? lookup.get(base);
}

/**
 * Sort images by filename
 */
export function sortImages(images: GalleryImage[], reverse: boolean = false): GalleryImage[] {
  const sorted = [...images].sort((a, b) => {
    const nameA = getFileName(a.src);
    const nameB = getFileName(b.src);
    return nameB.localeCompare(nameA); // DESC by default
  });

  return reverse ? sorted.reverse() : sorted;
}

const captionsSchema = z.record(z.string(), z.string());

/**
 * Validate a raw captions.json payload. Logs a warning and returns undefined
 * (falling back to filename-based captions) rather than throwing, so a
 * malformed captions.json degrades gracefully instead of breaking the build.
 */
function parseCaptions(raw: unknown, source: string): Record<string, string> | undefined {
  const result = captionsSchema.safeParse(raw);
  if (!result.success) {
    console.warn(`[Gallery] Invalid captions.json at "${source}" — ignoring custom captions.`, result.error.message);
    return undefined;
  }
  return result.data;
}

function unwrapModule<T>(mod: { default: T } | T): T {
  return (mod as { default: T }).default ?? (mod as T);
}

function rawFileName(filepath: string): string {
  return filepath.split('/').pop() ?? filepath;
}

function moduleToGalleryImage(
  filepath: string,
  mod: { default: { src: string; width: number; height: number } },
  captionLookup?: Map<string, string>
): GalleryImage {
  const img = unwrapModule(mod);
  const custom = captionLookup ? lookupCaption(rawFileName(filepath), captionLookup) : undefined;
  const label = custom ?? formatFilename(getFileName(filepath));
  return {
    src: img.src,
    thumb: img.src,
    width: img.width,
    height: img.height,
    alt: label,
    caption: label,
  };
}

const normalizePath = (pathname: string): string => pathname.replace(/\/$/, '');

const COLOCATED_GALLERY_PATTERN = /\/(pages|content)(.+)\/gallery\//;
const SHARED_GALLERY_PATTERN = /\/galleries\/([^/]+)\//;

export function getColocatedCaptions(pathname: string): Record<string, string> | undefined {
  const normalized = normalizePath(pathname);
  const allCaptions = { ...manifest.pagesCaptions, ...manifest.contentCaptions };
  const entry = Object.entries(allCaptions).find(([filepath]) => {
    const match = filepath.match(COLOCATED_GALLERY_PATTERN);
    return !!match && normalized === match[2];
  });
  if (!entry) return undefined;
  const [filepath, mod] = entry;
  return parseCaptions(unwrapModule(mod), filepath);
}

export function getSharedCaptions(name: string): Record<string, string> | undefined {
  const entry = Object.entries(manifest.sharedCaptions).find(([filepath]) => {
    const match = filepath.match(SHARED_GALLERY_PATTERN);
    return !!match && match[1] === name;
  });
  if (!entry) return undefined;
  const [filepath, mod] = entry;
  return parseCaptions(unwrapModule(mod), filepath);
}

/**
 * Images from a `gallery/` folder colocated with the current page/content
 * file, matched by comparing the current URL path against the folder
 * structure under usr/pages/ or usr/content/. Applies captions.json from
 * the same folder, if present.
 *
 * Known limitation (unchanged from before this redesign): if a content
 * collection entry overrides its slug, or the site has a non-root `base`,
 * the URL path diverges from the on-disk folder path and matching silently
 * finds nothing.
 */
export function getColocatedGalleryImages(pathname: string): GalleryImage[] {
  const normalized = normalizePath(pathname);
  const allImages = { ...manifest.pagesImages, ...manifest.contentImages };
  const captions = getColocatedCaptions(pathname);
  const captionLookup = captions ? buildCaptionLookup(captions) : undefined;
  return Object.entries(allImages)
    .filter(([filepath]) => {
      const match = filepath.match(COLOCATED_GALLERY_PATTERN);
      return !!match && normalized === match[2];
    })
    .map(([filepath, mod]) => moduleToGalleryImage(filepath, mod, captionLookup));
}

/** Images from a shared gallery at usr/galleries/<name>/. Applies captions.json from the same folder, if present. */
export function getSharedGalleryImages(name: string): GalleryImage[] {
  const captions = getSharedCaptions(name);
  const captionLookup = captions ? buildCaptionLookup(captions) : undefined;
  return Object.entries(manifest.sharedImages)
    .filter(([filepath]) => {
      const match = filepath.match(SHARED_GALLERY_PATTERN);
      return !!match && match[1] === name;
    })
    .map(([filepath, mod]) => moduleToGalleryImage(filepath, mod, captionLookup));
}
