#!/usr/bin/env node
/**
 * Copy the Vercel deployment download into the correct project layout so
 * the app builds and runs as it appears in deployment.
 *
 * The download drops everything under an extra "src/" folder, so:
 *   vercel-deployment-download/src/          → project root (index.html, configs, public, etc.)
 *   vercel-deployment-download/src/src/      → project src/
 *
 * Usage:
 *   node scripts/align-download-to-project.mjs
 *   node scripts/align-download-to-project.mjs [path-to-download-folder]
 *
 * Default: reads from ./vercel-deployment-download
 * Does not touch: convex/, .env.local, .git, or existing scripts/*.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const downloadDir = path.resolve(root, process.argv[2] || 'vercel-deployment-download');
const downloadSrc = path.join(downloadDir, 'src');   // download "root" (has index.html, package.json, src/, dist/)
const downloadAppSrc = path.join(downloadSrc, 'src'); // app source (main.tsx, components/, etc.)

const ROOT_FILES = [
  'index.html',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'vercel.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'tailwind.config.js',
  'postcss.config.js',
];

const SKIP_SCRIPTS = new Set(['download-vercel-deployment.mjs', 'align-deployment-to-local.mjs', 'align-download-to-project.mjs']);

function copyFile(src, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirRecursive(srcDir, destDir, options = {}) {
  if (!fs.existsSync(srcDir)) return 0;
  const skip = options.skip || (() => false);
  let count = 0;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const srcPath = path.join(srcDir, e.name);
    const destPath = path.join(destDir, e.name);
    if (e.isDirectory()) {
      if (skip(e.name)) continue;
      if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
      count += copyDirRecursive(srcPath, destPath, options);
    } else {
      if (skip(e.name)) continue;
      copyFile(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function main() {
  console.log('Aligning Vercel download to project layout');
  console.log('Download folder:', downloadDir);
  console.log('Project root:   ', root);

  if (!fs.existsSync(downloadDir)) {
    console.error('Download folder does not exist. Run the download script first.');
    process.exit(1);
  }
  if (!fs.existsSync(downloadSrc)) {
    console.error('Expected download/src/ (project root in download). Not found.');
    process.exit(1);
  }
  if (!fs.existsSync(downloadAppSrc)) {
    console.error('Expected download/src/src/ (app source). Not found.');
    process.exit(1);
  }

  let copied = 0;

  // 1) Root-level files from download/src/ → project root
  console.log('\nCopying root files...');
  for (const name of ROOT_FILES) {
    const src = path.join(downloadSrc, name);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(root, name));
      console.log('  ', name);
      copied++;
    }
  }

  // 2) public/ from download/src/public/ → project public/
  const publicSrc = path.join(downloadSrc, 'public');
  if (fs.existsSync(publicSrc)) {
    console.log('\nCopying public/...');
    copied += copyDirRecursive(publicSrc, path.join(root, 'public'));
  }

  // 3) scripts/ from download: only add deployment scripts we don't have (don't overwrite .mjs)
  const scriptsSrc = path.join(downloadSrc, 'scripts');
  if (fs.existsSync(scriptsSrc)) {
    const scriptsDest = path.join(root, 'scripts');
    if (!fs.existsSync(scriptsDest)) fs.mkdirSync(scriptsDest, { recursive: true });
    const entries = fs.readdirSync(scriptsSrc, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (SKIP_SCRIPTS.has(e.name)) continue;
      copyFile(path.join(scriptsSrc, e.name), path.join(scriptsDest, e.name));
      console.log('  scripts/' + e.name);
      copied++;
    }
  }

  // 4) App source: download/src/src/ → project src/
  console.log('\nCopying src/ (app source)...');
  copied += copyDirRecursive(downloadAppSrc, path.join(root, 'src'));

  console.log('\nDone. Copied', copied, 'items. Run "npm install" and "npm run build" to build as deployment.');
}

main();
