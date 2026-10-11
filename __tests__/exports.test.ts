import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

describe('package.json "exports"', () => {
  it('declares an exports map', () => {
    expect(pkg.exports).toBeTypeOf('object');
  });

  it.each(Object.entries(pkg.exports as Record<string, string>))('%s → %s exists and is published', (_key, target) => {
    expect(existsSync(resolve(root, target))).toBe(true);
    // The target must fall inside a path covered by the "files" allow-list,
    // otherwise it resolves in the repo but is missing from the tarball.
    const covered = (pkg.files as string[]).some((f) => target === `./${f}` || target.startsWith(`./${f}/`));
    expect(covered || target === './package.json').toBe(true);
  });

  it('does not expose internals such as utils or MDX wrappers', () => {
    const keys = Object.keys(pkg.exports);
    expect(keys.some((k) => k.startsWith('./utils'))).toBe(false);
    expect(keys.some((k) => /Mdx/.test(k))).toBe(false);
  });
});
