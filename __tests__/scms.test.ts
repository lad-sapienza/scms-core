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
