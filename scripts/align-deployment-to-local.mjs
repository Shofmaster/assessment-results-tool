#!/usr/bin/env node
/**
 * After downloading a Vercel deployment, align the files so the local project
 * structure is correct: copy the downloaded build output into dist/ so that
 * "npm run preview" serves exactly what was deployed, and validate structure.
 *
 * Usage:
 *   node scripts/align-deployment-to-local.mjs
 *   node scripts/align-deployment-to-local.mjs [path-to-downloaded-folder]
 *
 * Default: reads from ./vercel-deployment-download, writes to ./dist
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const downloadDir = path.resolve(root, process.argv[2] || 'vercel-deployment-download');
const distDir = path.resolve(root, process.env.DIST_DIR || 'dist');

/** Recursively list all files in a directory (relative paths). */
function listFiles(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const rel = base ? path.join(base, e.name) : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...listFiles(full, rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}

/** Find the effective build root: directory that contains index.html (may be downloadDir or a subdir). */
function findBuildRoot(dir, depth = 0) {
  if (depth > 5) return null;
  const indexPath = path.join(dir, 'index.html');
  if (fs.existsSync(indexPath)) return dir;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      const found = findBuildRoot(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Validate: must have index.html and at least one script or asset for a Vite SPA. */
function validateStructure(dir) {
  const indexPath = path.join(dir, 'index.html');
  const issues = [];
  if (!fs.existsSync(indexPath)) {
    issues.push('Missing index.html at build root');
  } else {
    const html = fs.readFileSync(indexPath, 'utf8');
    if (!html.includes('root') && !html.includes('<script')) {
      issues.push('index.html may be invalid (no #root or script)');
    }
  }
  const hasAssets = fs.existsSync(path.join(dir, 'assets')) || listFiles(dir).some(f => f.endsWith('.js') || f.endsWith('.css'));
  if (!hasAssets) {
    issues.push('No assets/ or JS/CSS files found (deployment might be incomplete)');
  }
  return issues;
}

function main() {
  console.log('Download folder:', downloadDir);
  console.log('Target (dist): ', distDir);

  if (!fs.existsSync(downloadDir)) {
    console.error('Download folder does not exist. Run the download script first.');
    process.exit(1);
  }

  const buildRoot = findBuildRoot(downloadDir);
  if (!buildRoot) {
    console.error('No index.html found in download folder. Cannot determine build root.');
    process.exit(1);
  }

  const relativeRoot = path.relative(downloadDir, buildRoot);
  if (relativeRoot) {
    console.log('Build root (subdir):', relativeRoot);
  } else {
    console.log('Build root: (root of download)');
  }

  const validation = validateStructure(buildRoot);
  if (validation.length) {
    console.warn('Validation warnings:', validation);
  } else {
    console.log('Structure validation: OK');
  }

  // Clear dist and copy build root contents into dist
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  const files = listFiles(buildRoot);
  let copied = 0;
  for (const rel of files) {
    const src = path.join(buildRoot, rel);
    const dest = path.join(distDir, rel);
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
    copied++;
  }
  console.log('Copied', copied, 'files into', path.relative(root, distDir));

  // Final check: dist has index.html
  const distIndex = path.join(distDir, 'index.html');
  if (!fs.existsSync(distIndex)) {
    console.error('Failed: dist/index.html missing after copy.');
    process.exit(1);
  }
  console.log('Done. Run "npm run preview" to serve the deployment locally.');
}

main();
