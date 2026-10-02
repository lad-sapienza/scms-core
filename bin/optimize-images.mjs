#!/usr/bin/env node
// optimize-images.mjs — Convert content images to WebP and rewrite their references.
// Usage: npx scms-optimize-images [--dry-run | --check] [--only <file>...]
//    or: npm run images (from a consuming site's package.json)

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { optimizeImages, resolveConfig } from './lib/optimize-images.mjs';

const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m';
const B = '\x1b[1m', X = '\x1b[0m';

const HELP = `scms-optimize-images — convert content JPG/PNG images to WebP

  scms-optimize-images                 convert, delete the originals, rewrite references
  scms-optimize-images --dry-run       report what would happen, touch nothing
  scms-optimize-images --check         touch nothing; exit 1 if anything is left to convert
                                       (JPG/PNG, WebP larger than the max size, stale code references).
                                       Meant for "prebuild" scripts and CI.
  scms-optimize-images --only <files>  limit conversion/checks to these image files
                                       (e.g. the ones staged in a pre-commit hook)

Settings live in src/user.config.mjs (userConfig.images, userConfig.i18n); see the scms-core README.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}
const dryRun = args.includes('--dry-run');
const check = args.includes('--check');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx === -1 ? null : args.slice(onlyIdx + 1).filter((a) => !a.startsWith('--'));
const unknown = args.filter((a) => a.startsWith('-') && !['--dry-run', '--check', '--only'].includes(a));
if (unknown.length) {
  console.error(`${R}✖${X}  Unknown option: ${unknown.join(' ')}\n\n${HELP}`);
  process.exit(2);
}
if (only && only.length === 0) {
  console.log('No files given to --only, nothing to do.');
  process.exit(0);
}

// This file ships inside the @lad-sapienza/scms-core package (bin/): the project is wherever it was run from.
const ROOT = process.cwd();
const configFile = path.join(ROOT, 'src', 'user.config.mjs');
let userConfig = {};
if (fs.existsSync(configFile)) {
  try {
    userConfig = (await import(pathToFileURL(configFile).href)).userConfig ?? {};
  } catch (err) {
    console.error(`${R}✖${X}  Cannot load src/user.config.mjs: ${err.message}`);
    process.exit(2);
  }
}

const config = resolveConfig(ROOT, userConfig);
if (!fs.existsSync(config.contentRoot)) {
  console.error(`${R}✖${X}  Content folder not found: ${config.contentRoot}`);
  process.exit(2);
}

const r = await optimizeImages(config, { dryRun, check, only });

const kb = (n) => (n / 1024).toFixed(0);
const mb = (n) => (n / 1048576).toFixed(1);
const list = (title, items) => items.length && console.log(`\n${title} (${items.length}):\n  ${items.join('\n  ')}`);
const tag = dryRun ? '[dry run] ' : '';

if (check) {
  list(`${R}JPG/PNG images to convert${X}`, r.pending);
  list(`${R}WebP images larger than ${config.maxSize}px${X}`, r.oversized);
} else {
  for (const c of r.converted) console.log(`${c.rel}: ${kb(c.before)} -> ${kb(c.after)} KB`);
  for (const c of r.resized) console.log(`${c.rel}: scaled to max ${config.maxSize}px, ${kb(c.before)} -> ${kb(c.after)} KB`);
  console.log(`\n${tag}${r.converted.length} images converted, ${r.resized.length} resized, ${r.rewritten} text files updated`);
  console.log(`Size: ${mb(r.before)} MB -> ${mb(r.after)} MB${r.before ? ` (-${(100 - (r.after / r.before) * 100).toFixed(0)}%)` : ''}`);
  list(`${B}Unused duplicates ${dryRun ? 'to delete' : 'deleted'}${X}`, r.dropped);
  list(`${Y}Skipped${X}`, r.skipped.map((s) => `${s.rel}: ${s.reason}`));
  list(`${Y}Converted but not referenced anywhere (check)${X}`, r.unreferenced);
  if (r.keptCount) console.log(`\n${r.keptCount} image(s) already evaluated and kept as they are (see .scms-optimize-images.json)`);
}

if (r.codeRefs.length) {
  const verb = { 'to-convert': 'will break once the image is converted', converted: 'is now broken: the image was converted', stale: 'points to an image that was converted earlier' };
  console.error(`\n${R}✖${X}  ${r.codeRefs.length} reference(s) in code must be updated by hand (code is never rewritten):`);
  for (const c of r.codeRefs) console.error(`  ${c.file}:${c.line}  ${c.ref} ${verb[c.kind]} → use ${c.replacement}`);
}

if (r.problems) {
  console.error(`\n${R}✖${X}  ${r.problems} problem(s) found.${check ? ' Run `npx scms-optimize-images` to fix the images.' : ''}`);
  process.exit(1);
}
if (check) console.log(`${G}✔${X}  Images are optimized.`);
