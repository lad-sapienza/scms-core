# Releasing @lad-sapienza/scms-core

Publishing is manual; there is no publish workflow. CI (`.github/workflows/ci.yml`)
runs typecheck, tests and the build e2e on every pull request and push to `main`.

## Choosing the version

While the package is `0.x`, `^0.1.x` only matches `0.1.*`, so:

- A **patch** (`0.1.x`) is picked up automatically by every site that depends on
  `^0.1.0`, including by patch-only Dependabot auto-merge. Use it only for
  changes no site can notice.
- Anything that needs a site to change something is at least a **minor**
  (`0.2.0`): a major bump of a runtime dependency (`astro`, `@astrojs/*`,
  `react`, `maplibre-gl`, `@directus/sdk`, ...), a removed or renamed export,
  and a peer range change that stops something installing that installs today.
  A peer change that only makes an already-effective constraint explicit (e.g.
  declaring the `astro` floor a dependency already imposes) may be a patch; say
  so in the CHANGELOG.

## Checklist

1. CI on `main` is green (`npm ci` in particular: it must not report an
   out-of-sync lockfile).
2. `CHANGELOG.md`: move "Unreleased" under the new version and date, with
   migration notes for sites.
3. Bump `version` in `package.json`; commit as `chore: release X.Y.Z` and tag
   `vX.Y.Z`.
4. `npm publish --dry-run`, check the file list. Use `--tag alpha` for prereleases.
5. Check the version is not already published (`npm view @lad-sapienza/scms-core versions`).
6. `npm publish`.

## Merging Dependabot pull requests

- Merge one at a time and wait for Dependabot to rebase the next one. Several
  squash merges in a row can leave `package-lock.json` out of sync with
  `package.json` without any textual conflict.
- Recommended repository setting: branch protection on `main` requiring the
  `test` and `e2e` checks and "Require branches to be up to date before merging".
- Runtime major bumps (see above) also mean a minor release.
