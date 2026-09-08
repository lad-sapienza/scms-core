import { describe, it, expect, vi } from 'vitest';
import { scms } from '../scms';

describe('scms', () => {
  it('returns an array of integrations, one of which self-configures the React/@tanstack dedupe', () => {
    const integrations = scms();
    expect(Array.isArray(integrations)).toBe(true);

    const viteConfigIntegration = integrations.find((i) => i.name === 'scms-vite-config');
    expect(viteConfigIntegration).toBeDefined();

    let capturedConfig: any;
    const updateConfig = vi.fn((config: any) => {
      capturedConfig = config;
    });

    const setupHook = viteConfigIntegration!.hooks?.['astro:config:setup'];
    // @ts-expect-error - minimal fake hook params, only what the hook uses
    setupHook({ updateConfig });

    // This dedupe list is what fixed a real, reproduced "Invalid hook call"
    // crash during the npm-packaging prototype (2026-08-22) — a duplicate
    // React/react-table module instance in the render tree. Losing any of
    // these entries silently reintroduces that risk for consumers.
    expect(capturedConfig.vite.resolve.dedupe).toEqual(
      expect.arrayContaining(['react', 'react-dom', '@tanstack/react-table'])
    );
    expect(capturedConfig.vite.optimizeDeps.include).toEqual(
      expect.arrayContaining(['react', 'react-dom'])
    );

    // papaparse (CommonJS) needs explicit pre-bundling once its importer
    // (CsvSource.tsx) lives in node_modules instead of the consumer's own
    // source tree — confirmed empirically via a real `astro dev` crash:
    // "does not provide an export named 'default'" (2026-08-22). Must stay
    // explicit here.
    expect(capturedConfig.vite.optimizeDeps.include).toEqual(
      expect.arrayContaining(['papaparse'])
    );
    // maplibre-gl v6 is real ESM (v5 shipped a UMD bundle), so it no longer
    // needs a pre-bundle interop entry — see scms.ts.
    expect(capturedConfig.vite.optimizeDeps.include).not.toContain('maplibre-gl');

    // maplibre-gl must be bundled for SSR, not externalised, so Vite's worker
    // plugin can resolve Map.tsx's `?worker&url` import in the server pass
    // (needed for `client:load`/`client:visible` <Map> usage).
    expect(capturedConfig.vite.ssr.noExternal).toEqual(
      expect.arrayContaining(['maplibre-gl'])
    );
  });

  it('includes the content-assets and gallery integrations', () => {
    const names = scms().map((i) => i.name);
    expect(names).toContain('content-assets');
    expect(names).toContain('scms-gallery');
  });

  it('forwards contentDir/pagesDir/galleriesDir options to the gallery integration', () => {
    const integrations = scms({ pagesDir: 'src/pages', contentDir: 'src/content', galleriesDir: 'src/galleries' });
    const gallery = integrations.find((i) => i.name === 'scms-gallery')!;

    let capturedConfig: any;
    const updateConfig = vi.fn((config: any) => {
      capturedConfig = config;
    });
    const setupHook = gallery.hooks?.['astro:config:setup'];
    // @ts-expect-error - minimal fake hook params, only what the hook uses
    setupHook({ updateConfig });

    const plugin = capturedConfig.vite.plugins[0];
    const source = plugin.load(plugin.resolveId('virtual:scms/galleries'));
    expect(source).toContain("'/src/pages/**/gallery/*.");
    expect(source).toContain("'/src/content/**/gallery/*.");
    expect(source).toContain("'/src/galleries/*/*.");
  });
});
