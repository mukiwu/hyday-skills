#!/usr/bin/env node
// Bump the version string in both Claude Code plugin manifests at once.
//
// Usage:
//   node scripts/bump-version.mjs <new-version>
//   node scripts/bump-version.mjs 0.2.0
//
// Why a script: the version lives in TWO places (.claude-plugin/marketplace.json
// and .claude-plugin/plugin.json) and forgetting to sync them on release will
// cause /plugin install to fetch a stale version label. This script keeps them
// in lockstep.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const newVersion = process.argv[2];

if (!newVersion) {
  console.error('Usage: node scripts/bump-version.mjs <new-version>');
  console.error('Example: node scripts/bump-version.mjs 0.2.0');
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(newVersion)) {
  console.error(`Error: version must look like X.Y.Z (optionally X.Y.Z-suffix), got "${newVersion}"`);
  process.exit(1);
}

const targets = [
  {
    path: `${repoRoot}/.claude-plugin/marketplace.json`,
    update: (json) => {
      if (!Array.isArray(json.plugins) || json.plugins.length === 0) {
        throw new Error('marketplace.json has no plugins[] entry to bump');
      }
      json.plugins[0].version = newVersion;
    },
  },
  {
    path: `${repoRoot}/.claude-plugin/plugin.json`,
    update: (json) => {
      json.version = newVersion;
    },
  },
];

for (const { path, update } of targets) {
  let json;
  try {
    json = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    console.error(`Failed to read/parse ${path}: ${err.message}`);
    process.exit(1);
  }
  update(json);
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  console.log(`✓ ${path.replace(repoRoot + '/', '')}`);
}

console.log(`
Bumped manifest version to v${newVersion}.

Next steps:
  git add .claude-plugin/
  git commit -m "chore: bump version to v${newVersion}"
  git push
  gh release create v${newVersion} \\
    --title "v${newVersion} — <one-line summary>" \\
    --notes "<changelog>"
`);
