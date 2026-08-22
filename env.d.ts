/// <reference types="astro/client" />

// Plain `tsc` (unlike `astro check`) has no Astro language-service plugin to
// parse `.astro` files, so it can't resolve `.astro` imports at all. This
// shim lets `.ts`/`.tsx` type-checking proceed; it doesn't validate `.astro`
// component props — that still only happens via `astro check` in a real
// consuming project.
declare module '*.astro' {
  const Component: any;
  export default Component;
}
