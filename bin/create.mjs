#!/usr/bin/env node
// create.mjs — Guided scaffold of a new s:CMS site.
// Usage: npx --package=@lad-sapienza/scms-core scms-create [directory]

import { createInterface } from 'node:readline';
import {
  existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT   = join(__dirname, '..');
const TEMPLATE_DIR   = join(PACKAGE_ROOT, 'template');
const OWN_PACKAGE     = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));

// ─── Color helpers ────────────────────────────────────────────────────────────
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m';
const B = '\x1b[1m',  X = '\x1b[0m';
const ok    = (...a) => console.log(`${G}✔${X}  ${a.join(' ')}`);
const warn  = (...a) => console.log(`${Y}⚠${X}  ${a.join(' ')}`);
const error = (...a) => { console.error(`${R}✖${X}  ${a.join(' ')}`); process.exit(1); };

// ─── Readline helper ──────────────────────────────────────────────────────────
// Same async-iterator pattern as add-collection.mjs / add-content.mjs — avoids
// the readline hang on piped/pasted (non-TTY) input those scripts already fixed.
const rl  = createInterface({ input: process.stdin, output: process.stdout });
rl.on('SIGINT', () => { console.log(''); process.exit(0); });
const rlIterator = rl[Symbol.asyncIterator]();
const ask = async (prompt) => {
  process.stdout.write(prompt);
  const { value, done } = await rlIterator.next();
  if (done) { console.log(''); process.exit(0); }
  return value;
};

/** Strip a leading semver range operator (^, ~, >=, etc.) to get a bare version. */
const bareVersion = (range) => range.replace(/^[^\d]*/, '');

/** Recursively copy `template/`, substituting placeholders and stripping .tmpl suffixes. */
function copyTemplate(srcDir, destDir, replacements) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    if (entry.isDirectory()) {
      copyTemplate(srcPath, join(destDir, entry.name), replacements);
      continue;
    }
    const isTemplate = entry.name.endsWith('.tmpl');
    const destName = isTemplate ? entry.name.slice(0, -'.tmpl'.length) : entry.name;
    const destPath = join(destDir, destName);
    let content = readFileSync(srcPath, 'utf8');
    if (isTemplate) {
      for (const [placeholder, value] of Object.entries(replacements)) {
        content = content.replaceAll(placeholder, value);
      }
    }
    writeFileSync(destPath, content, 'utf8');
  }
}

async function main() {
  console.log('');
  console.log(`${B}Create a new s:CMS site${X}`);
  console.log('');

  // ─── Prompt: target directory ────────────────────────────────────────────
  const argDir = process.argv[2];
  let targetDir;
  if (argDir) {
    targetDir = argDir;
  } else {
    while (true) {
      const raw = (await ask(`${B}Directory${X} (will be created): `)).trim();
      if (!raw) { warn('Please enter a directory name.'); continue; }
      targetDir = raw;
      break;
    }
  }
  const targetPath = join(process.cwd(), targetDir);
  if (existsSync(targetPath) && readdirSync(targetPath).length > 0) {
    error(`${targetDir}/ already exists and is not empty.`);
  }

  // ─── Prompt: site info ────────────────────────────────────────────────────
  const dirBasedTitle = targetDir.split('/').pop().replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const title = (await ask(`${B}Site title${X} [${dirBasedTitle}]: `)).trim() || dirBasedTitle;

  const description = (await ask(`${B}Description${X}: `)).trim() || `A site built with s:CMS.`;

  let gitAuthor = '';
  try {
    gitAuthor = execSync('git config user.name', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* git not available or no config */ }
  const author = (await ask(`${B}Author${X}${gitAuthor ? ` [${gitAuthor}]` : ''}: `)).trim() || gitAuthor;

  const siteUrl = (await ask(`${B}Site URL${X} (for sitemap/canonical URLs, e.g. https://example.com): `)).trim();

  const installNow = (await ask(`${B}Run npm install now?${X} [Y/n]: `)).trim().toLowerCase() !== 'n';

  rl.close();

  // ─── Copy + customize the template ────────────────────────────────────────
  const npmPackageName = targetDir.split('/').pop().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const peers = OWN_PACKAGE.peerDependencies || {};

  const replacements = {
    __NAME__: npmPackageName,
    __TITLE__: title,
    __DESCRIPTION__: description,
    __AUTHOR__: author,
    __SITE_URL__: siteUrl,
    __SCMS_VERSION__: OWN_PACKAGE.version,
    __ASTRO_VERSION__: bareVersion(peers.astro ?? '7.0.0'),
    __REACT_VERSION__: bareVersion(peers.react ?? '19.0.0'),
    __REACT_DOM_VERSION__: bareVersion(peers['react-dom'] ?? '19.0.0'),
    __MAPLIBRE_VERSION__: bareVersion(peers['maplibre-gl'] ?? '6.0.0'),
    __TYPES_REACT_VERSION__: bareVersion(peers['@types/react'] ?? '19.0.0'),
    __TYPES_REACT_DOM_VERSION__: bareVersion(peers['@types/react-dom'] ?? '19.0.0'),
  };

  copyTemplate(TEMPLATE_DIR, targetPath, replacements);
  ok(`Created ${relative(process.cwd(), targetPath) || '.'}/`);

  // ─── Install ───────────────────────────────────────────────────────────────
  if (installNow) {
    console.log('');
    console.log(`${B}Installing dependencies...${X}`);
    const result = spawnSync('npm', ['install'], { cwd: targetPath, stdio: 'inherit' });
    if (result.status !== 0) {
      warn('npm install failed — run it yourself once you\'ve reviewed the error above.');
    } else {
      ok('Dependencies installed');
    }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('');
  console.log(`${G}${B}Site scaffolded successfully!${X}`);
  console.log('');
  console.log(`  ${B}Next steps:${X}`);
  console.log(`    1. cd ${targetDir}`);
  if (!installNow) console.log(`    2. npm install`);
  console.log(`    ${installNow ? 2 : 3}. npm run dev`);
  console.log('');
}

main().catch((err) => error(String(err)));
