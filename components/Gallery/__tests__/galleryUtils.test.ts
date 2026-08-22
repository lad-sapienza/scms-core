import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const manifest = {
  pagesImages: {
    '/usr/pages/my-page/gallery/photo1.jpg': { default: { src: '/_astro/photo1.abc123.jpg', width: 1200, height: 800 } },
  },
  contentImages: {
    '/usr/content/blog/my-article/gallery/photo2.jpg': { default: { src: '/_astro/photo2.def456.jpg', width: 1000, height: 600 } },
    '/usr/content/blog/other-article/gallery/photo3.jpg': { default: { src: '/_astro/photo3.ghi789.jpg', width: 900, height: 500 } },
  },
  sharedImages: {
    '/usr/galleries/scavi-2024/site-a.jpg': { default: { src: '/_astro/site-a.jkl000.jpg', width: 800, height: 600 } },
    '/usr/galleries/scavi-2024/site-b_1920.jpg': { default: { src: '/_astro/site-b_1920.mno111.jpg', width: 800, height: 600 } },
    '/usr/galleries/other-name/site-c.jpg': { default: { src: '/_astro/site-c.pqr222.jpg', width: 800, height: 600 } },
  },
  pagesCaptions: {},
  contentCaptions: {
    '/usr/content/blog/my-article/gallery/captions.json': { default: { 'photo2.jpg': 'A custom caption' } },
  },
  sharedCaptions: {
    '/usr/galleries/scavi-2024/captions.json': {
      default: {
        'site-a.jpg': 'Exact match caption',
        // Deliberately a different resolution suffix than the real file
        // (site-b_1920.jpg vs the real site-b_1920.jpg above uses the same
        // base name so this also verifies base-filename fuzzy matching).
        'site-b_1280.jpg': 'Fuzzy match caption',
      },
    },
  },
};

vi.mock('virtual:scms/galleries', () => manifest);

const {
  getColocatedGalleryImages,
  getColocatedCaptions,
  getSharedGalleryImages,
  getSharedCaptions,
  sortImages,
  formatFilename,
  getFileName,
} = await import('../galleryUtils');

describe('getColocatedGalleryImages', () => {
  it('matches a page-colocated gallery by URL path', () => {
    const images = getColocatedGalleryImages('/my-page/');
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe('/_astro/photo1.abc123.jpg');
    expect(images[0].width).toBe(1200);
  });

  it('matches a content-colocated gallery by URL path', () => {
    const images = getColocatedGalleryImages('/blog/my-article');
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe('/_astro/photo2.def456.jpg');
  });

  it('handles a trailing slash the same as without one', () => {
    const withSlash = getColocatedGalleryImages('/blog/my-article/');
    const withoutSlash = getColocatedGalleryImages('/blog/my-article');
    expect(withSlash).toEqual(withoutSlash);
  });

  it('returns an empty array when no gallery matches the path', () => {
    expect(getColocatedGalleryImages('/no/such/page')).toEqual([]);
  });

  it('derives alt/caption from the filename when no captions.json applies', () => {
    const [image] = getColocatedGalleryImages('/my-page/');
    expect(image.alt).toBe('Photo1');
    expect(image.caption).toBe('Photo1');
  });

  it('applies a matching captions.json caption instead of the filename fallback', () => {
    const [image] = getColocatedGalleryImages('/blog/my-article');
    expect(image.caption).toBe('A custom caption');
    expect(image.alt).toBe('A custom caption');
  });
});

describe('getColocatedCaptions', () => {
  it('returns the parsed captions for a matching path', () => {
    expect(getColocatedCaptions('/blog/my-article')).toEqual({ 'photo2.jpg': 'A custom caption' });
  });

  it('returns undefined when there is no captions.json for the path', () => {
    expect(getColocatedCaptions('/my-page/')).toBeUndefined();
  });
});

describe('getSharedGalleryImages', () => {
  it('returns only images under the matching shared gallery name', () => {
    const images = getSharedGalleryImages('scavi-2024');
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.src).sort()).toEqual(['/_astro/site-a.jkl000.jpg', '/_astro/site-b_1920.mno111.jpg']);
  });

  it('returns an empty array for an unknown gallery name', () => {
    expect(getSharedGalleryImages('does-not-exist')).toEqual([]);
  });

  it('applies an exact-filename caption match', () => {
    const images = getSharedGalleryImages('scavi-2024');
    const siteA = images.find((i) => i.src.includes('site-a'));
    expect(siteA?.caption).toBe('Exact match caption');
  });

  it('fuzzy-matches a caption across a different resolution suffix than the real file', () => {
    const images = getSharedGalleryImages('scavi-2024');
    const siteB = images.find((i) => i.src.includes('site-b'));
    expect(siteB?.caption).toBe('Fuzzy match caption');
  });

  it('falls back to the filename when no gallery-wide captions.json exists', () => {
    const images = getSharedGalleryImages('other-name');
    expect(images[0].caption).toBe('Site C');
  });
});

describe('getSharedCaptions', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('logs a warning and returns undefined for a malformed captions.json', () => {
    const result = parseMalformedFixture();
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid captions.json'),
      expect.anything()
    );
  });

  it('returns undefined for an unknown gallery name, without warning', () => {
    expect(getSharedCaptions('does-not-exist')).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  function parseMalformedFixture() {
    // Reuses the real function against a manifest entry shaped like a
    // malformed captions.json (nested object instead of Record<string,string>).
    (manifest.sharedCaptions as any)['/usr/galleries/broken/captions.json'] = { default: { nested: { not: 'a string' } } };
    return getSharedCaptions('broken');
  }
});

describe('sortImages', () => {
  const images = [
    { src: 'a.jpg', thumb: '', width: 1, height: 1, alt: '', caption: '' },
    { src: 'c.jpg', thumb: '', width: 1, height: 1, alt: '', caption: '' },
    { src: 'b.jpg', thumb: '', width: 1, height: 1, alt: '', caption: '' },
  ];

  it('sorts descending by filename by default', () => {
    expect(sortImages(images).map((i) => i.src)).toEqual(['c.jpg', 'b.jpg', 'a.jpg']);
  });

  it('sorts ascending when reverse is true', () => {
    expect(sortImages(images, true).map((i) => i.src)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });
});

describe('formatFilename / getFileName', () => {
  it('extracts a filename without its extension', () => {
    expect(getFileName('/a/b/my-photo.jpg')).toBe('my-photo');
  });

  it('formats a hyphenated filename into title case', () => {
    expect(formatFilename('my-photo-file')).toBe('My Photo File');
  });
});
