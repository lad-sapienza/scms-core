# Gallery Component

A responsive image gallery component with PhotoSwipe lightbox integration. One component, usable the same way from `.astro` files and MDX content — no `import.meta.glob` needed in your own page or content file.

## Features

- 📸 **PhotoSwipe Lightbox**: Full-screen image viewing with zoom and navigation
- 🎨 **Responsive Grid**: Auto-adjusting columns based on screen size
- 🔄 **Auto-loading**: automatically discovers images in a `gallery/` folder colocated with the current page/content file
- 🔗 **Shared galleries**: reference one set of images by name from `usr/galleries/<name>/`
- 🔍 **Custom Captions**: via `captions.json`, or auto-generated from filenames
- ⌨️ **Keyboard Navigation**: Arrow keys and ESC support
- ♿ **Accessible**: Proper ARIA labels and keyboard support

## How auto-loading works

`Gallery.astro` doesn't glob its own files — a separate integration
(`core/integrations/galleryIntegration.ts`, bundled into `core/scms.ts` and wired into `astro.config.mjs`)
generates a Vite virtual module (`virtual:scms/galleries`) containing the
`import.meta.glob()` calls, at project build time. `Gallery.astro` just reads
from that virtual module and matches by URL path. This exists so the component
can move into an npm package later without losing auto-loading (a component
shipped in `node_modules/` can't statically glob a consumer project's files;
the integration generating the glob call at the consumer's own build time
can). See `core/integrations/galleryIntegration.ts`'s own doc comment for
details, and `core/components/Gallery/galleryUtils.ts` for the matching logic.

## Usage

### Colocated (default) — auto-loads from a sibling `gallery/` folder

```
usr/content/blog/my-post/
  index.mdx
  gallery/
    photo1.jpg
    photo2.jpg
    captions.json      ← optional
```

```mdx
import { Gallery } from '@lad-sapienza/scms-core/components/Gallery';

<Gallery />
```

Matching is based on the current page's URL path against the folder
structure on disk. **Known limitation**: if a content collection entry
overrides its slug, or the site is deployed under a non-root `base`, the URL
path can diverge from the on-disk folder path and the match silently finds
nothing. Use `name` (below) or `images` as a workaround in that case.

### Shared — referenced by name from any page

```
usr/galleries/
  scavi-2024/
    photo1.jpg
    photo2.jpg
    captions.json      ← optional
```

```mdx
<Gallery name="scavi-2024" />
```

### Explicit — pass images directly

Escape hatch for remote images, a Directus-backed source, or a custom order.
Takes precedence over both `name` and auto-loading.

```jsx
<Gallery
  images={[
    { src: '/photos/img1.jpg', thumb: '/photos/img1.jpg', width: 1200, height: 800, alt: 'Description', caption: 'My custom caption' },
  ]}
/>
```

## Custom Captions

By default, captions are generated from filenames (e.g., `my-photo.jpg` → "My Photo"). Place a `captions.json` file in the same `gallery/` folder (colocated) or shared-gallery folder to override them:

```json
{
  "photo1.jpg": "A beautiful sunset over the mountains",
  "photo2.jpg": "Morning coffee with a view"
}
```

Keys can be filenames with or without extensions, and can use a different
resolution suffix than the actual file (`_1280`, `_1920`, etc.) — matching is
fuzzy on the base filename. A malformed `captions.json` (not a flat
string-to-string map) is ignored with a console warning rather than breaking
the build.

## Props API

| Prop | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Load a shared gallery from `usr/galleries/<name>/` |
| `images` | `GalleryImage[]` | — | Explicit images — takes precedence over `name` and auto-loading |
| `reverseSorting` | `boolean` | `false` | Reverse the default alphabetical sort |
| `columns` | `{ min?: number, max?: number }` | `{ min: 200, max: 1 }` | `min` = minimum item width in px; `max` = maximum column count |
| `className` | `string` | — | Additional CSS classes |

### GalleryImage Type

```typescript
interface GalleryImage {
  src: string;       // Full-size image URL
  thumb: string;     // Thumbnail URL
  width: number;
  height: number;
  alt: string;
  caption?: string;
}
```
