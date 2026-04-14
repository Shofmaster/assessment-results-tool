import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const SEO_CONTENT_PATH = resolve(ROOT, 'src/seo/seoContent.ts');
const SITEMAP_PATH = resolve(ROOT, 'public/sitemap.xml');
const SITE_URL = 'https://aerogap.com';

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');

function extractSeoEntries(fileText) {
  const entries = [];
  const pattern = /\{\s*path:\s*'([^']+)'.*?type:\s*'(service|product|guide|article)'/gs;
  let match = pattern.exec(fileText);
  while (match) {
    entries.push({ path: match[1], type: match[2] });
    match = pattern.exec(fileText);
  }
  return entries;
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function freqAndPriority(type) {
  if (type === 'service' || type === 'product') {
    return { changefreq: 'weekly', priority: '0.9' };
  }
  if (type === 'guide') {
    return { changefreq: 'weekly', priority: '0.8' };
  }
  return { changefreq: 'monthly', priority: '0.7' };
}

function buildSitemap(entries) {
  const rows = [
    '  <url>',
    `    <loc>${SITE_URL}/</loc>`,
    '    <changefreq>weekly</changefreq>',
    '    <priority>1.0</priority>',
    '  </url>',
  ];

  for (const entry of entries) {
    const { changefreq, priority } = freqAndPriority(entry.type);
    rows.push('  <url>');
    rows.push(`    <loc>${xmlEscape(`${SITE_URL}${entry.path}`)}</loc>`);
    rows.push(`    <changefreq>${changefreq}</changefreq>`);
    rows.push(`    <priority>${priority}</priority>`);
    rows.push('  </url>');
  }

  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...rows, '</urlset>', ''].join('\n');
}

function main() {
  const content = readFileSync(SEO_CONTENT_PATH, 'utf8');
  const entries = extractSeoEntries(content);
  if (!entries.length) {
    throw new Error('No SEO page entries found in src/seo/seoContent.ts');
  }

  const sitemap = buildSitemap(entries);

  if (checkOnly) {
    const existing = readFileSync(SITEMAP_PATH, 'utf8');
    if (existing !== sitemap) {
      process.stderr.write(
        'Sitemap is out of sync. Run `npm run seo:sitemap:generate` and commit the updated public/sitemap.xml.\n',
      );
      process.exit(1);
    }
    process.stdout.write('Sitemap is in sync.\n');
    return;
  }

  writeFileSync(SITEMAP_PATH, sitemap, 'utf8');
  process.stdout.write(`Generated ${SITEMAP_PATH}\n`);
}

main();
