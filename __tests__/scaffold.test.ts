import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CREATE = resolve(__dirname, '../bin/create.mjs');
const OWN_PACKAGE = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('scms-create', () => {
  let workdir: string;
  let site: string;
  let result: ReturnType<typeof spawnSync>;

  beforeAll(() => {
    workdir = mkdtempSync(join(tmpdir(), 'scms-create-'));
    site = join(workdir, 'my-site');
    // Answers, in prompt order: title, description, author, site URL, "npm install now?" -> n
    result = spawnSync('node', [CREATE, 'my-site'], {
      cwd: workdir,
      input: 'My Test Site\nA test description\nTest Author\nhttps://example.org\nn\n',
      encoding: 'utf8',
      timeout: 30_000,
    });
  });

  afterAll(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it('exits successfully and creates the project directory', () => {
    expect(result.status).toBe(0);
    expect(existsSync(site)).toBe(true);
  });

  it('strips .tmpl suffixes', () => {
    const files = walk(site);
    expect(files.some((f) => f.endsWith('.tmpl'))).toBe(false);
    expect(existsSync(join(site, 'package.json'))).toBe(true);
    expect(existsSync(join(site, 'src/user.config.mjs'))).toBe(true);
  });

  it('leaves no unreplaced __PLACEHOLDER__ in any generated file', () => {
    const offenders = walk(site).filter((f) => /__[A-Z][A-Z_]*__/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('pins scms-core to the version being scaffolded and fills in the answers', () => {
    const pkg = JSON.parse(readFileSync(join(site, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('my-site');
    expect(pkg.dependencies['@lad-sapienza/scms-core']).toBe(`^${OWN_PACKAGE.version}`);
    expect(readFileSync(join(site, 'src/user.config.mjs'), 'utf8')).toContain('My Test Site');
  });

  it('refuses to scaffold into a non-empty directory', () => {
    const again = spawnSync('node', [CREATE, 'my-site'], {
      cwd: workdir,
      input: '\n\n\n\nn\n',
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(again.status).not.toBe(0);
  });
});
