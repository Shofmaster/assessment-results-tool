#!/usr/bin/env node
/**
 * Download all files from a Vercel deployment via the REST API.
 *
 * Usage:
 *   VERCEL_TOKEN=xxx DEPLOYMENT_ID=yyy node scripts/download-vercel-deployment.mjs
 *   node scripts/download-vercel-deployment.mjs [deploymentId]
 *
 * Get your token: https://vercel.com/account/tokens
 * Deployment ID: from the deployment URL in Vercel dashboard, or from the deployment detail page.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'https://api.vercel.com';

const token = process.env.VERCEL_TOKEN;
const deploymentId = process.env.DEPLOYMENT_ID || process.argv[2];
const outDir = path.resolve(process.cwd(), process.env.OUT_DIR || 'vercel-deployment-download');

if (!token) {
  console.error('Missing VERCEL_TOKEN. Set it in the environment or create one at https://vercel.com/account/tokens');
  process.exit(1);
}
if (!deploymentId) {
  console.error('Missing DEPLOYMENT_ID. Set VERCEL_TOKEN and DEPLOYMENT_ID, or pass deployment ID as first argument.');
  process.exit(1);
}

async function fetchApi(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${url}\n${text}`);
  }
  return res.json();
}

/**
 * List deployment files (tree). GET /v6/deployments/:id/files
 */
async function listFiles() {
  return fetchApi(`/v6/deployments/${deploymentId}/files`);
}

/**
 * Get file content (base64). GET /v8/deployments/:id/files/:fileId
 * For Git deployments you may need ?path=...
 */
async function getFileContent(fileId, filePath) {
  const q = filePath ? `?path=${encodeURIComponent(filePath)}` : '';
  const data = await fetchApi(`/v8/deployments/${deploymentId}/files/${fileId}${q}`);
  // Response is the file content; doc says "base64" - may be raw base64 string or { content: "..." }
  const raw = typeof data === 'string' ? data : (data?.content ?? data?.data ?? '');
  if (!raw) throw new Error('Empty file content');
  return Buffer.from(raw, 'base64');
}

/**
 * Walk the file tree and download each file. Tree nodes: { name, type, uid?, children?, contentType? }
 */
async function walkAndDownload(tree, basePath = '') {
  if (!Array.isArray(tree)) {
    if (tree && typeof tree === 'object' && !Array.isArray(tree)) tree = [tree];
    else tree = [];
  }

  for (const node of tree) {
    const name = node.name || 'unknown';
    const fullPath = basePath ? path.join(basePath, name) : name;
    const type = node.type || 'file';

    if (type === 'directory') {
      const dirPath = path.join(outDir, fullPath);
      fs.mkdirSync(dirPath, { recursive: true });
      if (node.children && node.children.length) {
        await walkAndDownload(node.children, fullPath);
      }
      continue;
    }

    if (type === 'file' && node.uid) {
      const filePath = path.join(outDir, fullPath);
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      try {
        const content = await getFileContent(node.uid, fullPath);
        fs.writeFileSync(filePath, content);
        console.log('  ', fullPath);
      } catch (e) {
        console.error('  FAIL', fullPath, e.message);
      }
      continue;
    }

    // symlink, lambda, middleware, etc. - skip or log
    if (type !== 'file' && type !== 'directory') {
      console.log('  (skip)', fullPath, `[${type}]`);
    }
  }
}

async function main() {
  console.log('Deployment ID:', deploymentId);
  console.log('Output dir:   ', outDir);
  console.log('Listing files...');

  let tree;
  try {
    tree = await listFiles();
  } catch (e) {
    console.error('List files failed:', e.message);
    process.exit(1);
  }

  // API may return { files: [...] } or the array at top level
  const list = tree?.files ?? tree;
  if (!list || (Array.isArray(list) && list.length === 0)) {
    console.log('No files in response. If this deployment was from Git, the Files API may not be available for it.');
    console.log('Raw response:', JSON.stringify(tree, null, 2).slice(0, 500));
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  console.log('Downloading...');
  await walkAndDownload(list);
  console.log('Done. Output in:', outDir);

  // Optionally align downloaded files into dist/ so local structure is correct
  const shouldAlign = process.argv.includes('--align') || process.env.ALIGN_AFTER_DOWNLOAD === '1';
  if (shouldAlign) {
    console.log('\nAligning deployment to local dist/...');
    const { spawnSync } = await import('child_process');
    const alignScript = path.join(__dirname, 'align-deployment-to-local.mjs');
    const result = spawnSync(process.execPath, [alignScript, outDir], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..'),
    });
    if (result.status !== 0) process.exit(result.status || 1);
  } else {
    console.log('\nTo copy these files into dist/ and validate structure, run:');
    console.log('  node scripts/align-deployment-to-local.mjs');
    console.log('Or re-run the download with:  node scripts/download-vercel-deployment.mjs --align');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
